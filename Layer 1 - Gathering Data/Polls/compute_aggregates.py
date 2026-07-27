#!/usr/bin/env python3
"""Stage 5 — Compute last3 and weighted poll aggregates."""

from __future__ import annotations

import logging
import math
from collections import defaultdict
from datetime import date, timedelta

from supabase import Client

from db import get_election_date, get_election_id, get_supabase, today_jerusalem

log = logging.getLogger(__name__)

TRAILING_DAYS = 30
WEIGHTED_WINDOW = 14
POLLSTER_CAP = 0.25
CAMPAIGN_HALF_LIFE = 6
OFF_CAMPAIGN_HALF_LIFE = 14
CAMPAIGN_DAYS = 90


def _half_life(election_date: date, as_of: date) -> float:
    days_to_election = (election_date - as_of).days
    return CAMPAIGN_HALF_LIFE if days_to_election <= CAMPAIGN_DAYS else OFF_CAMPAIGN_HALF_LIFE


def _time_weight(days_since: int, half_life: float) -> float:
    return math.exp(-math.log(2) * days_since / half_life)


def _cap_pollster_weights(weights: dict[int, float], pollster_by_poll: dict[int, str]) -> dict[int, float]:
    by_pollster: dict[str, float] = defaultdict(float)
    for poll_id, w in weights.items():
        by_pollster[pollster_by_poll[poll_id]] += w

    total = sum(weights.values()) or 1.0
    capped_total_by_pollster: dict[str, float] = {}
    for pollster, w_sum in by_pollster.items():
        capped_total_by_pollster[pollster] = min(w_sum, POLLSTER_CAP * total)

    scale: dict[str, float] = {}
    for pollster, w_sum in by_pollster.items():
        cap = capped_total_by_pollster[pollster]
        scale[pollster] = cap / w_sum if w_sum > 0 else 1.0

    return {pid: w * scale[pollster_by_poll[pid]] for pid, w in weights.items()}


def _compute_last3(polls: list[dict], results_by_poll: dict[int, list[dict]]) -> dict[int, tuple[float, int]]:
    regular = [p for p in polls if not p["is_scenario"]]
    regular.sort(key=lambda p: p["fieldwork_end"], reverse=True)
    recent = regular[:3]
    if not recent:
        return {}

    party_sums: dict[int, list[float]] = defaultdict(list)
    for poll in recent:
        for r in results_by_poll.get(poll["id"], []):
            if r["seats"] is not None:
                party_sums[r["party_id"]].append(float(r["seats"]))

    return {
        pid: (sum(vals) / len(recent), len(recent))
        for pid, vals in party_sums.items()
        if vals
    }


def _compute_weighted(
    polls: list[dict],
    results_by_poll: dict[int, list[dict]],
    as_of: date,
    election_date: date,
) -> dict[int, tuple[float, int]]:
    window_start = as_of - timedelta(days=WEIGHTED_WINDOW)
    regular = [
        p for p in polls
        if not p["is_scenario"]
        and date.fromisoformat(p["fieldwork_end"][:10]) >= window_start
        and date.fromisoformat(p["fieldwork_end"][:10]) <= as_of
    ]
    if not regular:
        return {}

    half_life = _half_life(election_date, as_of)
    pollster_by_poll = {p["id"]: p["pollster"] for p in regular}
    weights: dict[int, float] = {}
    for poll in regular:
        fw_end = date.fromisoformat(poll["fieldwork_end"][:10])
        days_since = (as_of - fw_end).days
        weights[poll["id"]] = _time_weight(days_since, half_life)

    weights = _cap_pollster_weights(weights, pollster_by_poll)
    total_w = sum(weights.values()) or 1.0

    party_weighted: dict[int, float] = defaultdict(float)
    party_poll_count: dict[int, int] = defaultdict(int)

    for poll in regular:
        w = weights[poll["id"]] / total_w
        for r in results_by_poll.get(poll["id"], []):
            if r["seats"] is not None:
                party_weighted[r["party_id"]] += w * float(r["seats"])
                party_poll_count[r["party_id"]] += 1

    return {
        pid: (avg, party_poll_count[pid])
        for pid, avg in party_weighted.items()
    }


def _fetch_all_poll_results(sb: Client, poll_ids: list[int]) -> list[dict]:
    """Paginate poll_results — Supabase caps at 1000 rows per request."""
    if not poll_ids:
        return []

    all_results: list[dict] = []
    chunk_size = 100
    page_size = 1000

    for i in range(0, len(poll_ids), chunk_size):
        chunk = poll_ids[i : i + chunk_size]
        offset = 0
        while True:
            batch = (
                sb.table("poll_results")
                .select("poll_id, party_id, seats")
                .in_("poll_id", chunk)
                .range(offset, offset + page_size - 1)
                .execute()
                .data
            ) or []
            all_results.extend(batch)
            if len(batch) < page_size:
                break
            offset += page_size

    return all_results


def run(sb: Client, dry_run: bool = False) -> list[date]:
    election_id = get_election_id(sb)
    election_date = get_election_date(sb)
    as_of_today = today_jerusalem()
    as_of_dates = [as_of_today - timedelta(days=i) for i in range(TRAILING_DAYS)]

    polls = (
        sb.table("polls")
        .select("id, pollster, fieldwork_end, is_scenario")
        .eq("election_id", election_id)
        .execute()
        .data
    ) or []

    if not polls:
        log.warning("No polls to aggregate")
        return as_of_dates

    poll_ids = [p["id"] for p in polls]
    all_results = _fetch_all_poll_results(sb, poll_ids)
    log.info("Loaded %d poll_results for %d polls", len(all_results), len(poll_ids))

    results_by_poll: dict[int, list[dict]] = defaultdict(list)
    for r in all_results:
        results_by_poll[r["poll_id"]].append(r)

    rows_to_upsert = []
    for as_of in as_of_dates:
        polls_as_of = [
            p for p in polls
            if date.fromisoformat(p["fieldwork_end"][:10]) <= as_of
        ]

        last3 = _compute_last3(polls_as_of, results_by_poll)
        for party_id, (avg, count) in last3.items():
            rows_to_upsert.append({
                "election_id": election_id,
                "party_id": party_id,
                "as_of_date": as_of.isoformat(),
                "method": "last3",
                "seats_avg": round(avg, 2),
                "poll_count": count,
            })

        weighted = _compute_weighted(polls_as_of, results_by_poll, as_of, election_date)
        for party_id, (avg, count) in weighted.items():
            rows_to_upsert.append({
                "election_id": election_id,
                "party_id": party_id,
                "as_of_date": as_of.isoformat(),
                "method": "weighted",
                "seats_avg": round(avg, 2),
                "poll_count": count,
            })

    if dry_run:
        log.info("[dry-run] Would upsert %d aggregate rows", len(rows_to_upsert))
        return as_of_dates

    for row in rows_to_upsert:
        sb.table("poll_aggregates").upsert(
            row,
            on_conflict="election_id,party_id,as_of_date,method",
        ).execute()

    log.info("Upserted %d aggregate rows for %d days", len(rows_to_upsert), len(as_of_dates))
    return as_of_dates


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s  %(levelname)-8s  %(message)s")
    run(get_supabase())

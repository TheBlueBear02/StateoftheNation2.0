#!/usr/bin/env python3
"""Stage 6 — Validate polls and aggregates; exit non-zero on hard failures."""

from __future__ import annotations

import logging
import sys
from collections import Counter
from datetime import date, timedelta

from supabase import Client

from db import get_election_id, get_supabase, today_jerusalem

log = logging.getLogger(__name__)

STALENESS_DAYS = 5
VOLUME_SPIKE_FACTOR = 3.0
VOLUME_WINDOW_WEEKS = 8
# Incremental runs only deep-check recent regular polls (avoids N+1 on full history).
RECENT_VALIDATE_DAYS = 45


def _validate_polls(
    sb: Client,
    election_id: int,
    *,
    full: bool = False,
) -> tuple[list[str], list[str]]:
    errors: list[str] = []
    soft_warnings: list[str] = []
    query = (
        sb.table("polls")
        .select("id, fieldwork_end, is_scenario")
        .eq("election_id", election_id)
        .eq("is_scenario", False)
    )
    if not full:
        cutoff = (today_jerusalem() - timedelta(days=RECENT_VALIDATE_DAYS)).isoformat()
        query = query.gte("fieldwork_end", cutoff)
    polls = query.execute().data or []

    today = today_jerusalem()
    if full:
        log.info("Validating %d regular poll(s) (full history)", len(polls))
    else:
        log.info(
            "Validating %d regular poll(s) with fieldwork_end ≥ %s",
            len(polls),
            cutoff,
        )

    for poll in polls:
        fw_end = date.fromisoformat(poll["fieldwork_end"][:10])
        if fw_end > today:
            errors.append(f"Poll {poll['id']}: fieldwork_end {fw_end} is in the future")

        results = (
            sb.table("poll_results")
            .select("seats, party_id")
            .eq("poll_id", poll["id"])
            .execute()
            .data
        ) or []

        seat_sum = sum(r["seats"] or 0 for r in results)
        if abs(seat_sum - 120) > 1:
            errors.append(f"Poll {poll['id']}: seat sum is {seat_sum}, expected 120")
        elif seat_sum != 120:
            # ±1 is common Wikipedia rounding for seat projections
            soft_warnings.append(
                f"Poll {poll['id']}: seat sum is {seat_sum}, expected 120 (±1 OK)"
            )

        max_seats = max((r["seats"] or 0 for r in results), default=0)
        if max_seats > 45:
            errors.append(f"Poll {poll['id']}: party has {max_seats} seats (>45)")

        non_null = sum(1 for r in results if r["seats"] is not None or r.get("vote_share"))
        if non_null < 10:
            errors.append(f"Poll {poll['id']}: only {non_null} parties with results (<10)")

    return errors, soft_warnings


def _check_staleness(sb: Client, election_id: int) -> str | None:
    today = today_jerusalem()
    cutoff = today - timedelta(days=STALENESS_DAYS)

    recent = (
        sb.table("polls")
        .select("fieldwork_end")
        .eq("election_id", election_id)
        .eq("is_scenario", False)
        .gte("fieldwork_end", cutoff.isoformat())
        .limit(1)
        .execute()
        .data
    )
    if not recent:
        return f"No regular poll with fieldwork_end within {STALENESS_DAYS} days (since {cutoff})"
    return None


def _check_volume(sb: Client, election_id: int) -> str | None:
    today = today_jerusalem()
    window_start = today - timedelta(weeks=VOLUME_WINDOW_WEEKS)

    polls = (
        sb.table("polls")
        .select("fieldwork_end")
        .eq("election_id", election_id)
        .eq("is_scenario", False)
        .gte("fieldwork_end", window_start.isoformat())
        .execute()
        .data
    ) or []

    if len(polls) < 2:
        return None

    weekly_counts: Counter[str] = Counter()
    for p in polls:
        fw = date.fromisoformat(p["fieldwork_end"][:10])
        week_key = fw.isocalendar()[:2]
        weekly_counts[str(week_key)] += 1

    counts = list(weekly_counts.values())
    mean = sum(counts) / len(counts)
    this_week = weekly_counts.get(str(today.isocalendar()[:2]), 0)

    if mean > 0 and this_week > VOLUME_SPIKE_FACTOR * mean:
        return f"Weekly poll count {this_week} exceeds {VOLUME_SPIKE_FACTOR}x trailing mean {mean:.1f}"
    return None


def run(
    sb: Client,
    as_of_dates: list[date] | None = None,
    dry_run: bool = False,
    *,
    full: bool = False,
) -> tuple[int, list[str]]:
    """Validate polls. Returns (exit_code, diagnostic messages).

    Hard data errors → exit 1 and roll back aggregates for this run's as_of dates.
    Ops / soft warnings (staleness, volume, seat sum ±1) → logged, exit 0 so
    scheduled CI stays green when the sync itself succeeded.
    """
    election_id = get_election_id(sb)
    data_errors, soft_warnings = _validate_polls(sb, election_id, full=full)
    ops_warnings: list[str] = list(soft_warnings)
    diagnostics: list[str] = []

    stale = _check_staleness(sb, election_id)
    if stale:
        ops_warnings.append(stale)

    volume = _check_volume(sb, election_id)
    if volume:
        ops_warnings.append(volume)

    if data_errors:
        log.error("Data validation failed (%d errors):", len(data_errors))
        for err in data_errors[:20]:
            log.error("  %s", err)
            diagnostics.append(f"ERROR: {err}")
        if not dry_run and as_of_dates:
            for as_of in as_of_dates:
                sb.table("poll_aggregates").delete().eq("election_id", election_id).eq(
                    "as_of_date", as_of.isoformat()
                ).execute()
        return 1, diagnostics

    if ops_warnings:
        log.warning("Ops alerts (%d):", len(ops_warnings))
        for w in ops_warnings:
            log.warning("  %s", w)
            diagnostics.append(f"WARNING: {w}")
        return 0, diagnostics

    log.info("Validation passed")
    return 0, diagnostics


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s  %(levelname)-8s  %(message)s")
    code, _ = run(get_supabase())
    sys.exit(code)

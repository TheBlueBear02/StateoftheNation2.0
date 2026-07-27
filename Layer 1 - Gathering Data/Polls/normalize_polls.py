#!/usr/bin/env python3
"""Stage 4 — Normalize raw poll rows into polls + poll_results."""

from __future__ import annotations

import logging
import re
from datetime import date, datetime, timezone

from supabase import Client

from db import get_election_id, get_supabase

log = logging.getLogger(__name__)

MONTHS = {
    "jan": 1, "feb": 2, "mar": 3, "apr": 4, "may": 5, "jun": 6,
    "jul": 7, "aug": 8, "sep": 9, "oct": 10, "nov": 11, "dec": 12,
    "january": 1, "february": 2, "march": 3, "april": 4, "june": 6,
    "july": 7, "august": 8, "september": 9, "october": 10, "november": 11, "december": 12,
}


def _parse_int(raw: str) -> int | None:
    if not raw:
        return None
    m = re.search(r"[\d,]+", raw.replace(",", ""))
    return int(m.group()) if m else None


def _parse_margin(raw: str) -> float | None:
    if not raw:
        return None
    m = re.search(r"([\d.]+)", raw)
    return float(m.group(1)) if m else None


def _parse_date_part(text: str, default_year: int) -> date | None:
    text = text.strip()
    m = re.match(r"(\d{1,2})\s+([A-Za-z]+)(?:\s+(\d{2,4}))?", text)
    if not m:
        m2 = re.match(r"(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})", text)
        if m2:
            day, mon, yr = int(m2.group(1)), m2.group(2)[:3].lower(), int(m2.group(3))
            return date(yr, MONTHS.get(mon, 1), day)
        return None
    day = int(m.group(1))
    mon = m.group(2)[:3].lower()
    yr = m.group(3)
    year = default_year
    if yr:
        year = int(yr) if len(yr) == 4 else 2000 + int(yr)
    return date(year, MONTHS.get(mon, 1), day)


def parse_fieldwork(fieldwork_raw: str, page_year_hint: int) -> tuple[date, date]:
    """Parse fieldwork date range from Wikipedia strings."""
    raw = fieldwork_raw.replace("–", "-").replace("—", "-").strip()
    parts = [p.strip() for p in raw.split("-") if p.strip()]

    if len(parts) == 1:
        d = _parse_date_part(parts[0], page_year_hint)
        if not d:
            raise ValueError(f"Cannot parse date: {fieldwork_raw}")
        return d, d

    start = _parse_date_part(parts[0], page_year_hint)
    end = _parse_date_part(parts[-1], page_year_hint)
    if not start or not end:
        raise ValueError(f"Cannot parse date range: {fieldwork_raw}")

    # Year-boundary without explicit years: "31 Dec – 1 Jan" on a 2026 page → Dec 2025 / Jan 2026
    if start.month == 12 and end.month == 1 and end < start:
        start = date(page_year_hint - 1, start.month, start.day)
        end = date(page_year_hint, end.month, end.day)
        return start, end

    # Other rollovers (e.g. explicit years on both sides)
    if end < start:
        end = date(start.year + 1, end.month, end.day)

    return start, end


def _normalize_pollster(name: str) -> str:
    return re.sub(r"\s+", " ", name.strip())


POLLSTER_HE = {
    "Midgam": "מידגם",
    "Lazar": "מנחם לזר",
    "Filber": "שלמה פילבר",
    "Panels Politics": "פאנלס פוליטיקס",
    "Kantar": "קנטר",
    "Smith": "סמית",
    "Direct Polls": "דירקט פולס",
    "Maagar Mohot": "מagar מוחות",
}


def run(sb: Client, dry_run: bool = False) -> int:
    election_id = get_election_id(sb)
    pending = (
        sb.table("raw_poll_rows")
        .select("*")
        .eq("status", "pending")
        .execute()
        .data
    ) or []

    processed = 0
    last_end_by_section: dict[str, date] = {}

    for row in pending:
        payload = row["payload"]
        if "resolved_parties" not in payload:
            continue

        try:
            fw_start, fw_end = parse_fieldwork(
                payload["fieldwork_raw"],
                payload.get("page_year_hint", 2026),
            )
        except ValueError as exc:
            log.warning("Date parse failed row %d: %s", row["id"], exc)
            if not dry_run:
                sb.table("raw_poll_rows").update({
                    "status": "rejected",
                    "error": str(exc),
                }).eq("id", row["id"]).execute()
            continue

        section = row.get("section", "")
        if section in last_end_by_section and fw_end > last_end_by_section[section]:
            log.warning("Monotonicity violation in %s: %s after %s", section, fw_end, last_end_by_section[section])
        last_end_by_section[section] = fw_end

        pollster = _normalize_pollster(payload.get("pollster", ""))
        publisher = _normalize_pollster(payload.get("publisher", ""))
        natural_key = row["natural_key"]

        poll_row = {
            "election_id": election_id,
            "natural_key": natural_key,
            "raw_poll_row_id": row["id"],
            "pollster": pollster,
            "pollster_he": POLLSTER_HE.get(pollster),
            "publisher": publisher,
            "fieldwork_start": fw_start.isoformat(),
            "fieldwork_end": fw_end.isoformat(),
            "sample_size": _parse_int(payload.get("sample_raw", "")),
            "margin_of_error": _parse_margin(payload.get("margin_raw", "")),
            "is_scenario": payload.get("is_scenario", False),
            "scenario_desc": payload.get("scenario_desc"),
            "source_revid": row["revid"],
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }

        if dry_run:
            processed += 1
            continue

        existing = (
            sb.table("polls")
            .select("id, raw_poll_row_id")
            .eq("natural_key", natural_key)
            .execute()
            .data
        )

        if existing:
            poll_id = existing[0]["id"]
            old_raw_id = existing[0].get("raw_poll_row_id")
            if old_raw_id and old_raw_id != row["id"]:
                sb.table("raw_poll_rows").update({"status": "superseded"}).eq("id", old_raw_id).execute()
            sb.table("poll_results").delete().eq("poll_id", poll_id).execute()
            sb.table("polls").update(poll_row).eq("id", poll_id).execute()
        else:
            result = sb.table("polls").insert(poll_row).execute()
            poll_id = result.data[0]["id"]

        results = []
        by_party: dict[int, dict] = {}
        for label, party_id in payload["resolved_parties"].items():
            pr = payload["party_results"].get(label, {})
            incoming = {
                "poll_id": poll_id,
                "party_id": party_id,
                "seats": pr.get("seats"),
                "vote_share": pr.get("vote_share"),
                "below_threshold": pr.get("below_threshold"),
            }
            existing = by_party.get(party_id)
            if existing is None:
                by_party[party_id] = incoming
                continue

            # Multiple Wikipedia columns can resolve to the same party
            # (e.g. RZP + Zionist Home). Sum seats; never let a below-threshold
            # column wipe a seat count from a sibling column.
            seats_a = existing.get("seats")
            seats_b = incoming.get("seats")
            if seats_a is not None and seats_b is not None:
                seats = seats_a + seats_b
            elif seats_a is not None:
                seats = seats_a
            else:
                seats = seats_b

            vote_share = existing.get("vote_share")
            if vote_share is None:
                vote_share = incoming.get("vote_share")

            below = None
            if seats is None:
                below = bool(
                    existing.get("below_threshold") or incoming.get("below_threshold")
                ) or None

            by_party[party_id] = {
                "poll_id": poll_id,
                "party_id": party_id,
                "seats": seats,
                "vote_share": vote_share,
                "below_threshold": below,
            }
        results = list(by_party.values())

        if results:
            sb.table("poll_results").insert(results).execute()

        # Update party polled date range
        party_ids = list(payload["resolved_parties"].values())
        for pid in party_ids:
            party = sb.table("election_parties").select("first_polled_date, last_polled_date").eq("id", pid).execute().data
            if not party:
                continue
            p = party[0]
            updates = {}
            if not p.get("first_polled_date") or fw_end.isoformat() < p["first_polled_date"]:
                updates["first_polled_date"] = fw_start.isoformat()
            if not p.get("last_polled_date") or fw_end.isoformat() > p["last_polled_date"]:
                updates["last_polled_date"] = fw_end.isoformat()
            if updates:
                sb.table("election_parties").update(updates).eq("id", pid).execute()

        sb.table("raw_poll_rows").update({"status": "processed"}).eq("id", row["id"]).execute()
        processed += 1

    log.info("Normalized %d poll rows", processed)
    return processed


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s  %(levelname)-8s  %(message)s")
    run(get_supabase())

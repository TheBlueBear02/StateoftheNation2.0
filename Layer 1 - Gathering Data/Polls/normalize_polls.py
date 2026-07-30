#!/usr/bin/env python3
"""Stage 4 — Normalize raw poll rows into polls + poll_results."""

from __future__ import annotations

import logging
import re
from datetime import date, datetime, timezone

from supabase import Client

from db import get_election_id, get_supabase, resolve_publisher_id

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
    # "29 - 30 Jul" → start is day-only; inherit month/year from the end date.
    if not start and end and parts[0].isdigit():
        day = int(parts[0])
        try:
            start = date(end.year, end.month, day)
        except ValueError as exc:
            raise ValueError(f"Cannot parse date range: {fieldwork_raw}") from exc
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
    cleaned = re.sub(r"\s*\[[^\]]*\]\s*", " ", name or "")
    return re.sub(r"\s+", " ", cleaned).strip()


def _poll_identity_key(
    *,
    fieldwork_end: str,
    pollster: str,
    publisher: str,
    sample_size: int | None,
    is_scenario: bool,
    scenario_desc: str | None,
) -> str:
    return "|".join(
        [
            fieldwork_end,
            _normalize_pollster(pollster),
            _normalize_pollster(publisher),
            str(sample_size if sample_size is not None else ""),
            "1" if is_scenario else "0",
            (scenario_desc or "") if is_scenario else "",
        ]
    )


def find_existing_poll(
    sb: Client,
    *,
    natural_key: str,
    fieldwork_end: str,
    pollster: str,
    publisher: str,
    sample_size: int | None,
    is_scenario: bool,
    scenario_desc: str | None,
) -> dict | None:
    by_key = (
        sb.table("polls")
        .select("id, raw_poll_row_id, natural_key, source_revid, publisher")
        .eq("natural_key", natural_key)
        .limit(1)
        .execute()
        .data
    )
    if by_key:
        return by_key[0]

    # Legacy rows may still carry footnote markers in publisher / old natural_keys.
    candidates = (
        sb.table("polls")
        .select(
            "id, raw_poll_row_id, natural_key, source_revid, publisher, "
            "pollster, sample_size, is_scenario, scenario_desc, fieldwork_end"
        )
        .eq("fieldwork_end", fieldwork_end)
        .eq("is_scenario", is_scenario)
        .execute()
        .data
    ) or []

    target = _poll_identity_key(
        fieldwork_end=fieldwork_end,
        pollster=pollster,
        publisher=publisher,
        sample_size=sample_size,
        is_scenario=is_scenario,
        scenario_desc=scenario_desc,
    )
    for row in candidates:
        if (
            _poll_identity_key(
                fieldwork_end=row["fieldwork_end"],
                pollster=row.get("pollster") or "",
                publisher=row.get("publisher") or "",
                sample_size=row.get("sample_size"),
                is_scenario=bool(row.get("is_scenario")),
                scenario_desc=row.get("scenario_desc"),
            )
            == target
        ):
            return row
    return None


def dedupe_polls(sb: Client, election_id: int) -> int:
    """Keep newest poll per logical identity; delete footnote-renumber duplicates."""
    rows = (
        sb.table("polls")
        .select(
            "id, natural_key, pollster, publisher, fieldwork_end, sample_size, "
            "is_scenario, scenario_desc, source_revid, raw_poll_row_id, created_at"
        )
        .eq("election_id", election_id)
        .execute()
        .data
    ) or []

    groups: dict[str, list[dict]] = {}
    for row in rows:
        key = _poll_identity_key(
            fieldwork_end=row["fieldwork_end"],
            pollster=row.get("pollster") or "",
            publisher=row.get("publisher") or "",
            sample_size=row.get("sample_size"),
            is_scenario=bool(row.get("is_scenario")),
            scenario_desc=row.get("scenario_desc"),
        )
        groups.setdefault(key, []).append(row)

    deleted = 0
    for group in groups.values():
        if len(group) < 2:
            # Still scrub footnote markers from kept singleton publishers.
            keep = group[0]
            cleaned_publisher = _normalize_pollster(keep.get("publisher") or "")
            cleaned_pollster = _normalize_pollster(keep.get("pollster") or "")
            updates = {}
            if cleaned_publisher != (keep.get("publisher") or ""):
                updates["publisher"] = cleaned_publisher
            if cleaned_pollster != (keep.get("pollster") or ""):
                updates["pollster"] = cleaned_pollster
            if updates:
                sb.table("polls").update(updates).eq("id", keep["id"]).execute()
            continue

        group.sort(
            key=lambda r: (
                r.get("source_revid") or 0,
                r.get("created_at") or "",
                r.get("id") or 0,
            ),
            reverse=True,
        )
        keep = group[0]
        cleaned_publisher = _normalize_pollster(keep.get("publisher") or "")
        cleaned_pollster = _normalize_pollster(keep.get("pollster") or "")
        keep_updates = {}
        if cleaned_publisher != (keep.get("publisher") or ""):
            keep_updates["publisher"] = cleaned_publisher
        if cleaned_pollster != (keep.get("pollster") or ""):
            keep_updates["pollster"] = cleaned_pollster
        if keep_updates:
            sb.table("polls").update(keep_updates).eq("id", keep["id"]).execute()

        for dup in group[1:]:
            raw_id = dup.get("raw_poll_row_id")
            if raw_id:
                sb.table("raw_poll_rows").update({"status": "superseded"}).eq(
                    "id", raw_id
                ).execute()
            sb.table("poll_results").delete().eq("poll_id", dup["id"]).execute()
            sb.table("polls").delete().eq("id", dup["id"]).execute()
            deleted += 1
            log.info(
                "Deduped poll %s (kept %s) — %s / %s / %s",
                dup["id"],
                keep["id"],
                dup.get("fieldwork_end"),
                dup.get("pollster"),
                dup.get("publisher"),
            )

    if deleted:
        log.info("Removed %d duplicate polls", deleted)
    return deleted


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


def run(sb: Client, dry_run: bool = False) -> dict[str, int]:
    """Normalize pending raw rows. Returns counts: processed, inserted, updated."""
    election_id = get_election_id(sb)
    pending = (
        sb.table("raw_poll_rows")
        .select("*")
        .eq("status", "pending")
        .execute()
        .data
    ) or []

    processed = 0
    inserted = 0
    updated = 0
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
        sample_size = _parse_int(payload.get("sample_raw", ""))
        is_scenario = bool(payload.get("is_scenario", False))
        scenario_desc = payload.get("scenario_desc")

        poll_row = {
            "election_id": election_id,
            "natural_key": natural_key,
            "raw_poll_row_id": row["id"],
            "pollster": pollster,
            "pollster_he": POLLSTER_HE.get(pollster),
            "publisher": publisher,
            "publisher_id": None if dry_run else resolve_publisher_id(sb, publisher),
            "fieldwork_start": fw_start.isoformat(),
            "fieldwork_end": fw_end.isoformat(),
            "sample_size": sample_size,
            "margin_of_error": _parse_margin(payload.get("margin_raw", "")),
            "is_scenario": is_scenario,
            "scenario_desc": scenario_desc,
            "source_revid": row["revid"],
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }

        if dry_run:
            processed += 1
            continue

        existing = find_existing_poll(
            sb,
            natural_key=natural_key,
            fieldwork_end=fw_end.isoformat(),
            pollster=pollster,
            publisher=publisher,
            sample_size=sample_size,
            is_scenario=is_scenario,
            scenario_desc=scenario_desc,
        )

        if existing:
            poll_id = existing["id"]
            old_raw_id = existing.get("raw_poll_row_id")
            if old_raw_id and old_raw_id != row["id"]:
                sb.table("raw_poll_rows").update({"status": "superseded"}).eq(
                    "id", old_raw_id
                ).execute()
            sb.table("poll_results").delete().eq("poll_id", poll_id).execute()
            sb.table("polls").update(poll_row).eq("id", poll_id).execute()
            updated += 1
        else:
            result = sb.table("polls").insert(poll_row).execute()
            poll_id = result.data[0]["id"]
            inserted += 1

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
            # (e.g. alternate spellings of one label). Sum seats; never let a
            # below-threshold column wipe a seat count from a sibling column.
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

    if not dry_run:
        dedupe_polls(sb, election_id)

    log.info(
        "Normalized %d poll rows (%d inserted, %d updated)",
        processed,
        inserted,
        updated,
    )
    return {"processed": processed, "inserted": inserted, "updated": updated}


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s  %(levelname)-8s  %(message)s")
    run(get_supabase())

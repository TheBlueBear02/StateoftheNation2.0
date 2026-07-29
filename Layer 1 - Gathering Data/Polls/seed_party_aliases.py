#!/usr/bin/env python3
"""
seed_party_aliases.py — Time-scoped English Wikipedia label → party_id mappings
and party_lineage events for honest trend lines.
"""

from __future__ import annotations

import argparse
import logging
from datetime import date

from dotenv import load_dotenv
from supabase import Client

from db import get_election_id, get_supabase, party_id_by_short_name

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger(__name__)

# raw_label (English Wikipedia) → short_name (Hebrew key), optional date window
ALIASES = [
    # Likud
    {"raw_label": "Likud", "short_name": "הליכוד"},
    {"raw_label": "Likud–Religious Zionism–Otzma Yehudit", "short_name": "הליכוד"},
    # Yesh Atid
    {"raw_label": "Yesh Atid", "short_name": "יש עתיד"},
    # Joint NU+YA column (historical — one label, one party, one window)
    {
        "raw_label": "Yesh Atid–National Unity",
        "short_name": "המחנה הממלכתי",
        "valid_to": "2024-03-31",
        "note": "Combined column when National Unity and Yesh Atid ran jointly",
    },
    # Religious Zionism / Otzma
    {"raw_label": "Religious Zionism", "short_name": "הציונות הדתית"},
    {"raw_label": "Religious Zionism–Otzma Yehudit", "short_name": "הציונות הדתית"},
    {"raw_label": "National Religious Party–Religious Zionism", "short_name": "הציונות הדתית"},
    {"raw_label": "Otzma Yehudit", "short_name": "עוצמה יהודית"},
    {"raw_label": "Jewish Power", "short_name": "עוצמה יהודית"},
    # Haredi
    {"raw_label": "Shas", "short_name": "ש״ס"},
    {"raw_label": "United Torah Judaism", "short_name": "יהדות התורה"},
    {"raw_label": "UTJ", "short_name": "יהדות התורה"},
    # Secular right / center
    {"raw_label": "Yisrael Beiteinu", "short_name": "ישראל ביתנו"},
    {"raw_label": "Israel Beiteinu", "short_name": "ישראל ביתנו"},
    # Arab parties
    {"raw_label": "Ra'am", "short_name": "רע״ם"},
    {"raw_label": "Raam", "short_name": "רע״ם"},
    {"raw_label": "Hadash–Ta'al", "short_name": "חד״ש-תע״ל"},
    {"raw_label": "Hadash-Ta'al", "short_name": "חד״ש-תע״ל"},
    {"raw_label": "Balad", "short_name": "בל״ד"},
    # Democrats (post-merger)
    {"raw_label": "The Democrats", "short_name": "הדמוקרטים", "valid_from": "2024-07-01"},
    {"raw_label": "Democrats", "short_name": "הדמוקרטים", "valid_from": "2024-07-01"},
    # Labor / Meretz (pre-merger)
    {"raw_label": "Labor", "short_name": "עבודה", "valid_to": "2024-06-30"},
    {"raw_label": "Meretz", "short_name": "מרצ", "valid_to": "2024-06-30"},
    # National Unity / New Hope split
    {"raw_label": "National Unity", "short_name": "המחנה הממלכתי", "valid_to": "2024-03-31"},
    {"raw_label": "New Hope", "short_name": "תקווה חדשה", "valid_from": "2024-04-01"},
    # Historical
    {"raw_label": "Blue and White", "short_name": "כחול לבן", "valid_to": "2022-12-31"},
    {"raw_label": "Blue & White", "short_name": "כחול לבן", "valid_to": "2022-12-31"},
    {
        "raw_label": "National Unity–Yesh Atid",
        "short_name": "המחנה הממלכתי",
        "valid_to": "2024-03-31",
        "note": "Reverse-order combined column (same bloc as Yesh Atid–National Unity)",
    },
    # Noam
    {"raw_label": "Noam", "short_name": "נועם"},
    # Wikipedia table abbreviations (2024–2026 seat-projection columns)
    {"raw_label": "RZP", "short_name": "הציונות הדתית"},
    {"raw_label": "Dems", "short_name": "הדמוקרטים", "valid_from": "2024-07-01"},
    {"raw_label": "Otzma", "short_name": "עוצמה יהודית"},
    {"raw_label": "Together", "short_name": "ביחד"},
    {"raw_label": "Zionist Home", "short_name": "הציונות הדתית"},
    {"raw_label": "Reserv.", "short_name": "מילואימניקים"},
    {"raw_label": "Reserv", "short_name": "מילואימניקים"},
    {"raw_label": "Hadash –Ta'al", "short_name": "חד״ש-תע״ל"},
    {"raw_label": "Hadash – Ta'al", "short_name": "חד״ש-תע״ל"},
    {"raw_label": "Hadash– Ta'al", "short_name": "חד״ש-תע״ל"},
    {"raw_label": "YA", "short_name": "יש עתיד"},
    {"raw_label": "YB", "short_name": "ישראל ביתנו"},
    {"raw_label": "B&W", "short_name": "כחול לבן", "valid_to": "2022-12-31"},
    {"raw_label": "NU", "short_name": "המחנה הממלכתי", "valid_to": "2024-03-31"},
    # Joint List is a Wikipedia group header only — sub-columns Hadash–Ta'al / Balad are parsed separately.
    {"raw_label": "Labor–Meretz", "short_name": "הדמוקרטים", "valid_from": "2024-07-01"},
    {"raw_label": "Labor-Meretz", "short_name": "הדמוקרטים", "valid_from": "2024-07-01"},
    # polled_only
    {"raw_label": "Bennett 2026", "short_name": "בנט 2026"},
    {"raw_label": "Yashar", "short_name": "ישר"},
    {"raw_label": "Reservists", "short_name": "מילואימניקים"},
    {"raw_label": "Reservists on Duty", "short_name": "מילואימניקים"},
]

LINEAGE = [
    {
        "predecessor": "עבודה",
        "successor": "הדמוקרטים",
        "event_date": "2024-07-01",
        "event_type": "merge",
        "note": "Labor and Meretz merged into The Democrats",
    },
    {
        "predecessor": "מרצ",
        "successor": "הדמוקרטים",
        "event_date": "2024-07-01",
        "event_type": "merge",
        "note": "Labor and Meretz merged into The Democrats",
    },
    {
        "predecessor": "המחנה הממלכתי",
        "successor": "תקווה חדשה",
        "event_date": "2024-04-01",
        "event_type": "split",
        "note": "New Hope split from National Unity",
    },
    {
        "predecessor": "כחול לבן",
        "successor": None,
        "event_date": "2022-11-01",
        "event_type": "dissolve",
        "note": "Blue and White dissolved",
    },
]


# Elections list import uses different short_name spellings than seed_parties.
HADASH_SHORT_NAME_FALLBACKS = ("חד״ש-תע״ל", 'חד"ש תע"ל', 'חד"ש-תע"ל')
RAAM_SHORT_NAME_FALLBACKS = ("רע״ם", 'רע"ם')


def _find_party_id(party_map: dict[str, int], short_name: str) -> int | None:
    """Resolve party_id even when DB short_name differs from seed key."""
    if short_name in party_map:
        return party_map[short_name]

    if short_name in HADASH_SHORT_NAME_FALLBACKS:
        for candidate in HADASH_SHORT_NAME_FALLBACKS:
            if candidate in party_map:
                return party_map[candidate]
        for key, party_id in party_map.items():
            if "חד" in key and "תע" in key:
                return party_id

    if short_name in RAAM_SHORT_NAME_FALLBACKS:
        for candidate in RAAM_SHORT_NAME_FALLBACKS:
            if candidate in party_map:
                return party_map[candidate]
        for key, party_id in party_map.items():
            if "רע" in key and "ם" in key:
                return party_id

    return None


def _find_alias_row(sb: Client, raw_label: str, valid_from: str | None) -> dict | None:
    """Lookup by unique key (raw_label, valid_from) — matches poll_party_aliases_label_from_key."""
    query = sb.table("poll_party_aliases").select("id").eq("raw_label", raw_label)
    if valid_from:
        query = query.eq("valid_from", valid_from)
    else:
        query = query.is_("valid_from", "null")
    rows = query.execute().data
    return rows[0] if rows else None


def run(sb: Client, dry_run: bool = False) -> None:
    election_id = get_election_id(sb)
    party_map = party_id_by_short_name(sb, election_id)

    for alias in ALIASES:
        party_id = _find_party_id(party_map, alias["short_name"])
        if not party_id:
            log.warning("Party not found for short_name=%s", alias["short_name"])
            continue

        valid_from = alias.get("valid_from")
        row = {
            "raw_label": alias["raw_label"],
            "party_id": party_id,
            "valid_from": valid_from,
            "valid_to": alias.get("valid_to"),
            "note": alias.get("note"),
        }
        if dry_run:
            log.info("[dry-run] alias %s → %s", alias["raw_label"], alias["short_name"])
            continue

        existing = _find_alias_row(sb, alias["raw_label"], valid_from)
        if existing:
            sb.table("poll_party_aliases").update(row).eq("id", existing["id"]).execute()
        else:
            sb.table("poll_party_aliases").insert(row).execute()
        log.info("Alias %s → party_id=%d", alias["raw_label"], party_id)

    for event in LINEAGE:
        pred_id = party_map.get(event["predecessor"]) if event.get("predecessor") else None
        succ_id = party_map.get(event["successor"]) if event.get("successor") else None
        if event.get("predecessor") and not pred_id:
            log.warning("Predecessor not found: %s", event["predecessor"])
            continue

        row = {
            "predecessor_id": pred_id,
            "successor_id": succ_id,
            "event_date": event["event_date"],
            "event_type": event["event_type"],
            "note": event.get("note"),
        }
        if dry_run:
            log.info("[dry-run] lineage %s", event)
            continue

        existing = (
            sb.table("party_lineage")
            .select("id")
            .eq("predecessor_id", pred_id)
            .eq("event_date", event["event_date"])
            .eq("event_type", event["event_type"])
            .execute()
            .data
        )
        if not existing:
            sb.table("party_lineage").insert(row).execute()
            log.info("Lineage event: %s on %s", event["event_type"], event["event_date"])


def main():
    parser = argparse.ArgumentParser(description="Seed poll party aliases and lineage")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    run(get_supabase(), args.dry_run)


if __name__ == "__main__":
    main()

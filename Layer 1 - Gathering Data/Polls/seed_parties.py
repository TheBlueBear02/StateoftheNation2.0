#!/usr/bin/env python3
"""
seed_parties.py — One-off seed for election_parties rows used by the polls pipeline.
Upserts confirmed, polled_only, and historical parties with bloc assignments.
"""

from __future__ import annotations

import argparse
import logging

from dotenv import load_dotenv
from supabase import Client

from db import get_election_id, get_supabase

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger(__name__)

# short_name (Hebrew key) → party definition
PARTIES = [
    # ── confirmed 2026 ballot ────────────────────────────────────────────────
    {"short_name": "הליכוד", "name": "הליכוד", "party_status": "confirmed", "bloc": "coalition", "color": "#1f4e79"},
    {"short_name": "יש עתיד", "name": "יש עתיד", "party_status": "confirmed", "bloc": "opposition", "color": "#003366"},
    {"short_name": "הציונות הדתית", "name": "הציונות הדתית", "party_status": "confirmed", "bloc": "coalition", "color": "#006633"},
    {"short_name": "עוצמה יהודית", "name": "עוצמה יהודית", "party_status": "confirmed", "bloc": "coalition", "color": "#ffd700"},
    {"short_name": "ש״ס", "name": "ש״ס", "party_status": "confirmed", "bloc": "coalition", "color": "#000080"},
    {"short_name": "יהדות התורה", "name": "יהדות התורה", "party_status": "confirmed", "bloc": "coalition", "color": "#000000"},
    {"short_name": "ישראל ביתנו", "name": "ישראל ביתנו", "party_status": "confirmed", "bloc": "opposition", "color": "#8B4513"},
    {"short_name": "רע״ם", "name": "רע״ם", "party_status": "confirmed", "bloc": "unaligned", "color": "#228B22"},
    {"short_name": "חד״ש-תע״ל", "name": "חד״ש-תע״ל", "party_status": "confirmed", "bloc": "opposition", "color": "#CC0000"},
    {"short_name": "בל״ד", "name": "בל״ד", "party_status": "confirmed", "bloc": "opposition", "color": "#006400"},
    {"short_name": "הדמוקרטים", "name": "הדמוקרטים", "party_status": "confirmed", "bloc": "opposition", "color": "#E91E63"},
    {"short_name": "ביחד", "name": "ביחד", "party_status": "confirmed", "bloc": "opposition", "color": "#0066CC"},
    {"short_name": "נועם", "name": "נועם", "party_status": "confirmed", "bloc": "coalition", "color": "#4B0082"},
    # ── polled_only (hypothetical lists) ─────────────────────────────────────
    {"short_name": "בנט 2026", "name": "בנט 2026", "party_status": "polled_only", "bloc": "opposition", "color": "#00CED1"},
    {"short_name": "ישר", "name": "ישר", "party_status": "polled_only", "bloc": "opposition", "color": "#4169E1"},
    {"short_name": "הרשימה המשותפת", "name": "הרשימה המשותפת", "party_status": "polled_only", "bloc": "opposition", "color": "#DC143C"},
    {"short_name": "מילואימניקים", "name": "מילואימניקים", "party_status": "polled_only", "bloc": "opposition", "color": "#708090"},
    # ── historical (merged / dissolved) ────────────────────────────────────
    {"short_name": "עבודה", "name": "עבודה", "party_status": "historical", "bloc": "opposition", "color": "#E30613"},
    {"short_name": "מרצ", "name": "מרצ", "party_status": "historical", "bloc": "opposition", "color": "#008080"},
    {"short_name": "תקווה חדשה", "name": "תקווה חדשה", "party_status": "historical", "bloc": "opposition", "color": "#32CD32"},
    {"short_name": "המחנה הממלכתי", "name": "המחנה הממלכתי", "party_status": "historical", "bloc": "opposition", "color": "#1E90FF"},
    {"short_name": "כחול לבן", "name": "כחול לבן", "party_status": "historical", "bloc": "opposition", "color": "#0000CD"},
]


def run(sb: Client, dry_run: bool = False) -> None:
    election_id = get_election_id(sb)
    log.info("Seeding parties for election_id=%d", election_id)

    for party in PARTIES:
        row = {
            "election_id": election_id,
            "short_name": party["short_name"],
            "name": party["name"],
            "party_status": party["party_status"],
            "bloc": party["bloc"],
            "color": party.get("color"),
        }
        if dry_run:
            log.info("[dry-run] upsert %s (%s)", party["short_name"], party["party_status"])
            continue

        sb.table("election_parties").upsert(
            row,
            on_conflict="election_id,short_name",
        ).execute()
        log.info("Upserted %s (%s)", party["short_name"], party["party_status"])


def main():
    parser = argparse.ArgumentParser(description="Seed election_parties for polls pipeline")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    run(get_supabase(), args.dry_run)


if __name__ == "__main__":
    main()

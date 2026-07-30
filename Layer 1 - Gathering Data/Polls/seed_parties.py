#!/usr/bin/env python3
"""
seed_parties.py — One-off seed for election_parties rows used by the polls pipeline.
Upserts confirmed, polled_only, and historical parties with bloc assignments.

Matches existing rows by *normalized* short_name (quote/dash/space variants collapse
to the same key), so re-running never creates duplicates like ש״ס vs ש"ס.
When duplicates already exist, poll FKs are merged into the preferred row and extras
are deleted.
"""

from __future__ import annotations

import argparse
import logging
from collections import defaultdict

from dotenv import load_dotenv
from supabase import Client

from db import get_election_id, get_supabase, normalize_party_short_name

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger(__name__)

# Prefer elections-import spellings (ASCII " / spaces) so seed matches existing rows.
PARTIES = [
    # ── confirmed 2026 ballot ────────────────────────────────────────────────
    {"short_name": "הליכוד", "name": "הליכוד", "party_status": "confirmed", "bloc": "coalition", "color": "#1f4e79"},
    {"short_name": "יש עתיד", "name": "יש עתיד", "party_status": "confirmed", "bloc": "opposition", "color": "#003366"},
    {"short_name": "הציונות הדתית", "name": "הציונות הדתית", "party_status": "confirmed", "bloc": "coalition", "color": "#006633"},
    {"short_name": "עוצמה יהודית", "name": "עוצמה יהודית", "party_status": "confirmed", "bloc": "coalition", "color": "#ffd700"},
    {"short_name": 'ש"ס', "name": 'ש"ס', "party_status": "confirmed", "bloc": "coalition", "color": "#000080"},
    {"short_name": "יהדות התורה", "name": "יהדות התורה", "party_status": "confirmed", "bloc": "coalition", "color": "#000000"},
    {"short_name": "ישראל ביתנו", "name": "ישראל ביתנו", "party_status": "confirmed", "bloc": "opposition", "color": "#8B4513"},
    {"short_name": 'רע"ם', "name": 'רע"ם', "party_status": "confirmed", "bloc": "unaligned", "color": "#228B22"},
    {"short_name": 'חד"ש תע"ל', "name": 'חד"ש תע"ל', "party_status": "confirmed", "bloc": "opposition", "color": "#CC0000"},
    {"short_name": 'בל"ד', "name": 'בל"ד', "party_status": "confirmed", "bloc": "opposition", "color": "#006400"},
    {"short_name": "הדמוקרטים", "name": "הדמוקרטים", "party_status": "confirmed", "bloc": "opposition", "color": "#E91E63"},
    {"short_name": "ביחד", "name": "ביחד", "party_status": "confirmed", "bloc": "opposition", "color": "#0066CC"},
    {"short_name": "ישר", "name": "ישר", "party_status": "confirmed", "bloc": "opposition", "color": "#4169E1"},
    # ── polled_only (hypothetical / minor lists not shown on /elections) ──
    {"short_name": "נועם", "name": "נועם", "party_status": "polled_only", "bloc": "coalition", "color": "#4B0082"},
    {"short_name": "בנט 2026", "name": "בנט 2026", "party_status": "polled_only", "bloc": "opposition", "color": "#00CED1"},
    {"short_name": "הרשימה המשותפת", "name": "הרשימה המשותפת", "party_status": "polled_only", "bloc": "opposition", "color": "#DC143C"},
    {"short_name": "מילואימניקים", "name": "מילואימניקים", "party_status": "polled_only", "bloc": "opposition", "color": "#708090"},
    {"short_name": "בית ציוני", "name": "בית ציוני", "party_status": "polled_only", "bloc": "opposition", "color": "#5B7C99"},
    # ── historical (merged / dissolved) ────────────────────────────────────
    {"short_name": "עבודה", "name": "עבודה", "party_status": "historical", "bloc": "opposition", "color": "#E30613"},
    {"short_name": "מרצ", "name": "מרצ", "party_status": "historical", "bloc": "opposition", "color": "#008080"},
    {"short_name": "תקווה חדשה", "name": "תקווה חדשה", "party_status": "historical", "bloc": "opposition", "color": "#32CD32"},
    {"short_name": "המחנה הממלכתי", "name": "המחנה הממלכתי", "party_status": "historical", "bloc": "opposition", "color": "#1E90FF"},
    {"short_name": "כחול לבן", "name": "כחול לבן", "party_status": "historical", "bloc": "opposition", "color": "#0000CD"},
]

def _fetch_parties(sb: Client, election_id: int) -> list[dict]:
    return (
        sb.table("election_parties")
        .select("id, name, short_name, party_status, bloc, color, logo_url")
        .eq("election_id", election_id)
        .order("id")
        .execute()
        .data
        or []
    )


def _prefer_party(group: list[dict]) -> dict:
    """Keep the elections-imported row when quote-variant stubs exist."""

    def score(row: dict) -> tuple:
        name = row.get("name") or ""
        short = row.get("short_name") or ""
        return (
            1 if row.get("logo_url") else 0,
            len(name),
            0 if short == name else 1,  # prefer fuller legal name ≠ short stub
            -row["id"],  # older / lower id wins as tie-break
        )

    return max(group, key=score)


def _reassign_or_delete(
    sb: Client,
    table: str,
    column: str,
    from_id: int,
    to_id: int,
    unique_cols: tuple[str, ...] | None,
) -> None:
    rows = sb.table(table).select("*").eq(column, from_id).execute().data or []
    for row in rows:
        row_id = row["id"]
        if unique_cols:
            query = sb.table(table).select("id").eq(column, to_id)
            for col in unique_cols:
                query = query.eq(col, row[col])
            conflict = query.execute().data
            if conflict:
                sb.table(table).delete().eq("id", row_id).execute()
                continue
        sb.table(table).update({column: to_id}).eq("id", row_id).execute()


def _merge_party(sb: Client, from_id: int, to_id: int, dry_run: bool) -> None:
    log.info("Merging party_id=%d → %d", from_id, to_id)
    if dry_run:
        return

    _reassign_or_delete(
        sb, "poll_party_aliases", "party_id", from_id, to_id, None
    )
    _reassign_or_delete(
        sb, "poll_results", "party_id", from_id, to_id, ("poll_id",)
    )
    _reassign_or_delete(
        sb,
        "poll_aggregates",
        "party_id",
        from_id,
        to_id,
        ("election_id", "as_of_date", "method"),
    )
    _reassign_or_delete(
        sb, "election_candidates", "party_id", from_id, to_id, None
    )
    _reassign_or_delete(
        sb, "party_lineage", "predecessor_id", from_id, to_id, None
    )
    _reassign_or_delete(
        sb, "party_lineage", "successor_id", from_id, to_id, None
    )
    _reassign_or_delete(
        sb,
        "pollster_house_effects",
        "party_id",
        from_id,
        to_id,
        ("pollster", "as_of_date"),
    )

    # raw_poll_rows payloads may embed resolved party ids — leave historical;
    # pending rows will be re-resolved on the next pipeline run.
    sb.table("election_parties").delete().eq("id", from_id).execute()
    log.info("Deleted duplicate party_id=%d", from_id)


def _dedupe_quote_variants(sb: Client, election_id: int, dry_run: bool) -> None:
    groups: dict[str, list[dict]] = defaultdict(list)
    for row in _fetch_parties(sb, election_id):
        sn = row.get("short_name")
        if not sn:
            continue
        key = normalize_party_short_name(sn)
        if key:
            groups[key].append(row)

    for key, group in groups.items():
        if len(group) < 2:
            continue
        keep = _prefer_party(group)
        log.warning(
            "Found %d parties for normalized short_name=%r — keeping id=%d (%r)",
            len(group),
            key,
            keep["id"],
            keep.get("short_name"),
        )
        for row in group:
            if row["id"] != keep["id"]:
                _merge_party(sb, row["id"], keep["id"], dry_run)


def run(sb: Client, dry_run: bool = False) -> None:
    election_id = get_election_id(sb)
    log.info("Seeding parties for election_id=%d", election_id)

    _dedupe_quote_variants(sb, election_id, dry_run)

    by_norm: dict[str, dict] = {}
    for row in _fetch_parties(sb, election_id):
        sn = row.get("short_name")
        if not sn:
            continue
        key = normalize_party_short_name(sn)
        if key and key not in by_norm:
            by_norm[key] = row

    for party in PARTIES:
        key = normalize_party_short_name(party["short_name"])
        existing = by_norm.get(key)

        if existing:
            updates = {
                "party_status": party["party_status"],
                "bloc": party["bloc"],
                "color": party.get("color") or existing.get("color"),
            }
            # Never rewrite short_name / name — elections import spellings win.
            if dry_run:
                log.info(
                    "[dry-run] update id=%d %r ← seed %r (%s)",
                    existing["id"],
                    existing.get("short_name"),
                    party["short_name"],
                    party["party_status"],
                )
                continue
            sb.table("election_parties").update(updates).eq("id", existing["id"]).execute()
            log.info(
                "Updated id=%d %r (%s)",
                existing["id"],
                existing.get("short_name"),
                party["party_status"],
            )
            continue

        row = {
            "election_id": election_id,
            "short_name": party["short_name"],
            "name": party["name"],
            "party_status": party["party_status"],
            "bloc": party["bloc"],
            "color": party.get("color"),
        }
        if dry_run:
            log.info("[dry-run] insert %s (%s)", party["short_name"], party["party_status"])
            continue

        inserted = sb.table("election_parties").insert(row).execute().data
        new_id = inserted[0]["id"] if inserted else "?"
        by_norm[key] = {"id": new_id, "short_name": party["short_name"]}
        log.info("Inserted %s id=%s (%s)", party["short_name"], new_id, party["party_status"])


def main():
    parser = argparse.ArgumentParser(description="Seed election_parties for polls pipeline")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    run(get_supabase(), args.dry_run)


if __name__ == "__main__":
    main()

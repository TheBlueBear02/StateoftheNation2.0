#!/usr/bin/env python3
"""
insert_raw_list.py
==================
Inserts a party's candidate list into raw_candidate_lists,
ready for the pipeline to process.

Accepts:
  Plain text (.txt) — one name per line, position = line order
  CSV (.csv)        — columns: name[,city]  header row auto-detected

Usage:
  python insert_raw_list.py --party "הליכוד" --file likud.txt
  python insert_raw_list.py --party "ביחד" --file beyachad.csv
  python insert_raw_list.py --party "הליכוד" --file likud.txt --dry-run
  python insert_raw_list.py --list-parties

Text file format (likud.txt):
  בנימין נתניהו
  יריב לוין
  דוד אמסלם
  # lines starting with # are ignored
  מירי רגב

CSV file format (beyachad.csv):
  שם,עיר
  נפתלי בנט,רעננה
  יאיר לפיד,תל אביב

Re-inserting an updated list:
  Existing unprocessed rows for the party are deleted and replaced.
  Already-processed rows (already in election_candidates) are left alone.
  After re-running the pipeline, remove dropped candidates with:

  DELETE FROM election_candidates
  WHERE party_id = <party_id>
    AND person_id NOT IN (
      SELECT p.id FROM people p
      INNER JOIN raw_candidate_lists r ON r.raw_name = p.full_name
      WHERE r.party_id = <party_id>
    );

Requirements:
  pip install supabase python-dotenv
"""

import os
import re
import csv
import logging
import argparse
from pathlib import Path

from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger(__name__)

# Strips leading "1. " or "1) " position prefixes if the party published them
STRIP_POSITION = re.compile(r"^\d+[\.\)]\s*")


# ── Supabase ──────────────────────────────────────────────────────────────────

def get_supabase() -> Client:
    return create_client(
        os.environ["SUPABASE_URL"],
        os.environ["SUPABASE_SERVICE_KEY"],
    )


def get_election_id(sb: Client, year: int = 2026) -> int:
    rows = sb.table("elections").select("id").eq("year", year).execute().data
    if not rows:
        raise ValueError(f"No election found for year={year}. Run the seed SQL first.")
    return rows[0]["id"]


def get_party_map(sb: Client, election_id: int) -> dict[str, dict]:
    """Return {short_name → party row} for all parties in this election."""
    rows = (
        sb.table("election_parties")
        .select("id, name, short_name")
        .eq("election_id", election_id)
        .execute()
        .data
    )
    return {(r["short_name"] or r["name"]): r for r in rows}


# ── File parsing ──────────────────────────────────────────────────────────────

def clean_name(raw: str) -> str:
    """Strip leading position numbers and whitespace from a name."""
    raw = raw.strip()
    raw = STRIP_POSITION.sub("", raw)
    return raw.strip()


def parse_txt(path: Path) -> list[dict]:
    """
    Parse a plain text file — one candidate per line.
    Empty lines and lines starting with # are skipped.
    List position = order of non-empty lines (1-based).
    """
    candidates = []
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            name = clean_name(line)
            if name:
                candidates.append({"name": name, "city": None})
    return candidates


def parse_csv(path: Path) -> list[dict]:
    """
    Parse a CSV file with columns: name[,city]
    Auto-detects and skips a header row.
    Handles Excel-exported files (UTF-8 BOM).
    """
    HEADER_VALUES = {"name", "שם", "מועמד", "שם מועמד", "שם מלא"}
    candidates = []
    with open(path, encoding="utf-8-sig") as f:
        reader = csv.reader(f)
        for i, row in enumerate(reader):
            if not row:
                continue
            name_raw = row[0].strip()
            # Skip header row
            if i == 0 and name_raw.lower() in HEADER_VALUES:
                continue
            name = clean_name(name_raw)
            if not name:
                continue
            city = row[1].strip() if len(row) > 1 and row[1].strip() else None
            candidates.append({"name": name, "city": city})
    return candidates


def parse_file(path: Path) -> list[dict]:
    if path.suffix.lower() == ".csv":
        return parse_csv(path)
    return parse_txt(path)


# ── Insert ────────────────────────────────────────────────────────────────────

def insert_list(
    sb:          Client,
    election_id: int,
    party_id:    int,
    party_key:   str,
    candidates:  list[dict],
    dry_run:     bool,
) -> None:

    # Check state of existing rows for this party
    existing = (
        sb.table("raw_candidate_lists")
        .select("id, processed")
        .eq("party_id", party_id)
        .execute()
        .data
    )
    already_processed = [r for r in existing if r["processed"]]
    unprocessed       = [r for r in existing if not r["processed"]]

    # Delete existing unprocessed rows — safe to replace with updated list
    if unprocessed:
        log.info(
            "  Replacing %d existing unprocessed rows for '%s'",
            len(unprocessed), party_key,
        )
        if not dry_run:
            ids = [r["id"] for r in unprocessed]
            sb.table("raw_candidate_lists").delete().in_("id", ids).execute()

    # Warn about already-processed rows
    if already_processed:
        log.warning(
            "  %d rows already processed (committed to election_candidates).\n"
            "  After re-running the pipeline, use the cleanup SQL in the docstring\n"
            "  to remove any candidates who dropped off the list.",
            len(already_processed),
        )

    # Build rows with 1-based list positions
    rows = [
        {
            "election_id":   election_id,
            "party_id":      party_id,
            "raw_name":      c["name"],
            "list_position": i + 1,
            "raw_city":      c["city"],
            "processed":     False,
        }
        for i, c in enumerate(candidates)
    ]

    # Preview first 5
    log.info("  Preview:")
    for r in rows[:5]:
        city_str = f"  ({r['raw_city']})" if r["raw_city"] else ""
        log.info("    %3d.  %s%s", r["list_position"], r["raw_name"], city_str)
    if len(rows) > 5:
        log.info("    … and %d more", len(rows) - 5)

    if dry_run:
        log.info("  [DRY RUN] would insert %d rows — no changes made", len(rows))
        return

    sb.table("raw_candidate_lists").insert(rows).execute()
    log.info("  ✓ Inserted %d candidates for '%s'", len(rows), party_key)
    log.info("  Next step: python run_pipeline.py")


# ── CLI ───────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="Insert a party candidate list into raw_candidate_lists"
    )
    parser.add_argument(
        "--party",
        help="Party short_name exactly as in election_parties (e.g. 'הליכוד')",
    )
    parser.add_argument(
        "--file",
        help="Path to list file — .txt (one name per line) or .csv (name,city)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Preview the parsed list without writing to DB",
    )
    parser.add_argument(
        "--list-parties",
        action="store_true",
        help="Print all available party short names and exit",
    )
    args = parser.parse_args()

    sb          = get_supabase()
    election_id = get_election_id(sb)
    party_map   = get_party_map(sb, election_id)

    if args.list_parties:
        print("\nAvailable parties (use the key as --party value):")
        for key, p in sorted(party_map.items()):
            print(f'  --party "{key}"   →   {p["name"]}')
        return

    if not args.party:
        parser.error("--party is required. Run --list-parties to see available values.")
    if not args.file:
        parser.error("--file is required.")

    party = party_map.get(args.party)
    if not party:
        log.error(
            "Party '%s' not found.\nAvailable: %s",
            args.party,
            ", ".join(f'"{k}"' for k in sorted(party_map.keys())),
        )
        return

    path = Path(args.file)
    if not path.exists():
        log.error("File not found: %s", path.resolve())
        return

    log.info("Parsing %s…", path.name)
    candidates = parse_file(path)

    if not candidates:
        log.error("No candidates parsed from file — check the format.")
        return

    log.info("Parsed %d candidates for party '%s'", len(candidates), args.party)
    insert_list(sb, election_id, party["id"], args.party, candidates, args.dry_run)


if __name__ == "__main__":
    main()
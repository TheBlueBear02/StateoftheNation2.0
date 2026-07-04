#!/usr/bin/env python3
"""
fetch_candidate_birth_dates.py
==============================
Fetches missing birth dates from Wikidata for persons who appear
in election_candidates but have no birth_date in the people table.

Only touches people.birth_date — nothing else is modified.

Usage:
  python fetch_candidate_birth_dates.py           # update DB
  python fetch_candidate_birth_dates.py --dry-run # print results, no writes

Requirements:
  pip install requests supabase python-dotenv
"""

import os
import time
import logging
import argparse

import requests
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger(__name__)

SPARQL_URL   = "https://query.wikidata.org/sparql"
BATCH_SIZE   = 10     # names per SPARQL query
DELAY        = 1.2    # seconds between requests

HEADERS = {
    "User-Agent": "MatzavHaUma/1.0 (civic-data research)",
    "Accept":     "application/sparql-results+json",
}

SPARQL_TEMPLATE = """
SELECT DISTINCT ?nameHe ?birthDate WHERE {{
  VALUES ?nameHe {{ {values} }}
  ?person rdfs:label ?nameHe ;
          wdt:P31 wd:Q5 ;
          wdt:P27 wd:Q801 .
  ?person wdt:P569 ?birthDate .
  FILTER(LANG(?nameHe) = "he")
}}
"""


def get_supabase() -> Client:
    return create_client(
        os.environ["SUPABASE_URL"],
        os.environ["SUPABASE_SERVICE_KEY"],
    )


def get_election_id(sb: Client, year: int = 2026) -> int:
    rows = sb.table("elections").select("id").eq("year", year).execute().data
    if not rows:
        raise ValueError(f"No election found for year={year}")
    return rows[0]["id"]


def load_candidates_without_birth_date(sb: Client, election_id: int) -> list[dict]:
    """
    Returns people rows (id, full_name) for election candidates
    who are missing birth_date.
    """
    # Get all person_ids in this election
    ec_rows = (
        sb.table("election_candidates")
        .select("person_id")
        .eq("election_id", election_id)
        .execute()
        .data
    )
    if not ec_rows:
        log.info("No election candidates found.")
        return []

    person_ids = list({r["person_id"] for r in ec_rows})
    log.info("Found %d unique candidates in election", len(person_ids))

    # Load their people rows, filtered to those without birth_date
    missing = []
    for i in range(0, len(person_ids), 200):
        batch = (
            sb.table("people")
            .select("id, full_name, birth_date")
            .in_("id", person_ids[i:i + 200])
            .is_("birth_date", "null")
            .execute()
            .data
        )
        missing.extend(batch)

    log.info("%d candidates are missing birth_date", len(missing))
    return missing


def sparql_query(names: list[str]) -> dict[str, str]:
    """
    Query Wikidata for birth dates of a batch of Hebrew names.
    Returns {name: birth_date_string} for found results.
    """
    values = " ".join(f'"{n}"@he' for n in names)
    query  = SPARQL_TEMPLATE.format(values=values)

    try:
        resp = requests.get(
            SPARQL_URL,
            params={"query": query, "format": "json"},
            headers=HEADERS,
            timeout=30,
        )
        resp.raise_for_status()
        bindings = resp.json().get("results", {}).get("bindings", [])

        results = {}
        for b in bindings:
            name = b.get("nameHe", {}).get("value")
            raw  = b.get("birthDate", {}).get("value", "")
            if name and raw:
                # Wikidata returns ISO datetime — take date part only
                results[name] = raw[:10]
        return results

    except Exception as exc:
        log.warning("  SPARQL error: %s", exc)
        return {}


def run(sb: Client, dry_run: bool) -> None:
    election_id = get_election_id(sb)
    candidates  = load_candidates_without_birth_date(sb, election_id)

    if not candidates:
        log.info("Nothing to do.")
        return

    names      = [c["full_name"] for c in candidates]
    name_to_id = {c["full_name"]: c["id"] for c in candidates}

    found = skipped = 0

    for i in range(0, len(names), BATCH_SIZE):
        batch   = names[i:i + BATCH_SIZE]
        results = sparql_query(batch)

        log.info(
            "Batch %d/%d — Wikidata returned %d/%d birth dates",
            i // BATCH_SIZE + 1,
            -(-len(names) // BATCH_SIZE),
            len(results),
            len(batch),
        )

        for name, birth_date in results.items():
            person_id = name_to_id.get(name)
            if not person_id:
                continue
            log.info("  %-25s → %s", name, birth_date)
            if not dry_run:
                sb.table("people").update(
                    {"birth_date": birth_date}
                ).eq("id", person_id).execute()
            found += 1

        for name in batch:
            if name not in results:
                log.warning("  %-25s → not found on Wikidata", name)
                skipped += 1

        time.sleep(DELAY)

    log.info(
        "Done — birth dates found: %d · not on Wikidata: %d",
        found, skipped,
    )
    if dry_run:
        log.info("[DRY RUN] no changes written")


def main():
    parser = argparse.ArgumentParser(
        description="Fetch birth dates from Wikidata for election candidates"
    )
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    sb = get_supabase()
    run(sb, args.dry_run)


if __name__ == "__main__":
    main()
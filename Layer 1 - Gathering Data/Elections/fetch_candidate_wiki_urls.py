#!/usr/bin/env python3
"""
fetch_candidate_wikipedia_urls.py
==================================
Fetches Hebrew Wikipedia page URLs from Wikidata for persons who appear
in election_candidates but have no wikipedia_url in the people table.

Only touches people.wikipedia_url — nothing else is modified.

Usage:
  python fetch_candidate_wikipedia_urls.py           # update DB
  python fetch_candidate_wikipedia_urls.py --dry-run # print results, no writes

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

SPARQL_URL = "https://query.wikidata.org/sparql"
BATCH_SIZE = 10
DELAY      = 1.2

HEADERS = {
    "User-Agent": "MatzavHaUma/1.0 (civic-data research)",
    "Accept":     "application/sparql-results+json",
}

# Fetches the Hebrew Wikipedia article URL via Wikidata sitelinks.
# schema:about links a Wikipedia article to its Wikidata item.
SPARQL_TEMPLATE = """
SELECT DISTINCT ?nameHe ?articleUrl WHERE {{
  VALUES ?nameHe {{ {values} }}
  ?person rdfs:label ?nameHe ;
          wdt:P31 wd:Q5 ;
          wdt:P27 wd:Q801 .
  FILTER(LANG(?nameHe) = "he")
  ?articleUrl schema:about ?person ;
              schema:inLanguage "he" ;
              schema:isPartOf <https://he.wikipedia.org/> .
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


def load_candidates_without_wikipedia(sb: Client, election_id: int) -> list[dict]:
    """
    Returns people rows (id, full_name) for election candidates
    who are missing wikipedia_url.
    """
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

    missing = []
    for i in range(0, len(person_ids), 200):
        batch = (
            sb.table("people")
            .select("id, full_name, wikipedia_url")
            .in_("id", person_ids[i:i + 200])
            .is_("wikipedia_url", "null")
            .execute()
            .data
        )
        missing.extend(batch)

    log.info("%d candidates are missing wikipedia_url", len(missing))
    return missing


def sparql_query(names: list[str]) -> dict[str, str]:
    """
    Query Wikidata for Hebrew Wikipedia URLs of a batch of Hebrew names.
    Returns {name: wikipedia_url} for found results.
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
            name = b.get("nameHe",     {}).get("value")
            url  = b.get("articleUrl", {}).get("value")
            if name and url:
                results[name] = url
        return results

    except Exception as exc:
        log.warning("  SPARQL error: %s", exc)
        return {}


def run(sb: Client, dry_run: bool) -> None:
    election_id = get_election_id(sb)
    candidates  = load_candidates_without_wikipedia(sb, election_id)

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
            "Batch %d/%d — Wikidata returned %d/%d URLs",
            i // BATCH_SIZE + 1,
            -(-len(names) // BATCH_SIZE),
            len(results),
            len(batch),
        )

        for name, url in results.items():
            person_id = name_to_id.get(name)
            if not person_id:
                continue
            log.info("  %-25s → %s", name, url)
            if not dry_run:
                sb.table("people").update(
                    {"wikipedia_url": url}
                ).eq("id", person_id).execute()
            found += 1

        for name in batch:
            if name not in results:
                log.warning("  %-25s → not found on Wikidata", name)
                skipped += 1

        time.sleep(DELAY)

    log.info(
        "Done — URLs found: %d · not on Wikidata: %d",
        found, skipped,
    )
    if dry_run:
        log.info("[DRY RUN] no changes written")


def main():
    parser = argparse.ArgumentParser(
        description="Fetch Hebrew Wikipedia URLs from Wikidata for election candidates"
    )
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    sb = get_supabase()
    run(sb, args.dry_run)


if __name__ == "__main__":
    main()
#!/usr/bin/env python3
"""
enrich_wikidata.py  — Pipeline Stage 2
=======================================
Enriches people rows for current election candidates using Wikidata SPARQL.
Only fills NULL fields — never overwrites existing data.

Enriches people table:
  birth_date · gender · image_url

Enriches election_candidates table:
  city  (Wikidata residence — starting point for geocoding)

Usage:
  python enrich_wikidata.py           # enrich all election 2026 candidates
  python enrich_wikidata.py --dry-run # print what would be updated, no writes

Requirements:
  pip install requests supabase python-dotenv
"""

import os
import time
import logging
import argparse
from datetime import datetime

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
SPARQL_DELAY = 1.0   # seconds between requests — Wikidata rate limit is ~5/s
BATCH_SIZE   = 10    # names per SPARQL query

HEADERS = {
    "User-Agent": "MatzavHaUma/1.0 (matzavhauma@example.com)",
    "Accept": "application/sparql-results+json",
}


def get_supabase() -> Client:
    return create_client(
        os.environ["SUPABASE_URL"],
        os.environ["SUPABASE_SERVICE_KEY"],
    )


def get_election_id(sb: Client, year: int = 2026) -> int:
    rows = sb.table("elections").select("id").eq("year", year).execute().data
    return rows[0]["id"]


# ── Fetch candidates needing enrichment ───────────────────────────────────────

def load_candidates(sb: Client, election_id: int) -> list[dict]:
    """
    Return all election candidates joined with their people row,
    so we know which fields are already populated.
    """
    ec_rows = (
        sb.table("election_candidates")
        .select("id, person_id, city")
        .eq("election_id", election_id)
        .execute()
        .data
    )
    if not ec_rows:
        return []

    person_ids = [r["person_id"] for r in ec_rows]

    # Load people in batches to avoid URL length limits
    people = []
    for i in range(0, len(person_ids), 200):
        batch = person_ids[i:i + 200]
        rows = (
            sb.table("people")
            .select("id, full_name, birth_date, gender, image_url")
            .in_("id", batch)
            .execute()
            .data
        )
        people.extend(rows)

    people_by_id = {p["id"]: p for p in people}

    # Combine
    result = []
    for ec in ec_rows:
        person = people_by_id.get(ec["person_id"])
        if person:
            result.append({
                "ec_id":      ec["id"],
                "person_id":  ec["person_id"],
                "full_name":  person["full_name"],
                "birth_date": person["birth_date"],
                "gender":     person["gender"],
                "image_url":  person["image_url"],
                "ec_city":    ec["city"],
            })
    return result


# ── SPARQL query ──────────────────────────────────────────────────────────────

SPARQL_TEMPLATE = """
SELECT DISTINCT ?nameHe ?birthDate ?genderLabel ?image ?cityLabel WHERE {{
  VALUES ?nameHe {{ {values} }}
  ?person rdfs:label ?nameHe ;
          wdt:P31 wd:Q5 ;
          wdt:P27 wd:Q801 .    # citizen of Israel
  OPTIONAL {{ ?person wdt:P569 ?birthDate . }}
  OPTIONAL {{ ?person wdt:P21 ?gender . }}
  OPTIONAL {{ ?person wdt:P18 ?image . }}
  OPTIONAL {{ ?person wdt:P551 ?city . }}
  SERVICE wikibase:label {{
    bd:serviceParam wikibase:language "he,en" .
    ?gender rdfs:label ?genderLabel .
    ?city rdfs:label ?cityLabel .
  }}
}}
"""


def sparql_query(names: list[str]) -> list[dict]:
    """Run a batched SPARQL query for a list of Hebrew names."""
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
        results  = []
        for b in bindings:
            results.append({
                "name":       b.get("nameHe",    {}).get("value"),
                "birth_date": b.get("birthDate", {}).get("value", "")[:10] or None,
                "gender":     b.get("genderLabel", {}).get("value"),
                "image_url":  b.get("image",     {}).get("value"),
                "city":       b.get("cityLabel", {}).get("value"),
            })
        return results
    except Exception as exc:
        log.warning("  SPARQL error for batch: %s", exc)
        return []


def normalize_gender(raw: str | None) -> str | None:
    """Map Wikidata gender labels to Hebrew."""
    if not raw:
        return None
    raw = raw.lower()
    if "female" in raw or "נקבה" in raw:
        return "נקבה"
    if "male" in raw or "זכר" in raw:
        return "זכר"
    return None


# ── Apply enrichment ──────────────────────────────────────────────────────────

def apply_enrichment(
    sb:        Client,
    candidate: dict,
    wikidata:  dict,
    dry_run:   bool,
) -> None:
    person_updates = {}
    ec_updates     = {}

    # Only fill NULL fields — never overwrite
    if not candidate["birth_date"] and wikidata.get("birth_date"):
        person_updates["birth_date"] = wikidata["birth_date"]

    if not candidate["gender"] and wikidata.get("gender"):
        g = normalize_gender(wikidata["gender"])
        if g:
            person_updates["gender"] = g

    if not candidate["image_url"] and wikidata.get("image_url"):
        person_updates["image_url"] = wikidata["image_url"]

    if not candidate["ec_city"] and wikidata.get("city"):
        ec_updates["city"] = wikidata["city"]

    if person_updates:
        log.info(
            "  %-25s → people:  %s",
            candidate["full_name"], list(person_updates.keys()),
        )
        if not dry_run:
            sb.table("people").update(person_updates).eq("id", candidate["person_id"]).execute()

    if ec_updates:
        log.info(
            "  %-25s → ec:      %s",
            candidate["full_name"], ec_updates,
        )
        if not dry_run:
            sb.table("election_candidates").update(ec_updates).eq("id", candidate["ec_id"]).execute()

    if not person_updates and not ec_updates:
        log.info("  %-25s → nothing new", candidate["full_name"])


# ── Main ──────────────────────────────────────────────────────────────────────

def run(sb: Client, dry_run: bool) -> None:
    election_id = get_election_id(sb)
    candidates  = load_candidates(sb, election_id)
    log.info("Enriching %d election candidates via Wikidata…", len(candidates))

    # Build name → candidate lookup
    name_map = {c["full_name"]: c for c in candidates}
    names    = list(name_map.keys())

    enriched = 0
    for i in range(0, len(names), BATCH_SIZE):
        batch   = names[i:i + BATCH_SIZE]
        results = sparql_query(batch)
        log.info("  Batch %d/%d — Wikidata returned %d results", i // BATCH_SIZE + 1, -(-len(names) // BATCH_SIZE), len(results))

        matched_names = set()
        for wd in results:
            name = wd.get("name")
            if name and name in name_map:
                apply_enrichment(sb, name_map[name], wd, dry_run)
                matched_names.add(name)
                enriched += 1

        # Log any names Wikidata had no result for
        for name in batch:
            if name not in matched_names:
                log.warning("  %-25s → not found on Wikidata", name)

        time.sleep(SPARQL_DELAY)

    log.info("Wikidata enrichment complete — %d/%d candidates enriched", enriched, len(candidates))


def main():
    parser = argparse.ArgumentParser(description="Stage 2 — Wikidata enrichment")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    sb = get_supabase()
    run(sb, args.dry_run)


if __name__ == "__main__":
    main()

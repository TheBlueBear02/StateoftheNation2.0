#!/usr/bin/env python3
"""
enrich_single_candidate.py  — Single-candidate pipeline preview
================================================================
Runs stages 2, 3, 5, and 6 for one election_candidates row and returns
proposed field values as JSON (no DB writes). Used by the /elections/edit UI.

Usage:
  python enrich_single_candidate.py --candidate-id 42 --json

Requirements:
  Same as run_pipeline.py (supabase, openai, requests, python-dotenv)
"""

import argparse
import json
import logging
import os
import sys

from dotenv import load_dotenv
from supabase import create_client, Client

import enrich_wikidata
import generate_descriptions
import fetch_candidate_birthdates
import fetch_candidate_wiki_urls

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger(__name__)

DRAFT_KEY_MAP = {
    "birth_date":    "birthDate",
    "gender":        "gender",
    "image_url":     "imageUrl",
    "wikipedia_url": "wikipediaUrl",
    "description":   "description",
    "city":          "city",
}


def get_supabase() -> Client:
    return create_client(
        os.environ["SUPABASE_URL"],
        os.environ["SUPABASE_SERVICE_KEY"],
    )


def is_empty(value) -> bool:
    return value is None or (isinstance(value, str) and not value.strip())


def load_candidate(sb: Client, candidate_id: int) -> dict | None:
    ec_rows = (
        sb.table("election_candidates")
        .select("id, person_id, party_id, description, city")
        .eq("id", candidate_id)
        .execute()
        .data
    )
    if not ec_rows:
        return None

    ec = ec_rows[0]
    person_rows = (
        sb.table("people")
        .select("id, full_name, birth_date, gender, image_url, wikipedia_url, wikidata_id")
        .eq("id", ec["person_id"])
        .execute()
        .data
    )
    if not person_rows:
        return None

    person = person_rows[0]
    party_rows = (
        sb.table("election_parties")
        .select("id, name")
        .eq("id", ec["party_id"])
        .execute()
        .data
    )
    party_name = party_rows[0]["name"] if party_rows else ""

    return {
        "ec_id":         ec["id"],
        "person_id":     ec["person_id"],
        "party_id":      ec["party_id"],
        "party_name":    party_name,
        "full_name":     person["full_name"],
        "description":   ec["description"],
        "city":          ec["city"],
        "birth_date":    person["birth_date"],
        "gender":        person["gender"],
        "image_url":     person["image_url"],
        "wikipedia_url": person["wikipedia_url"],
        "wikidata_id":   person.get("wikidata_id"),
        # enrich_wikidata candidate shape
        "ec_city":       ec["city"],
    }


def missing_fields(candidate: dict) -> set[str]:
    missing = set()
    if is_empty(candidate["description"]):
        missing.add("description")
    if is_empty(candidate["city"]):
        missing.add("city")
    if is_empty(candidate["image_url"]):
        missing.add("image_url")
    if is_empty(candidate["birth_date"]):
        missing.add("birth_date")
    if is_empty(candidate["gender"]):
        missing.add("gender")
    if is_empty(candidate["wikipedia_url"]):
        missing.add("wikipedia_url")
    return missing


def to_draft_updates(person_updates: dict, ec_updates: dict) -> dict:
    updates = {}
    for key, value in {**person_updates, **ec_updates}.items():
        draft_key = DRAFT_KEY_MAP.get(key, key)
        updates[draft_key] = value
    return updates


def wikidata_lookup(name: str) -> dict | None:
    """Try Wikidata enrichment using full name and shorter variants."""
    for variant in generate_descriptions.name_variants(name):
        results = enrich_wikidata.sparql_query([variant])
        if not results:
            continue
        match = next((r for r in results if r.get("name") == variant), results[0])
        if match:
            log.info("  Wikidata matched '%s' via variant '%s'", name, variant)
            return match
    return None


def wikidata_value_lookup(name: str, sparql_fn) -> str | None:
    """Try a stage 5/6 SPARQL lookup using name variants."""
    for variant in generate_descriptions.name_variants(name):
        results = sparql_fn([variant])
        value = results.get(variant)
        if value:
            log.info("  Wikidata matched '%s' via variant '%s'", name, variant)
            return value
    return None


def enrich_one(sb: Client, candidate_id: int) -> dict:
    candidate = load_candidate(sb, candidate_id)
    if not candidate:
        return {"ok": False, "error": f"מועמד {candidate_id} לא נמצא"}

    missing = missing_fields(candidate)
    if not missing:
        return {
            "ok": True,
            "updates": {},
            "filledFields": [],
            "message": "כל השדות כבר מלאים",
        }

    person_updates: dict = {}
    ec_updates: dict = {}
    name = candidate["full_name"]

    # Stage 2 — Wikidata general enrichment
    wikidata_fields = {"birth_date", "gender", "image_url", "city"}
    if missing & wikidata_fields:
        log.info("Stage 2: Wikidata enrichment for %s", name)
        wd = wikidata_lookup(name)
        if wd:
            p_up, ec_up = enrich_wikidata.collect_enrichment_updates(candidate, wd)
            person_updates.update(p_up)
            ec_updates.update(ec_up)
            candidate.update({**p_up, **{k: v for k, v in ec_up.items() if k == "city"}})
            if ec_up.get("city"):
                candidate["ec_city"] = ec_up["city"]
        else:
            log.warning("  %s → not found on Wikidata (stage 2)", name)

    # Stage 3 — Generate description
    if is_empty(candidate.get("description")) and "description" in missing:
        log.info("Stage 3: generate description for %s", name)
        try:
            openai_client = generate_descriptions.get_openai()
            wiki_text = generate_descriptions.fetch_wikipedia_intro(name)
            description = generate_descriptions.generate_description(
                openai_client,
                name,
                candidate["party_name"],
                wiki_text,
            )
            if description:
                ec_updates["description"] = description
                candidate["description"] = description
        except Exception as exc:
            log.warning("  Description generation failed: %s", exc)

    # Stage 5 — Birth date retry
    if is_empty(candidate.get("birth_date")) and "birth_date" in missing:
        log.info("Stage 5: birth date retry for %s", name)
        birth_date = wikidata_value_lookup(
            name, fetch_candidate_birthdates.sparql_query
        )
        if birth_date:
            person_updates["birth_date"] = birth_date
            candidate["birth_date"] = birth_date

    # Stage 6 — Wikipedia URL retry
    if is_empty(candidate.get("wikipedia_url")) and "wikipedia_url" in missing:
        log.info("Stage 6: Wikipedia URL retry for %s", name)
        url = wikidata_value_lookup(name, fetch_candidate_wiki_urls.sparql_query)
        if not url:
            url = generate_descriptions.fetch_wikipedia_url(name)
        if url:
            person_updates["wikipedia_url"] = url
            candidate["wikipedia_url"] = url

    updates = to_draft_updates(person_updates, ec_updates)
    filled_fields = list(updates.keys())

    if not filled_fields:
        return {
            "ok": True,
            "updates": {},
            "filledFields": [],
            "message": "לא נמצא מידע נוסף",
        }

    return {
        "ok": True,
        "updates": updates,
        "filledFields": filled_fields,
        "message": f"הושלמו {len(filled_fields)} שדות",
    }


def main():
    parser = argparse.ArgumentParser(
        description="Preview pipeline enrichment for a single election candidate"
    )
    parser.add_argument("--candidate-id", type=int, required=True)
    parser.add_argument("--json", action="store_true", help="Print JSON result to stdout")
    args = parser.parse_args()

    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")

    required = ["SUPABASE_URL", "SUPABASE_SERVICE_KEY"]
    if missing := [k for k in required if not os.environ.get(k)]:
        result = {"ok": False, "error": f"Missing env vars: {missing}"}
        print(json.dumps(result, ensure_ascii=False))
        sys.exit(1)

    sb = get_supabase()
    result = enrich_one(sb, args.candidate_id)

    if args.json:
        print(json.dumps(result, ensure_ascii=False))
    else:
        print(result)

    sys.exit(0 if result.get("ok") else 1)


if __name__ == "__main__":
    main()

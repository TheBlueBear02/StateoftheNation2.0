#!/usr/bin/env python3
"""
run_pipeline.py  — Election Data Pipeline Orchestrator
=======================================================
Runs all five pipeline stages in order:

  Stage 1  resolve_candidates   raw_candidate_lists → election_candidates
  Stage 2  enrich_wikidata      fill missing birth_date / gender / image / city
  Stage 3  generate_descriptions  OpenAI Hebrew bios → election_candidates.description
  Stage 4  geocode_cities        city → lat/long
  Stage 5  fetch_candidate_birthdates  retry missing people.birth_date from Wikidata

Usage:
  python run_pipeline.py                # full run
  python run_pipeline.py --test         # seed 5 test fixtures then run all stages
  python run_pipeline.py --dry-run      # all stages, no DB writes
  python run_pipeline.py --stage 1      # run one stage only (1–5)
  python run_pipeline.py --skip-enrich  # skip general Wikidata enrichment

Requirements:
  pip install openai geopy requests supabase python-dotenv
  .env must contain:
    SUPABASE_URL
    SUPABASE_SERVICE_KEY
    OPENAI_API_KEY
"""

import os
import sys
import logging
import argparse
from datetime import datetime

from dotenv import load_dotenv
from supabase import create_client

import resolve_candidates
import enrich_wikidata
import generate_descriptions
import geocode_cities
import fetch_candidate_birthdates

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger(__name__)


def check_env() -> None:
    required = ["SUPABASE_URL", "SUPABASE_SERVICE_KEY", "OPENAI_API_KEY"]
    missing  = [k for k in required if not os.environ.get(k)]
    if missing:
        log.error("Missing env vars: %s", missing)
        sys.exit(1)


def main():
    parser = argparse.ArgumentParser(description="Election data pipeline orchestrator")
    parser.add_argument("--test",         action="store_true", help="Seed 5 test fixtures then run")
    parser.add_argument("--dry-run",      action="store_true", help="No DB writes")
    parser.add_argument("--stage",        type=int, choices=[1, 2, 3, 4, 5], help="Run one stage only")
    parser.add_argument("--skip-enrich",  action="store_true", help="Skip general Wikidata enrichment")
    args = parser.parse_args()

    check_env()

    sb            = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_KEY"])
    openai_client = generate_descriptions.get_openai()

    start = datetime.now()
    log.info("═══ Election pipeline start — %s ═══", start.strftime("%Y-%m-%d %H:%M"))

    # ── Stage 1: Resolve candidates ───────────────────────────────────────────
    if not args.stage or args.stage == 1:
        log.info("─── Stage 1: resolve candidates ───")
        if args.test:
            election_id = resolve_candidates.get_election_id(sb)
            party_map   = resolve_candidates.get_party_map(sb, election_id)
            resolve_candidates.seed_test(sb, election_id, party_map)
        resolve_candidates.run(sb, args.dry_run)

    # ── Stage 2: Wikidata enrichment ──────────────────────────────────────────
    if (not args.stage or args.stage == 2) and not args.skip_enrich:
        log.info("─── Stage 2: Wikidata enrichment ───")
        enrich_wikidata.run(sb, args.dry_run)

    # ── Stage 3: Generate descriptions ────────────────────────────────────────
    if not args.stage or args.stage == 3:
        log.info("─── Stage 3: generate descriptions ───")
        generate_descriptions.run(sb, openai_client, args.dry_run)

    # ── Stage 4: Geocode cities ───────────────────────────────────────────────
    if not args.stage or args.stage == 4:
        log.info("─── Stage 4: geocode cities ───")
        geocode_cities.run(sb, args.dry_run)

    # ── Stage 5: Fetch missing birth dates ────────────────────────────────────
    if not args.stage or args.stage == 5:
        log.info("─── Stage 5: fetch missing candidate birth dates ───")
        fetch_candidate_birthdates.run(sb, args.dry_run)

    elapsed = (datetime.now() - start).seconds
    log.info("═══ Pipeline complete in %dm %ds ═══", elapsed // 60, elapsed % 60)


if __name__ == "__main__":
    main()
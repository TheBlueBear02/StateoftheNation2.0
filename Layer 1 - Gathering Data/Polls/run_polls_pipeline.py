#!/usr/bin/env python3
"""
run_polls_pipeline.py — Polls Pipeline Orchestrator
====================================================
Runs all six pipeline stages in order:

  Stage 1  fetch_wikipedia      MediaWiki API → local cache + sync state
  Stage 2  parse_poll_tables   HTML wikitables → raw_poll_rows
  Stage 3  resolve_poll_parties  aliases → resolved party IDs
  Stage 4  normalize_polls     raw_poll_rows → polls + poll_results
  Stage 5  compute_aggregates  last3 + weighted → poll_aggregates
  Stage 6  validate_polls      hard gates + ops alerts

Usage:
  python run_polls_pipeline.py                # incremental
  python run_polls_pipeline.py --dry-run      # no DB writes
  python run_polls_pipeline.py --stage 4      # single stage
  python run_polls_pipeline.py --backfill     # all four pages
  python run_polls_pipeline.py --force        # re-parse even if revid unchanged

Requirements:
  pip install -r requirements.txt
  .env must contain SUPABASE_URL, SUPABASE_SERVICE_KEY
"""

from __future__ import annotations

import argparse
import logging
import os
import sys
from datetime import datetime

from dotenv import load_dotenv

import compute_aggregates
import fetch_wikipedia
import normalize_polls
import parse_poll_tables
import resolve_poll_parties
import validate_polls
from db import get_supabase

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger(__name__)


def check_env() -> None:
    missing = [k for k in ("SUPABASE_URL", "SUPABASE_SERVICE_KEY") if not os.environ.get(k)]
    if missing:
        log.error("Missing env vars: %s", missing)
        sys.exit(1)


def main() -> None:
    parser = argparse.ArgumentParser(description="Polls pipeline orchestrator")
    parser.add_argument("--dry-run", action="store_true", help="No DB writes")
    parser.add_argument("--stage", type=int, choices=[1, 2, 3, 4, 5, 6], help="Run one stage only")
    parser.add_argument("--backfill", action="store_true", help="All four wiki pages")
    parser.add_argument("--force", action="store_true", help="Re-fetch even if revid unchanged")
    args = parser.parse_args()

    check_env()
    sb = get_supabase()
    start = datetime.now()
    log.info("═══ Polls pipeline start — %s ═══", start.strftime("%Y-%m-%d %H:%M"))

    as_of_dates = None
    exit_code = 0

    if not args.stage or args.stage == 1:
        log.info("─── Stage 1: fetch Wikipedia ───")
        fetch_wikipedia.run(sb, backfill=args.backfill, force=args.force, dry_run=args.dry_run)

    if not args.stage or args.stage == 2:
        log.info("─── Stage 2: parse poll tables ───")
        parse_poll_tables.run(sb, backfill=args.backfill, force=args.force, dry_run=args.dry_run)

    if not args.stage or args.stage == 3:
        log.info("─── Stage 3: resolve poll parties ───")
        resolve_poll_parties.run(sb, args.dry_run)

    if not args.stage or args.stage == 4:
        log.info("─── Stage 4: normalize polls ───")
        normalize_polls.run(sb, args.dry_run)

    if not args.stage or args.stage == 5:
        log.info("─── Stage 5: compute aggregates ───")
        as_of_dates = compute_aggregates.run(sb, args.dry_run)

    if not args.stage or args.stage == 6:
        log.info("─── Stage 6: validate polls ───")
        exit_code = validate_polls.run(sb, as_of_dates, args.dry_run)

    elapsed = (datetime.now() - start).seconds
    log.info("═══ Pipeline complete in %dm %ds ═══", elapsed // 60, elapsed % 60)
    sys.exit(exit_code)


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Reset rejected/processed staging rows and clear polls for a full re-normalize."""

from __future__ import annotations

import argparse
import json
import logging
from pathlib import Path

from db import get_supabase

log = logging.getLogger(__name__)
REVIEW_FILE = Path(__file__).parent / "review_queue.json"


def run(*, full: bool = False) -> None:
    sb = get_supabase()

    sb.table("poll_aggregates").delete().neq("id", 0).execute()
    sb.table("polls").delete().neq("id", 0).execute()
    log.info("Cleared polls and poll_aggregates")

    if full:
        sb.table("raw_poll_rows").delete().neq("id", 0).execute()
        log.info("Cleared all raw_poll_rows — re-run stage 2 after this")
    else:
        sb.table("raw_poll_rows").update({
            "status": "pending",
            "error": None,
        }).in_("status", ["rejected", "processed", "superseded"]).execute()
        log.info("Re-queued rejected/processed/superseded raw_poll_rows")

    REVIEW_FILE.write_text("[]\n", encoding="utf-8")
    log.info("Cleared review_queue.json")


def main():
    logging.basicConfig(level=logging.INFO, format="%(asctime)s  %(levelname)-8s  %(message)s")
    parser = argparse.ArgumentParser(description="Reset polls staging for re-processing")
    parser.add_argument("--full", action="store_true", help="Also delete raw_poll_rows")
    args = parser.parse_args()
    run(full=args.full)


if __name__ == "__main__":
    main()

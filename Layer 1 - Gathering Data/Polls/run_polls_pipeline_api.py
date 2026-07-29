#!/usr/bin/env python3
"""
run_polls_pipeline_api.py — Polls pipeline API for /elections/polls/edit UI
============================================================================
Subcommands return JSON on the last stdout line when --json is passed.

Usage:
  python run_polls_pipeline_api.py status --json
  python run_polls_pipeline_api.py stage --stage 1 --json
  python run_polls_pipeline_api.py sync-full --json
  python run_polls_pipeline_api.py sync-full --force --json
  python run_polls_pipeline_api.py sync-full --backfill --json
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from datetime import datetime
from pathlib import Path

from dotenv import load_dotenv

import compute_aggregates
import fetch_wikipedia
import normalize_polls
import parse_poll_tables
import resolve_poll_parties
import validate_polls
from db import PIPELINE_NAME, get_supabase

load_dotenv()

STAGE_LABELS: dict[int, str] = {
    1: "משיכת ויקיפדיה",
    2: "פירוק טבלאות",
    3: "מיפוי מפלגות",
    4: "נרמול סקרים",
    5: "חישוב ממוצעים",
    6: "ולידציה",
}

TABLE_NAMES = [
    "polls",
    "poll_results",
    "raw_poll_rows",
    "poll_aggregates",
]

REVIEW_FILE = Path(__file__).resolve().parent / "review_queue.json"
LAST_RUN_FILE = Path(__file__).resolve().parent / "pipeline_last_run.json"


def read_last_run() -> dict | None:
    if not LAST_RUN_FILE.is_file():
        return None
    try:
        with open(LAST_RUN_FILE, encoding="utf-8") as handle:
            data = json.load(handle)
    except (json.JSONDecodeError, OSError):
        return None
    if isinstance(data, dict) and data.get("lastRunAt"):
        return data
    return None


def record_last_run(
    action: str,
    stage: int | None = None,
    summary: dict | None = None,
) -> str:
    last_run_at = datetime.now().isoformat(timespec="seconds")
    payload: dict = {
        "lastRunAt": last_run_at,
        "action": action,
    }
    if stage is not None:
        payload["stage"] = stage
    if summary is not None:
        payload["summary"] = summary

    with open(LAST_RUN_FILE, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=False, indent=2)

    return last_run_at


def empty_totals() -> dict:
    return {"upserted": 0, "inserted": 0, "updated": 0}


def make_stage_summary(
    stage: int,
    label: str,
    entries: list[dict],
    *,
    note: str | None = None,
) -> dict:
    stage_summary = {
        "stage": stage,
        "label": label,
        "entries": entries,
        "upserted": sum(int(entry.get("upserted", 0)) for entry in entries),
        "inserted": sum(int(entry.get("inserted", 0)) for entry in entries),
        "updated": sum(int(entry.get("updated", 0)) for entry in entries),
    }
    if note:
        stage_summary["note"] = note
    return stage_summary


def make_run_summary(stages: list[dict]) -> dict:
    totals = empty_totals()
    for stage_summary in stages:
        totals["upserted"] += int(stage_summary.get("upserted", 0))
        totals["inserted"] += int(stage_summary.get("inserted", 0))
        totals["updated"] += int(stage_summary.get("updated", 0))
    return {"stages": stages, "totals": totals}


def emit(result: dict, as_json: bool) -> None:
    if as_json:
        print(json.dumps(result, ensure_ascii=False))
    else:
        print(result)


def fail(message: str, as_json: bool, code: int = 1) -> None:
    emit({"ok": False, "error": message}, as_json)
    sys.exit(code)


def count_table_rows(sb, table: str) -> int:
    total = 0
    page_size = 1000
    offset = 0
    while True:
        rows = (
            sb.table(table)
            .select("id")
            .range(offset, offset + page_size - 1)
            .execute()
            .data
        )
        if not rows:
            break
        total += len(rows)
        if len(rows) < page_size:
            break
        offset += page_size
    return total


def count_pending_raw_rows(sb) -> int:
    total = 0
    page_size = 1000
    offset = 0
    while True:
        rows = (
            sb.table("raw_poll_rows")
            .select("id")
            .eq("status", "pending")
            .range(offset, offset + page_size - 1)
            .execute()
            .data
        )
        if not rows:
            break
        total += len(rows)
        if len(rows) < page_size:
            break
        offset += page_size
    return total


def load_sync_resources(sb) -> list[dict]:
    rows = (
        sb.table("pipeline_sync_state")
        .select("resource, last_revid, last_run_at, last_success_at")
        .eq("pipeline", PIPELINE_NAME)
        .execute()
        .data
    ) or []
    return [
        {
            "resource": row.get("resource"),
            "lastRevid": row.get("last_revid"),
            "lastRunAt": row.get("last_run_at"),
            "lastSuccessAt": row.get("last_success_at"),
        }
        for row in rows
    ]


def review_queue_count() -> int:
    if not REVIEW_FILE.is_file():
        return 0
    try:
        data = json.loads(REVIEW_FILE.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return 0
    return len(data) if isinstance(data, list) else 0


def cmd_status(sb, as_json: bool) -> None:
    tables: dict[str, int] = {}
    for table in TABLE_NAMES:
        tables[table] = count_table_rows(sb, table)

    last_run = read_last_run()
    sync_resources = load_sync_resources(sb)
    db_last_success = None
    for resource in sync_resources:
        stamp = resource.get("lastSuccessAt") or resource.get("lastRunAt")
        if stamp and (db_last_success is None or stamp > db_last_success):
            db_last_success = stamp

    emit(
        {
            "ok": True,
            "tables": tables,
            "pendingRawRows": count_pending_raw_rows(sb),
            "reviewQueueCount": review_queue_count(),
            "syncResources": sync_resources,
            "dbLastSuccessAt": db_last_success,
            "lastPipelineRunAt": last_run.get("lastRunAt") if last_run else None,
            "lastPipelineAction": last_run.get("action") if last_run else None,
            "lastPipelineStage": last_run.get("stage") if last_run else None,
            "lastRunSummary": last_run.get("summary") if last_run else None,
        },
        as_json,
    )


def run_stage(
    sb,
    stage: int,
    *,
    backfill: bool = False,
    force: bool = False,
) -> tuple[str, str, dict]:
    label = STAGE_LABELS[stage]

    if stage == 1:
        fetched = fetch_wikipedia.run(sb, backfill=backfill, force=force, dry_run=False)
        count = len(fetched)
        summary = make_run_summary(
            [
                make_stage_summary(
                    stage,
                    label,
                    [
                        {
                            "table": "pipeline_sync_state",
                            "upserted": count,
                            "inserted": count,
                            "updated": 0,
                        }
                    ],
                    note=f"נמשכו {count} דפים",
                )
            ]
        )
        return label, f"נמשכו {count} דפי ויקיפדיה", summary

    if stage == 2:
        inserted = parse_poll_tables.run(
            sb, backfill=backfill, force=force, dry_run=False
        )
        summary = make_run_summary(
            [
                make_stage_summary(
                    stage,
                    label,
                    [
                        {
                            "table": "raw_poll_rows",
                            "upserted": inserted,
                            "inserted": inserted,
                            "updated": 0,
                        }
                    ],
                )
            ]
        )
        return label, f"הוכנסו {inserted} שורות גולמיות חדשות", summary

    if stage == 3:
        resolved, rejected = resolve_poll_parties.run(sb, dry_run=False)
        review_count = review_queue_count()
        summary = make_run_summary(
            [
                make_stage_summary(
                    stage,
                    label,
                    [
                        {
                            "table": "raw_poll_rows",
                            "upserted": resolved + rejected,
                            "inserted": resolved,
                            "updated": rejected,
                        }
                    ],
                    note=f"נדחו {rejected}; תור בדיקה {review_count}",
                )
            ]
        )
        return (
            label,
            f"מופו {resolved} שורות, נדחו {rejected} (תור בדיקה: {review_count})",
            summary,
        )

    if stage == 4:
        processed = normalize_polls.run(sb, dry_run=False)
        summary = make_run_summary(
            [
                make_stage_summary(
                    stage,
                    label,
                    [
                        {
                            "table": "polls",
                            "upserted": processed,
                            "inserted": processed,
                            "updated": 0,
                        }
                    ],
                )
            ]
        )
        return label, f"נורמלו {processed} סקרים", summary

    if stage == 5:
        as_of_dates = compute_aggregates.run(sb, dry_run=False)
        count = len(as_of_dates)
        summary = make_run_summary(
            [
                make_stage_summary(
                    stage,
                    label,
                    [
                        {
                            "table": "poll_aggregates",
                            "upserted": count,
                            "inserted": count,
                            "updated": 0,
                        }
                    ],
                    note=f"{count} תאריכי as_of",
                )
            ]
        )
        return label, f"חושבו ממוצעים ל־{count} תאריכים", summary

    if stage == 6:
        exit_code = validate_polls.run(sb, None, dry_run=False, full=backfill)
        ok = exit_code == 0
        summary = make_run_summary(
            [
                make_stage_summary(
                    stage,
                    label,
                    [],
                    note="עבר" if ok else "אזהרות/שגיאות — בדקו לוגים",
                )
            ]
        )
        message = (
            "ולידציה עברה בהצלחה"
            if ok
            else "ולידציה דיווחה על אזהרות או שגיאות (הסנכרון הושלם)"
        )
        return label, message, summary

    raise ValueError(f"Invalid stage: {stage}")


def cmd_stage(
    sb,
    stage: int,
    as_json: bool,
    *,
    backfill: bool,
    force: bool,
) -> None:
    if stage < 1 or stage > 6:
        fail("מספר שלב לא תקין (1–6)", as_json)

    start = time.time()
    try:
        label, message, summary = run_stage(
            sb, stage, backfill=backfill, force=force
        )
    except Exception as exc:
        fail(str(exc), as_json)

    elapsed_seconds = int(time.time() - start)
    last_run_at = record_last_run("stage", stage, summary)
    emit(
        {
            "ok": True,
            "stage": stage,
            "label": label,
            "elapsedSeconds": elapsed_seconds,
            "message": message,
            "lastPipelineRunAt": last_run_at,
            "summary": summary,
        },
        as_json,
    )


def cmd_sync_full(
    sb,
    as_json: bool,
    *,
    backfill: bool,
    force: bool,
) -> None:
    start = time.time()
    stage_summaries: list[dict] = []
    messages: list[str] = []

    try:
        for stage in range(1, 7):
            _, message, summary = run_stage(
                sb, stage, backfill=backfill, force=force
            )
            messages.append(message)
            stage_summaries.extend(summary.get("stages", []))
    except Exception as exc:
        fail(str(exc), as_json)

    summary = make_run_summary(stage_summaries)
    elapsed_seconds = int(time.time() - start)
    last_run_at = record_last_run("sync-full", None, summary)
    emit(
        {
            "ok": True,
            "elapsedSeconds": elapsed_seconds,
            "message": "סנכרון סקרים הושלם — " + "; ".join(messages),
            "lastPipelineRunAt": last_run_at,
            "summary": summary,
        },
        as_json,
    )


def check_env() -> None:
    missing = [
        key
        for key in ("SUPABASE_URL", "SUPABASE_SERVICE_KEY")
        if not os.environ.get(key)
    ]
    if missing:
        raise RuntimeError(f"Missing env vars: {', '.join(missing)}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Polls pipeline API for edit UI")
    parser.add_argument(
        "command",
        choices=["status", "stage", "sync-full"],
        help="API command",
    )
    parser.add_argument("--stage", type=int, choices=[1, 2, 3, 4, 5, 6])
    parser.add_argument("--backfill", action="store_true")
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()

    try:
        check_env()
        sb = get_supabase()
    except Exception as exc:
        fail(str(exc), args.json)

    if args.command == "status":
        try:
            cmd_status(sb, args.json)
        except Exception as exc:
            fail(str(exc), args.json)
        return

    if args.command == "stage":
        if args.stage is None:
            fail("חסר --stage", args.json)
        cmd_stage(
            sb,
            args.stage,
            args.json,
            backfill=args.backfill,
            force=args.force,
        )
        return

    if args.command == "sync-full":
        cmd_sync_full(
            sb,
            args.json,
            backfill=args.backfill,
            force=args.force,
        )
        return


if __name__ == "__main__":
    main()

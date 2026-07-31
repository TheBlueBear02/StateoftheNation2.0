#!/usr/bin/env python3
"""
run_polls_pipeline_api.py — Polls pipeline API for /elections/polls/edit UI
============================================================================
Subcommands return JSON on the last stdout line when --json is passed.

Usage:
  python run_polls_pipeline_api.py status --json
  python run_polls_pipeline_api.py stage --stage 1 --json
  python run_polls_pipeline_api.py stage --stage 7 --since 2026-07-31T12:00:00+00:00 --json
  python run_polls_pipeline_api.py save-site-update --update-id 12 --headline "כותרת" --json
  python run_polls_pipeline_api.py sync-full --json
  python run_polls_pipeline_api.py sync-full --force --json
  python run_polls_pipeline_api.py sync-full --backfill --json
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import sys
import time
from contextlib import contextmanager
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

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from emit_site_updates import (  # noqa: E402
    emit_polls_run_update,
    update_site_update_headline,
)
from record_pipeline_run import record_pipeline_run  # noqa: E402

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(message)s",
    stream=sys.stderr,
)

STAGE_LABELS: dict[int, str] = {
    1: "משיכת ויקיפדיה",
    2: "פירוק טבלאות",
    3: "מיפוי מפלגות",
    4: "נרמול סקרים",
    5: "חישוב ממוצעים",
    6: "ולידציה",
    7: "יצירת עדכון",
}

TABLE_NAMES = [
    "polls",
    "poll_results",
    "raw_poll_rows",
    "poll_aggregates",
]

REVIEW_FILE = Path(__file__).resolve().parent / "review_queue.json"
LAST_RUN_FILE = Path(__file__).resolve().parent / "pipeline_last_run.json"
DIAGNOSTICS_LIMIT = 40


class _ListLogHandler(logging.Handler):
    def __init__(self) -> None:
        super().__init__(level=logging.WARNING)
        self.lines: list[str] = []

    def emit(self, record: logging.LogRecord) -> None:
        try:
            self.lines.append(self.format(record))
        except Exception:
            self.handleError(record)


@contextmanager
def capture_warnings():
    handler = _ListLogHandler()
    handler.setFormatter(logging.Formatter("%(levelname)s  %(name)s  %(message)s"))
    root = logging.getLogger()
    root.addHandler(handler)
    try:
        yield handler.lines
    finally:
        root.removeHandler(handler)


def recent_rejected_rows(sb, limit: int = 15) -> list[dict]:
    rows = (
        sb.table("raw_poll_rows")
        .select("id, status, error, section, payload, created_at")
        .eq("status", "rejected")
        .order("id", desc=True)
        .limit(limit)
        .execute()
        .data
    ) or []
    out: list[dict] = []
    for row in rows:
        payload = row.get("payload") or {}
        out.append(
            {
                "id": row.get("id"),
                "error": row.get("error"),
                "section": row.get("section"),
                "fieldwork": payload.get("fieldwork_raw"),
                "pollster": payload.get("pollster"),
                "publisher": payload.get("publisher"),
            }
        )
    return out


def build_diagnostics(
    log_lines: list[str],
    *,
    extra: list[str] | None = None,
    rejected: list[dict] | None = None,
) -> dict:
    lines = list(extra or [])
    lines.extend(log_lines)
    if rejected:
        for row in rejected:
            lines.append(
                "REJECTED  "
                f"id={row.get('id')}  "
                f"{row.get('fieldwork') or '?'} / "
                f"{row.get('pollster') or '?'} / "
                f"{row.get('publisher') or '?'} — "
                f"{row.get('error') or 'unknown'}"
            )
    # Preserve order, drop exact dupes, cap length.
    seen: set[str] = set()
    unique: list[str] = []
    for line in lines:
        text = (line or "").strip()
        if not text or text in seen:
            continue
        seen.add(text)
        unique.append(text)
        if len(unique) >= DIAGNOSTICS_LIMIT:
            break
    return {
        "lines": unique,
        "rejected": rejected or [],
    }


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
    diagnostics: dict | None = None,
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
    if diagnostics is not None:
        payload["diagnostics"] = diagnostics

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

    rejected = recent_rejected_rows(sb)
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
            "diagnostics": (
                (last_run.get("diagnostics") if last_run else None)
                or build_diagnostics([], rejected=rejected)
            ),
            "recentRejected": rejected,
        },
        as_json,
    )


def run_stage(
    sb,
    stage: int,
    *,
    backfill: bool = False,
    force: bool = False,
    since: datetime | None = None,
) -> tuple[str, str, dict, dict, dict | None]:
    label = STAGE_LABELS[stage]
    extra_lines: list[str] = []
    include_rejected = stage in (3, 4)
    site_update: dict | None = None

    with capture_warnings() as log_lines:
        if stage == 1:
            fetched = fetch_wikipedia.run(
                sb, backfill=backfill, force=force, dry_run=False
            )
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
            message = f"נמשכו {count} דפי ויקיפדיה"

        elif stage == 2:
            inserted = parse_poll_tables.run(
                sb, backfill=backfill, force=force, dry_run=False
            )
            if inserted == 0:
                extra_lines.append(
                    "INFO  stage 2  no new raw rows "
                    "(table unchanged, or parse yielded 0 — see warnings above)"
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
            message = f"הוכנסו {inserted} שורות גולמיות חדשות"

        elif stage == 3:
            resolved, rejected = resolve_poll_parties.run(sb, dry_run=False)
            review_count = review_queue_count()
            if rejected:
                extra_lines.append(
                    f"WARNING  stage 3  rejected {rejected} raw row(s) "
                    f"(unmapped labels or empty party results)"
                )
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
            message = (
                f"מופו {resolved} שורות, נדחו {rejected} "
                f"(תור בדיקה: {review_count})"
            )

        elif stage == 4:
            stats = normalize_polls.run(sb, dry_run=False)
            processed = int(stats.get("processed", 0))
            inserted = int(stats.get("inserted", 0))
            updated = int(stats.get("updated", 0))
            if processed == 0:
                message = "אין שורות ממתינות לנרמול"
                extra_lines.append(
                    "INFO  stage 4  normalized 0 polls "
                    "(no pending rows with resolved_parties)"
                )
            else:
                message = (
                    f"נורמלו {processed} סקרים ({inserted} חדשים, {updated} עודכנו)"
                )
            summary = make_run_summary(
                [
                    make_stage_summary(
                        stage,
                        STAGE_LABELS[stage],
                        [
                            {
                                "table": "polls",
                                "upserted": processed,
                                "inserted": inserted,
                                "updated": updated,
                            }
                        ],
                        note=message,
                    )
                ]
            )

        elif stage == 5:
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
            message = f"חושבו ממוצעים ל־{count} תאריכים"

        elif stage == 6:
            exit_code, validation_lines = validate_polls.run(
                sb, None, dry_run=False, full=backfill
            )
            ok = exit_code == 0
            extra_lines.extend(validation_lines)
            summary = make_run_summary(
                [
                    make_stage_summary(
                        stage,
                        label,
                        [],
                        note="עבר" if ok else "אזהרות/שגיאות — בדקו את קונסולת השגיאות",
                    )
                ]
            )
            message = (
                "ולידציה עברה בהצלחה"
                if ok
                else "ולידציה דיווחה על אזהרות או שגיאות (הסנכרון הושלם)"
            )

        elif stage == 7:
            site_update = emit_polls_run_update(sb, since=since)
            wrote = 1 if site_update else 0
            if site_update:
                message = f"נוצר עדכון לדף הבית: {site_update.get('headline')}"
                note = message
            else:
                message = "אין סקרים חדשים או יצירת הכותרת נכשלה — לא נשמר עדכון"
                note = message
                extra_lines.append(
                    "INFO  stage 7  no site_updates row "
                    "(no new polls in window, missing OPENAI_API_KEY, or LLM failure)"
                )
            summary = make_run_summary(
                [
                    make_stage_summary(
                        stage,
                        label,
                        [
                            {
                                "table": "site_updates",
                                "upserted": wrote,
                                "inserted": wrote,
                                "updated": 0,
                            }
                        ],
                        note=note,
                    )
                ]
            )

        else:
            raise ValueError(f"Invalid stage: {stage}")

    rejected_rows = recent_rejected_rows(sb) if include_rejected else []
    diagnostics = build_diagnostics(
        log_lines,
        extra=extra_lines,
        rejected=rejected_rows if include_rejected else None,
    )
    return label, message, summary, diagnostics, site_update


def cmd_stage(
    sb,
    stage: int,
    as_json: bool,
    *,
    backfill: bool,
    force: bool,
    since: datetime | None = None,
) -> None:
    if stage < 1 or stage > 7:
        fail("מספר שלב לא תקין (1–7)", as_json)

    start = time.time()
    started_at = datetime.now()
    try:
        label, message, summary, diagnostics, site_update = run_stage(
            sb, stage, backfill=backfill, force=force, since=since
        )
    except Exception as exc:
        record_pipeline_run(
            sb,
            pipeline="polls",
            action=f"stage-{stage}",
            status="error",
            message=f"Stage {stage} failed",
            error=str(exc),
            source="ui",
            started_at=started_at,
        )
        fail(str(exc), as_json)

    elapsed_seconds = int(time.time() - start)
    last_run_at = record_last_run("stage", stage, summary, diagnostics)
    note = None
    if summary.get("stages"):
        note = summary["stages"][0].get("note")
    status = "warning" if note and ("אזהר" in note or "שגיא" in note) else "success"
    if diagnostics.get("lines") and status == "success" and stage in (3, 4, 6, 7):
        if any(
            line.startswith(("ERROR", "WARNING", "REJECTED"))
            for line in diagnostics["lines"]
        ):
            status = "warning"
    record_pipeline_run(
        sb,
        pipeline="polls",
        action=f"stage-{stage}",
        status=status,
        message=message,
        summary={**summary, "diagnostics": diagnostics},
        source="ui",
        started_at=started_at,
    )
    payload: dict = {
        "ok": True,
        "stage": stage,
        "label": label,
        "elapsedSeconds": elapsed_seconds,
        "message": message,
        "lastPipelineRunAt": last_run_at,
        "summary": summary,
        "diagnostics": diagnostics,
    }
    if site_update is not None:
        payload["siteUpdate"] = site_update
    emit(payload, as_json)


def cmd_save_site_update(sb, update_id: int, headline: str, as_json: bool) -> None:
    if update_id < 1:
        fail("מזהה עדכון לא תקין", as_json)
    text = (headline or "").strip()
    if not text:
        fail("חסרה כותרת", as_json)
    saved = update_site_update_headline(sb, update_id=update_id, headline=text)
    if not saved:
        fail("שמירת הכותרת נכשלה", as_json)
    emit(
        {
            "ok": True,
            "message": "הכותרת נשמרה",
            "siteUpdate": saved,
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
    started_at = datetime.now()
    stage_summaries: list[dict] = []
    messages: list[str] = []
    all_log_lines: list[str] = []
    all_extra: list[str] = []
    site_update: dict | None = None

    try:
        for stage in range(1, 8):
            _, message, summary, diagnostics, stage_site_update = run_stage(
                sb,
                stage,
                backfill=backfill,
                force=force,
                since=started_at if stage == 7 else None,
            )
            messages.append(message)
            stage_summaries.extend(summary.get("stages", []))
            all_log_lines.extend(diagnostics.get("lines") or [])
            if stage_site_update is not None:
                site_update = stage_site_update
    except Exception as exc:
        record_pipeline_run(
            sb,
            pipeline="polls",
            action="backfill" if backfill else "sync-full",
            status="error",
            message="סנכרון סקרים נכשל",
            error=str(exc),
            source="ui",
            started_at=started_at,
        )
        fail(str(exc), as_json)

    rejected = recent_rejected_rows(sb)
    diagnostics = build_diagnostics(
        all_log_lines,
        extra=all_extra,
        rejected=rejected,
    )
    summary = make_run_summary(stage_summaries)
    elapsed_seconds = int(time.time() - start)
    last_run_at = record_last_run("sync-full", None, summary, diagnostics)
    joined = "; ".join(messages)
    status = "warning" if any("אזהר" in m or "שגיא" in m for m in messages) else "success"
    if diagnostics.get("lines") and any(
        line.startswith(("ERROR", "WARNING", "REJECTED"))
        for line in diagnostics["lines"]
    ):
        status = "warning"
    record_pipeline_run(
        sb,
        pipeline="polls",
        action="backfill" if backfill else "sync-full",
        status=status,
        message="סנכרון סקרים הושלם — " + joined,
        summary={**summary, "diagnostics": diagnostics},
        source="ui",
        started_at=started_at,
    )
    payload: dict = {
        "ok": True,
        "elapsedSeconds": elapsed_seconds,
        "message": "סנכרון סקרים הושלם — " + joined,
        "lastPipelineRunAt": last_run_at,
        "summary": summary,
        "diagnostics": diagnostics,
    }
    if site_update is not None:
        payload["siteUpdate"] = site_update
    emit(payload, as_json)


def check_env() -> None:
    missing = [
        key
        for key in ("SUPABASE_URL", "SUPABASE_SERVICE_KEY")
        if not os.environ.get(key)
    ]
    if missing:
        raise RuntimeError(f"Missing env vars: {', '.join(missing)}")


def _parse_since(value: str | None) -> datetime | None:
    if not value:
        return None
    text = value.strip()
    if not text:
        return None
    return datetime.fromisoformat(text.replace("Z", "+00:00"))


def main() -> None:
    parser = argparse.ArgumentParser(description="Polls pipeline API for edit UI")
    parser.add_argument(
        "command",
        choices=["status", "stage", "sync-full", "save-site-update"],
        help="API command",
    )
    parser.add_argument("--stage", type=int, choices=[1, 2, 3, 4, 5, 6, 7])
    parser.add_argument("--backfill", action="store_true")
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--since", type=str, default=None)
    parser.add_argument("--update-id", type=int, default=None)
    parser.add_argument("--headline", type=str, default=None)
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
        since = None
        try:
            since = _parse_since(args.since)
        except ValueError:
            fail("ערך --since לא תקין", args.json)
        cmd_stage(
            sb,
            args.stage,
            args.json,
            backfill=args.backfill,
            force=args.force,
            since=since,
        )
        return

    if args.command == "save-site-update":
        if args.update_id is None:
            fail("חסר --update-id", args.json)
        if args.headline is None:
            fail("חסרה --headline", args.json)
        cmd_save_site_update(sb, args.update_id, args.headline, args.json)
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

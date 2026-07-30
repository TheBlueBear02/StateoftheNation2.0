#!/usr/bin/env python3
"""
run_knesset_pipeline_api.py — Knesset pipeline API for /knesset/edit UI
========================================================================
Subcommands return JSON on the last stdout line when --json is passed.

Usage:
  python run_knesset_pipeline_api.py status --json
  python run_knesset_pipeline_api.py stage --stage 1 --json
  python run_knesset_pipeline_api.py faction-preview --json
  python run_knesset_pipeline_api.py faction-apply --json
  python run_knesset_pipeline_api.py images --json
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
import urllib.parse
from collections import Counter
from datetime import datetime
from pathlib import Path

from dotenv import load_dotenv

import fix_faction_links_all as faction_links
import load_all_knesset_data as sync

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from record_pipeline_run import record_pipeline_run  # noqa: E402

load_dotenv()

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
IMAGES_ROOT = PROJECT_ROOT / "public" / "images" / "KM Images" / "הכנסת ה25"
GITHUB_BASE = (
    "https://raw.githubusercontent.com/TheBlueBear02/StateoftheNation2.0/main/"
    "public/images/KM%20Images/%D7%94%D7%9B%D7%A0%D7%A1%D7%AA%20%D7%9425"
)

STAGE_LABELS: dict[int, str] = {
    1: "כנסות",
    2: "אנשים",
    3: "סיעות",
    4: "משרדים",
    5: "ממשלות",
    6: "חברויות ומינויים",
}

TABLE_NAMES = [
    "knessets",
    "people",
    "knesset_factions",
    "offices",
    "governments",
    "knesset_memberships",
    "minister_appointments",
]

PREVIEW_ITEM_LIMIT = 50
LAST_RUN_FILE = Path(__file__).resolve().parent / "pipeline_last_run.json"


def read_last_run() -> dict | None:
    if not LAST_RUN_FILE.is_file():
        return None
    try:
        with open(LAST_RUN_FILE, encoding="utf-8") as handle:
            data = json.load(handle)
        if isinstance(data, dict) and data.get("lastRunAt"):
            return data
    except (json.JSONDecodeError, OSError):
        return None
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


def totals_from_entries(entries: list[dict]) -> dict:
    totals = empty_totals()
    for entry in entries:
        totals["upserted"] += int(entry.get("upserted", 0))
        totals["inserted"] += int(entry.get("inserted", 0))
        totals["updated"] += int(entry.get("updated", 0))
    return totals


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


def merge_run_summaries(summaries: list[dict]) -> dict:
    stages: list[dict] = []
    for summary in summaries:
        stages.extend(summary.get("stages", []))
    return make_run_summary(stages)


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


def count_memberships_missing_faction(sb) -> int:
    total = 0
    page_size = 1000
    offset = 0
    while True:
        rows = (
            sb.table("knesset_memberships")
            .select("id")
            .is_("faction_id", "null")
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


def cmd_status(sb, as_json: bool) -> None:
    tables: dict[str, int] = {}
    for table in TABLE_NAMES:
        tables[table] = count_table_rows(sb, table)

    memberships_missing_faction = count_memberships_missing_faction(sb)
    last_run = read_last_run()

    emit(
        {
            "ok": True,
            "tables": tables,
            "membershipsMissingFaction": memberships_missing_faction,
            "lastPipelineRunAt": last_run.get("lastRunAt") if last_run else None,
            "lastPipelineAction": last_run.get("action") if last_run else None,
            "lastPipelineStage": last_run.get("stage") if last_run else None,
            "lastRunSummary": last_run.get("summary") if last_run else None,
        },
        as_json,
    )


def run_stage(sb, stage: int) -> tuple[str, str, dict]:
    if stage == 1:
        _, stats = sync.sync_knessets(sb)
        summary = make_run_summary(
            [make_stage_summary(stage, STAGE_LABELS[stage], [stats])]
        )
        return STAGE_LABELS[stage], "סנכרון כנסות הושלם", summary

    if stage == 2:
        _, stats = sync.sync_people(sb)
        summary = make_run_summary(
            [make_stage_summary(stage, STAGE_LABELS[stage], [stats])]
        )
        return STAGE_LABELS[stage], "סנכרון אנשים הושלם", summary

    knesset_map = sync.load_id_map(sb, "knessets", "knesset_number")
    people_map = sync.load_id_map(sb, "people", "knesset_person_id")
    faction_map = sync.load_id_map(sb, "knesset_factions", "knesset_faction_id")
    gov_map = sync.load_id_map(sb, "governments", "government_number")
    office_map = sync.load_id_map(sb, "offices", "knesset_category_id")

    if stage == 3:
        _, stats = sync.sync_factions(sb, knesset_map)
        summary = make_run_summary(
            [make_stage_summary(stage, STAGE_LABELS[stage], [stats])]
        )
        return STAGE_LABELS[stage], "סנכרון סיעות הושלם", summary

    if stage == 4:
        _, stats = sync.sync_offices(sb)
        summary = make_run_summary(
            [make_stage_summary(stage, STAGE_LABELS[stage], [stats])]
        )
        return STAGE_LABELS[stage], "סנכרון משרדים הושלם", summary

    if stage == 5:
        count = len(sync.sync_governments(sb))
        summary = make_run_summary(
            [
                make_stage_summary(
                    stage,
                    STAGE_LABELS[stage],
                    [],
                    note=f"נטענו {count} ממשלות מהמסד (ללא OData)",
                )
            ]
        )
        return STAGE_LABELS[stage], f"נטענו {count} ממשלות מהמסד (ללא OData)", summary

    if stage == 6:
        position_stats = sync.sync_positions(
            sb,
            people_map,
            knesset_map,
            faction_map,
            gov_map,
            office_map,
        )
        entries = [
            position_stats["knesset_memberships"],
            position_stats["knesset_memberships_faction_id"],
            position_stats["minister_appointments"],
        ]
        summary = make_run_summary(
            [make_stage_summary(stage, STAGE_LABELS[stage], entries)]
        )
        return STAGE_LABELS[stage], "סנכרון חברויות ומינויים הושלם", summary

    raise ValueError(f"Invalid stage: {stage}")


def cmd_stage(sb, stage: int, as_json: bool) -> None:
    if stage < 1 or stage > 6:
        fail("מספר שלב לא תקין (1–6)", as_json)

    start = time.time()
    started_at = datetime.now()
    try:
        label, message, summary = run_stage(sb, stage)
    except Exception as exc:
        record_pipeline_run(
            sb,
            pipeline="knesset",
            action=f"stage-{stage}",
            status="error",
            message=f"Stage {stage} failed",
            error=str(exc),
            source="ui",
            started_at=started_at,
        )
        fail(str(exc), as_json)

    elapsed_seconds = int(time.time() - start)
    last_run_at = record_last_run("stage", stage, summary)
    record_pipeline_run(
        sb,
        pipeline="knesset",
        action=f"stage-{stage}",
        status="success",
        message=message,
        summary=summary,
        source="ui",
        started_at=started_at,
    )
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


def cmd_sync_full(sb, as_json: bool) -> None:
    start = time.time()
    started_at = datetime.now()
    stage_summaries: list[dict] = []

    try:
        for stage in range(1, 7):
            _, _, summary = run_stage(sb, stage)
            stage_summaries.extend(summary.get("stages", []))
    except Exception as exc:
        record_pipeline_run(
            sb,
            pipeline="knesset",
            action="sync-full",
            status="error",
            message="סנכרון מלא נכשל",
            error=str(exc),
            source="ui",
            started_at=started_at,
        )
        fail(str(exc), as_json)

    summary = make_run_summary(stage_summaries)
    elapsed_seconds = int(time.time() - start)
    last_run_at = record_last_run("sync-full", None, summary)
    record_pipeline_run(
        sb,
        pipeline="knesset",
        action="sync-full",
        status="success",
        message="סנכרון מלא הושלם",
        summary=summary,
        source="ui",
        started_at=started_at,
    )
    emit(
        {
            "ok": True,
            "elapsedSeconds": elapsed_seconds,
            "message": "סנכרון מלא הושלם",
            "lastPipelineRunAt": last_run_at,
            "summary": summary,
        },
        as_json,
    )


def load_faction_plan(sb) -> tuple[list[faction_links.PlannedUpdate], Counter[str]]:
    source_factions = faction_links.load_source_factions()
    people = faction_links.fetch_all(sb, "people", "id,knesset_person_id,full_name")
    knessets = faction_links.fetch_all(
        sb,
        "knessets",
        "id,knesset_number,start_date,end_date,is_active",
    )
    factions = faction_links.fetch_all(
        sb,
        "knesset_factions",
        "id,knesset_faction_id,knesset_id,name,short_name",
    )
    memberships = faction_links.fetch_all(
        sb,
        "knesset_memberships",
        "id,knesset_id,person_id,faction_id,start_date,end_date",
    )
    return faction_links.plan_updates(
        people,
        knessets,
        factions,
        memberships,
        source_factions,
    )


def planned_update_to_dict(update: faction_links.PlannedUpdate) -> dict:
    return {
        "membershipId": update.membership_id,
        "knessetNumber": update.knesset_number,
        "personName": update.person_name,
        "currentFactionId": update.current_faction_id,
        "targetFactionId": update.target_faction_id,
        "factionName": update.faction_name,
        "referenceDate": update.reference_date,
    }


def cmd_faction_preview(sb, as_json: bool) -> None:
    try:
        planned_updates, _skipped = load_faction_plan(sb)
    except Exception as exc:
        fail(str(exc), as_json)

    by_knesset: dict[int, int] = {}
    for update in planned_updates:
        by_knesset[update.knesset_number] = by_knesset.get(update.knesset_number, 0) + 1

    emit(
        {
            "ok": True,
            "count": len(planned_updates),
            "byKnesset": by_knesset,
            "items": [
                planned_update_to_dict(update)
                for update in planned_updates[:PREVIEW_ITEM_LIMIT]
            ],
        },
        as_json,
    )


def cmd_faction_apply(sb, as_json: bool) -> None:
    try:
        planned_updates, _skipped = load_faction_plan(sb)
    except Exception as exc:
        fail(str(exc), as_json)

    if not planned_updates:
        summary = make_run_summary(
            [
                {
                    "label": "קישורי סיעות",
                    "entries": [
                        {
                            "table": "knesset_memberships.faction_id",
                            "upserted": 0,
                            "inserted": 0,
                            "updated": 0,
                        }
                    ],
                    "upserted": 0,
                    "inserted": 0,
                    "updated": 0,
                }
            ]
        )
        last_run_at = record_last_run("faction-apply", summary=summary)
        emit(
            {"ok": True, "applied": 0, "lastPipelineRunAt": last_run_at, "summary": summary},
            as_json,
        )
        return

    try:
        applied = faction_links.apply_updates(sb, planned_updates, limit=None)
    except Exception as exc:
        fail(str(exc), as_json)

    summary = make_run_summary(
        [
            {
                "label": "קישורי סיעות",
                "entries": [
                    {
                        "table": "knesset_memberships.faction_id",
                        "upserted": applied,
                        "inserted": 0,
                        "updated": applied,
                    }
                ],
                "upserted": applied,
                "inserted": 0,
                "updated": applied,
            }
        ]
    )
    last_run_at = record_last_run("faction-apply", summary=summary)
    emit(
        {
            "ok": True,
            "applied": applied,
            "lastPipelineRunAt": last_run_at,
            "summary": summary,
        },
        as_json,
    )


def cmd_images(sb, as_json: bool) -> None:
    if not IMAGES_ROOT.is_dir():
        fail(f"תיקיית תמונות לא נמצאה: {IMAGES_ROOT}", as_json)

    matched: list[str] = []
    unmatched: list[str] = []

    try:
        for party_folder in os.listdir(IMAGES_ROOT):
            party_path = IMAGES_ROOT / party_folder
            if not party_path.is_dir():
                continue

            for filename in os.listdir(party_path):
                if not filename.endswith(".jpeg"):
                    continue

                full_name = filename.replace(".jpeg", "")
                encoded_party = urllib.parse.quote(party_folder)
                encoded_name = urllib.parse.quote(filename)
                image_url = f"{GITHUB_BASE}/{encoded_party}/{encoded_name}"

                result = (
                    sb.table("people")
                    .update({"image_url": image_url})
                    .eq("full_name", full_name)
                    .execute()
                )

                if result.data:
                    matched.append(full_name)
                else:
                    unmatched.append(full_name)
    except Exception as exc:
        fail(str(exc), as_json)

    summary = make_run_summary(
        [
            {
                "label": "תמונות",
                "entries": [
                    {
                        "table": "people.image_url",
                        "upserted": len(matched),
                        "inserted": 0,
                        "updated": len(matched),
                        "unmatched": len(unmatched),
                    }
                ],
                "upserted": len(matched),
                "inserted": 0,
                "updated": len(matched),
            }
        ]
    )
    last_run_at = record_last_run("images", summary=summary)
    emit(
        {
            "ok": True,
            "matched": matched,
            "unmatched": unmatched,
            "matchedCount": len(matched),
            "unmatchedCount": len(unmatched),
            "lastPipelineRunAt": last_run_at,
            "summary": summary,
        },
        as_json,
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Knesset pipeline API")
    parser.add_argument(
        "command",
        choices=[
            "status",
            "stage",
            "sync-full",
            "faction-preview",
            "faction-apply",
            "images",
        ],
    )
    parser.add_argument("--stage", type=int, help="Sync stage number (1–6)")
    parser.add_argument("--json", action="store_true", help="Emit JSON on stdout")
    args = parser.parse_args()

    as_json = args.json

    try:
        sb = sync.get_supabase()
    except Exception as exc:
        fail(str(exc), as_json)

    if args.command == "status":
        cmd_status(sb, as_json)
        return

    if args.command == "stage":
        if args.stage is None:
            fail("חסר --stage", as_json)
        cmd_stage(sb, args.stage, as_json)
        return

    if args.command == "sync-full":
        cmd_sync_full(sb, as_json)
        return

    if args.command == "faction-preview":
        cmd_faction_preview(sb, as_json)
        return

    if args.command == "faction-apply":
        cmd_faction_apply(sb, as_json)
        return

    if args.command == "images":
        cmd_images(sb, as_json)
        return

    fail(f"Unknown command: {args.command}", as_json)


if __name__ == "__main__":
    main()

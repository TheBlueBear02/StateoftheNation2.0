#!/usr/bin/env python3
"""
run_party_pipeline_api.py  — Party pipeline API for /elections/edit UI
========================================================================
Subcommands return JSON on the last stdout line when --json is passed.

Usage:
  python run_party_pipeline_api.py preview --party-id 3 --text "..." --format txt --json
  python run_party_pipeline_api.py insert --party-id 3 --text "..." --format txt --json
  python run_party_pipeline_api.py stage --stage 1 --json
  python run_party_pipeline_api.py review-queue --party-id 3 --json
  python run_party_pipeline_api.py resolve-review --party-id 3 --actions '[...]' --json
"""

import argparse
import json
import logging
import os
import sys

from dotenv import load_dotenv

import enrich_wikidata
import fetch_candidate_birthdates
import fetch_candidate_wiki_urls
import generate_descriptions
import geocode_cities
import insert_raw_list
import resolve_candidates

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger(__name__)


def emit(result: dict, as_json: bool) -> None:
    if as_json:
        print(json.dumps(result, ensure_ascii=False))
    else:
        print(result)


def fail(message: str, as_json: bool, code: int = 1) -> None:
    emit({"ok": False, "error": message}, as_json)
    sys.exit(code)


def get_party(sb, party_id: int) -> dict | None:
    rows = (
        sb.table("election_parties")
        .select("id, name, short_name, election_id")
        .eq("id", party_id)
        .execute()
        .data
    )
    return rows[0] if rows else None


def party_key(party: dict) -> str:
    return party.get("short_name") or party["name"]


def parse_candidates(text: str, fmt: str) -> list[dict]:
    if fmt == "csv":
        return insert_raw_list.parse_csv_text(text)
    return insert_raw_list.parse_text_lines(text)


def candidates_to_preview(candidates: list[dict]) -> list[dict]:
    return [
        {
            "listPosition": c.get("list_position") or (i + 1),
            "name": c["name"],
            "city": c.get("city"),
        }
        for i, c in enumerate(candidates)
    ]


def load_review_queue() -> list[dict]:
    path = resolve_candidates.REVIEW_FILE
    if not os.path.exists(path):
        return []
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def save_review_queue(queue: list[dict]) -> None:
    with open(resolve_candidates.REVIEW_FILE, "w", encoding="utf-8") as f:
        json.dump(queue, f, ensure_ascii=False, indent=2)


def filter_review_for_party(party_id: int) -> list[dict]:
    return [
        item for item in load_review_queue()
        if item.get("party_id") == party_id
    ]


def read_text_arg(args) -> str:
    if args.text == '-':
        return sys.stdin.read()
    return args.text or ""


def cmd_preview(args) -> None:
    text = read_text_arg(args)
    if not text.strip():
        fail("רשימה ריקה", args.json)
        return

    try:
        candidates = parse_candidates(text, args.format)
    except Exception as exc:
        fail(f"שגיאה בפענוח הרשימה: {exc}", args.json)
        return

    if not candidates:
        fail("לא נמצאו מועמדים ברשימה — בדקו את הפורמט", args.json)
        return

    emit({
        "ok": True,
        "candidates": candidates_to_preview(candidates),
        "count": len(candidates),
    }, args.json)


def cmd_insert(args) -> None:
    sb = insert_raw_list.get_supabase()
    party = get_party(sb, args.party_id)
    if not party:
        fail(f"מפלגה {args.party_id} לא נמצאה", args.json)
        return

    text = read_text_arg(args)
    if not text.strip():
        fail("רשימה ריקה", args.json)
        return

    try:
        candidates = parse_candidates(text, args.format)
    except Exception as exc:
        fail(f"שגיאה בפענוח הרשימה: {exc}", args.json)
        return

    if not candidates:
        fail("לא נמצאו מועמדים ברשימה", args.json)
        return

    try:
        summary = insert_raw_list.insert_list_from_candidates(
            sb,
            party["election_id"],
            party["id"],
            party_key(party),
            candidates,
            dry_run=False,
        )
    except Exception as exc:
        fail(str(exc), args.json)
        return

    emit({"ok": True, **summary}, args.json)


def cmd_stage(args) -> None:
    sb = insert_raw_list.get_supabase()
    stage = args.stage

    try:
        if stage == 1:
            resolve_candidates.run(sb, dry_run=False)
            review_count = len(load_review_queue())
            emit({
                "ok": True,
                "message": f"שלב 1 הושלם",
                "reviewCount": review_count,
            }, args.json)
            return

        if stage == 2:
            enrich_wikidata.run(sb, dry_run=False)
        elif stage == 3:
            openai_client = generate_descriptions.get_openai()
            generate_descriptions.run(sb, openai_client, dry_run=False)
        elif stage == 4:
            geocode_cities.run(sb, dry_run=False)
        elif stage == 5:
            fetch_candidate_birthdates.run(sb, dry_run=False)
        elif stage == 6:
            fetch_candidate_wiki_urls.run(sb, dry_run=False)
        else:
            fail(f"שלב לא תקין: {stage}", args.json)
            return
    except Exception as exc:
        fail(str(exc), args.json)
        return

    emit({
        "ok": True,
        "message": f"שלב {stage} הושלם",
    }, args.json)


def cmd_review_queue(args) -> None:
    items = filter_review_for_party(args.party_id)
    emit({
        "ok": True,
        "items": [
            {
                "rawId": item["raw_id"],
                "rawName": item["raw_name"],
                "listPosition": item["list_position"],
                "bestMatch": item.get("best_match"),
                "bestMatchId": item.get("best_match_id"),
                "score": item.get("score"),
                "action": item.get("action", "pending"),
            }
            for item in items
        ],
    }, args.json)


def cmd_resolve_review(args) -> None:
    sb = insert_raw_list.get_supabase()
    party_id = args.party_id

    try:
        actions = json.loads(args.actions)
    except json.JSONDecodeError:
        fail("פורמט actions לא תקין", args.json)
        return

    if not isinstance(actions, list) or not actions:
        fail("יש לספק לפחות פעולה אחת", args.json)
        return

    queue = load_review_queue()
    if not queue:
        fail("אין תור בדיקה", args.json)
        return

    action_by_raw_id = {
        int(item["rawId"]): item
        for item in actions
        if "rawId" in item and "action" in item
    }

    updated = 0
    for entry in queue:
        if entry.get("party_id") != party_id:
            continue
        action_item = action_by_raw_id.get(entry["raw_id"])
        if not action_item:
            continue
        action = action_item["action"]
        if action not in ("approve", "new"):
            fail(f"פעולה לא תקינה עבור {entry['raw_name']}: {action}", args.json)
            return
        entry["action"] = action
        if action_item.get("correctPersonId"):
            entry["correct_person_id"] = action_item["correctPersonId"]
        updated += 1

    if updated == 0:
        fail("לא עודכנו פריטים בתור הבדיקה", args.json)
        return

    save_review_queue(queue)

    try:
        resolve_candidates.run_approve(sb, dry_run=False)
    except Exception as exc:
        fail(str(exc), args.json)
        return

    remaining = len(filter_review_for_party(party_id))
    emit({
        "ok": True,
        "updated": updated,
        "remaining": remaining,
        "message": f"עודכנו {updated} פריטים",
    }, args.json)


def main() -> None:
    parser = argparse.ArgumentParser(description="Party pipeline API for elections edit UI")
    subparsers = parser.add_subparsers(dest="command", required=True)

    json_flag = {"action": "store_true", "help": "Emit JSON on last stdout line"}

    preview = subparsers.add_parser("preview", help="Parse list text without DB writes")
    preview.add_argument("--party-id", type=int, required=True)
    preview.add_argument("--text", default="-", help="List text, or - for stdin")
    preview.add_argument("--format", choices=["txt", "csv"], default="txt")
    preview.add_argument("--json", **json_flag)

    insert_cmd = subparsers.add_parser("insert", help="Parse and insert into raw_candidate_lists")
    insert_cmd.add_argument("--party-id", type=int, required=True)
    insert_cmd.add_argument("--text", default="-", help="List text, or - for stdin")
    insert_cmd.add_argument("--format", choices=["txt", "csv"], default="txt")
    insert_cmd.add_argument("--json", **json_flag)

    stage_cmd = subparsers.add_parser("stage", help="Run one pipeline stage (1-6)")
    stage_cmd.add_argument("--stage", type=int, choices=[1, 2, 3, 4, 5, 6], required=True)
    stage_cmd.add_argument("--json", **json_flag)

    review_cmd = subparsers.add_parser("review-queue", help="List review queue items for a party")
    review_cmd.add_argument("--party-id", type=int, required=True)
    review_cmd.add_argument("--json", **json_flag)

    resolve_cmd = subparsers.add_parser("resolve-review", help="Apply review actions and approve")
    resolve_cmd.add_argument("--party-id", type=int, required=True)
    resolve_cmd.add_argument("--actions", required=True, help="JSON array of review actions")
    resolve_cmd.add_argument("--json", **json_flag)

    args = parser.parse_args()

    if not os.environ.get("SUPABASE_URL") or not os.environ.get("SUPABASE_SERVICE_KEY"):
        fail("חסרים משתני סביבה של Supabase", args.json)

    handlers = {
        "preview": cmd_preview,
        "insert": cmd_insert,
        "stage": cmd_stage,
        "review-queue": cmd_review_queue,
        "resolve-review": cmd_resolve_review,
    }
    handlers[args.command](args)


if __name__ == "__main__":
    main()

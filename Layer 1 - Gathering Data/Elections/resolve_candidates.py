#!/usr/bin/env python3
"""
resolve_candidates.py  — Pipeline Stage 1
==========================================
Reads raw_candidate_lists (processed=false), matches each name to
the people table, and inserts into election_candidates.

Usage:
  python resolve_candidates.py            # process all pending rows
  python resolve_candidates.py --test     # seed 5 known MKs and run
  python resolve_candidates.py --dry-run  # print matches, no DB writes
  python resolve_candidates.py --approve  # process review_queue.json after human review

Matching tiers:
  exact / normalized    → auto-commit
  fuzzy ≥ 0.85         → auto-commit
  fuzzy 0.65–0.84      → saved to review_queue.json (needs human decision)
  no match             → new people row created, then committed

Requirements:
  pip install supabase python-dotenv
"""

import os
import re
import json
import logging
import argparse
from difflib import SequenceMatcher

from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger(__name__)

FUZZY_AUTO   = 0.85   # above → auto-commit
FUZZY_REVIEW = 0.65   # above (but below AUTO) → review queue
REVIEW_FILE  = "review_queue.json"

# ── Test fixtures ─────────────────────────────────────────────────────────────
# party_name must match election_parties.name exactly as you inserted it.
# Adjust if your party names differ.
TEST_CANDIDATES = [
    {"raw_name": "בנימין נתניהו", "list_position": 1, "party_name": "הליכוד"},
    {"raw_name": "איתמר בן גביר", "list_position": 1, "party_name": "עוצמה יהודית"},
    {"raw_name": "אביגדור ליברמן", "list_position": 1, "party_name": "ישראל ביתנו"},
    {"raw_name": "יאיר לפיד",      "list_position": 2, "party_name": "ביחד"},
    {"raw_name": "מירב כהן",       "list_position": 5, "party_name": "ביחד"},
]


# ── Supabase ──────────────────────────────────────────────────────────────────

def get_supabase() -> Client:
    return create_client(
        os.environ["SUPABASE_URL"],
        os.environ["SUPABASE_SERVICE_KEY"],
    )


# ── Name normalisation ────────────────────────────────────────────────────────

TITLES = ['ד"ר', "פרופ'", "פרופ", "הרב", 'עו"ד', "רב", 'ח"כ', "גנרל", "אלוף"]

def normalize(name: str) -> str:
    """Strip titles, normalise Hebrew punctuation, collapse whitespace."""
    name = name.strip()
    for title in TITLES:
        name = name.replace(title, "")
    name = re.sub(r'[״"]', '"', name)
    name = re.sub(r"[׳'`]", "'", name)
    name = re.sub(r"\s+", " ", name)
    return name.strip()


def fuzzy(a: str, b: str) -> float:
    return SequenceMatcher(None, a, b).ratio()


# ── Entity resolution ─────────────────────────────────────────────────────────

def token_subset_match(a: str, b: str) -> bool:
    """
    Returns True if every token in the shorter name appears in the longer name.
    Handles middle names in either direction:
      "david bitan" vs "david bitan-amsalem"  -> True
      "yariv levin-koren" vs "yariv levin"     -> True
    Requires at least 2 tokens to avoid false positives on single-word names.
    """
    tokens_a = set(a.split())
    tokens_b = set(b.split())
    if len(tokens_a) <= len(tokens_b):
        shorter, longer = tokens_a, tokens_b
    else:
        shorter, longer = tokens_b, tokens_a
    return len(shorter) >= 2 and shorter.issubset(longer)


def resolve(raw_name: str, people: list[dict]) -> tuple:
    """
    Returns (matched_row | None, score, tier)
    tier: 'exact' | 'token' | 'fuzzy' | 'review' | 'none'

    Matching order:
      1. Exact (normalised)          -> auto-commit
      2. Token subset (middle names) -> auto-commit if exactly one match
      3. Fuzzy >= FUZZY_AUTO         -> auto-commit
      4. Fuzzy >= FUZZY_REVIEW       -> review queue
      5. No match                    -> review queue / new person
    """
    norm = normalize(raw_name)

    # 1. Exact match
    for p in people:
        if normalize(p["full_name"]) == norm:
            return p, 1.0, "exact"

    # 2. Token subset - catches middle name differences in either direction
    token_matches = [
        p for p in people
        if token_subset_match(norm, normalize(p["full_name"]))
    ]
    if len(token_matches) == 1:
        # Exactly one match - safe to auto-commit
        return token_matches[0], 0.95, "token"
    # If multiple matches share the same tokens, fall through to fuzzy

    # 3. Fuzzy match
    scored = sorted(
        [(p, fuzzy(norm, normalize(p["full_name"]))) for p in people],
        key=lambda x: x[1], reverse=True,
    )
    best, score = scored[0] if scored else (None, 0.0)

    if score >= FUZZY_AUTO:
        return best, score, "fuzzy"
    if score >= FUZZY_REVIEW:
        return best, score, "review"
    return None, score, "none"


# ── DB helpers ────────────────────────────────────────────────────────────────

def get_election_id(sb: Client, year: int = 2026) -> int:
    rows = sb.table("elections").select("id").eq("year", year).execute().data
    if not rows:
        raise ValueError(f"No election row for year={year}. Run the seed SQL first.")
    return rows[0]["id"]


def get_party_map(sb: Client, election_id: int) -> dict[str, int]:
    """Return {short_name -> party_id}. Falls back to name if short_name is null."""
    rows = (
        sb.table("election_parties")
        .select("id, name, short_name")
        .eq("election_id", election_id)
        .execute()
        .data
    )
    return {(r["short_name"] or r["name"]): r["id"] for r in rows}


def load_people(sb: Client) -> list[dict]:
    """Fetch ALL people rows, paginating past Supabase's 1000-row default limit."""
    all_people = []
    page_size  = 1000
    offset     = 0
    while True:
        batch = (
            sb.table("people")
            .select("id, full_name, knesset_person_id")
            .range(offset, offset + page_size - 1)
            .execute()
            .data
        )
        all_people.extend(batch)
        if len(batch) < page_size:
            break
        offset += page_size
    return all_people


def create_person(sb: Client, raw_name: str) -> int:
    result = sb.table("people").insert({"full_name": normalize(raw_name)}).execute()
    return result.data[0]["id"]


def upsert_candidate(sb, election_id, party_id, person_id, position, raw_city, dry_run):
    row = {
        "election_id":   election_id,
        "party_id":      party_id,
        "person_id":     person_id,
        "list_position": position,
        "city":          raw_city,
    }
    if dry_run:
        log.info("    [DRY RUN] %s", row)
        return
    sb.table("election_candidates").upsert(
        row, on_conflict="party_id,person_id"
    ).execute()


def mark_processed(sb, raw_id, dry_run):
    if not dry_run:
        sb.table("raw_candidate_lists").update({"processed": True}).eq("id", raw_id).execute()


# ── Test seeding ──────────────────────────────────────────────────────────────

def seed_test(sb: Client, election_id: int, party_map: dict) -> None:
    log.info("── Seeding %d test fixtures ──", len(TEST_CANDIDATES))

    if not party_map:
        log.error("No parties found in election_parties for election_id=%s", election_id)
        return

    rows = []
    for c in TEST_CANDIDATES:
        pid = party_map.get(c["party_name"])
        if not pid:
            log.warning(
                "  Party not found: '%s' — skipping %s\n"
                "  Available parties: %s",
                c["party_name"], c["raw_name"],
                ", ".join(f'"{n}"' for n in sorted(party_map.keys())),
            )
            continue
        rows.append({
            "election_id":   election_id,
            "party_id":      pid,
            "raw_name":      c["raw_name"],
            "list_position": c["list_position"],
            "processed":     False,
        })
    if rows:
        sb.table("raw_candidate_lists").insert(rows).execute()
        log.info("  Inserted %d rows", len(rows))


# ── Approve mode ──────────────────────────────────────────────────────────────

def run_approve(sb: Client, dry_run: bool) -> None:
    """
    Process review_queue.json after a human has set each item's
    'action' to either 'approve' (use best_match_id) or 'new' (create person).
    """
    if not os.path.exists(REVIEW_FILE):
        log.error("No %s found. Run the pipeline first to generate it.", REVIEW_FILE)
        return

    with open(REVIEW_FILE, encoding="utf-8") as f:
        queue = json.load(f)

    pending   = [item for item in queue if item["action"] == "pending"]
    approved  = [item for item in queue if item["action"] == "approve"]
    new_items = [item for item in queue if item["action"] == "new"]

    if pending:
        log.warning("%d items still pending - skipping them", len(pending))

    election_id = get_election_id(sb)

    for item in approved:
        # Use correct_person_id if the human supplied one, else use best_match_id
        person_id = item.get("correct_person_id") or item["best_match_id"]
        if item.get("correct_person_id"):
            log.info(
                "  APPROVE %-25s -> person_id %s (manual correction, was %s)",
                item["raw_name"], person_id, item["best_match_id"],
            )
        else:
            log.info(
                "  APPROVE %-25s -> person_id %s (best match: %s, score: %s)",
                item["raw_name"], person_id,
                item.get("best_match", "?"), item.get("score", "?"),
            )
        upsert_candidate(
            sb, election_id, item["party_id"],
            person_id, item["list_position"], None, dry_run,
        )
        mark_processed(sb, item["raw_id"], dry_run)

    for item in new_items:
        log.info("  NEW     %-25s -> creating person", item["raw_name"])
        person_id = create_person(sb, item["raw_name"]) if not dry_run else -1
        upsert_candidate(
            sb, election_id, item["party_id"],
            person_id, item["list_position"], None, dry_run,
        )
        mark_processed(sb, item["raw_id"], dry_run)

    remaining = [item for item in queue if item["action"] == "pending"]
    with open(REVIEW_FILE, "w", encoding="utf-8") as f:
        json.dump(remaining, f, ensure_ascii=False, indent=2)
    log.info(
        "Done - approved: %d, new: %d, still pending: %d",
        len(approved), len(new_items), len(remaining),
    )


# ── Main pipeline ─────────────────────────────────────────────────────────────

def run(sb: Client, dry_run: bool) -> None:
    election_id = get_election_id(sb)
    party_map   = get_party_map(sb, election_id)
    people      = load_people(sb)
    review      = []

    log.info("Loaded %d people · %d parties", len(people), len(party_map))

    raw_rows = (
        sb.table("raw_candidate_lists")
        .select("*")
        .eq("election_id", election_id)
        .eq("processed", False)
        .execute()
        .data
    )
    log.info("Pending raw rows: %d", len(raw_rows))

    if not raw_rows:
        log.info("Nothing to process.")
        return

    auto = new_count = review_count = 0

    for raw in raw_rows:
        name     = raw["raw_name"]
        party_id = raw["party_id"]
        position = raw["list_position"]
        city     = raw.get("raw_city")

        matched, score, tier = resolve(name, people)

        if tier == "review":
            log.warning(
                "  %-25s → REVIEW  best='%s' (%.2f)",
                name, matched["full_name"], score,
            )
            review.append({
                "raw_id":        raw["id"],
                "raw_name":      name,
                "party_id":      party_id,
                "list_position": position,
                "best_match":    matched["full_name"],
                "best_match_id": matched["id"],
                "score":         round(score, 3),
                "action":        "pending",
            })
            review_count += 1
            continue

        if tier == "none" or matched is None:
            log.info("  %-25s → NEW PERSON", name)
            person_id = create_person(sb, name) if not dry_run else -1
            new_count += 1
        else:
            log.info("  %-25s → %-6s '%s' (%.2f)", name, tier, matched["full_name"], score)
            person_id = matched["id"]
            auto += 1

        upsert_candidate(sb, election_id, party_id, person_id, position, city, dry_run)
        mark_processed(sb, raw["id"], dry_run)

    if review:
        with open(REVIEW_FILE, "w", encoding="utf-8") as f:
            json.dump(review, f, ensure_ascii=False, indent=2)
        log.warning(
            "%d rows need review → %s\n"
            "  Set each 'action' to 'approve' or 'new', then run --approve",
            len(review), REVIEW_FILE,
        )

    log.info("auto: %d · new: %d · review: %d", auto, new_count, review_count)


# ── CLI ───────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Stage 1 — resolve candidate names")
    parser.add_argument("--test",         action="store_true", help="Seed test fixtures then run")
    parser.add_argument("--dry-run",      action="store_true", help="Print matches, no DB writes")
    parser.add_argument("--approve",      action="store_true", help="Process review_queue.json")
    parser.add_argument("--list-parties", action="store_true", help="Print all party names in DB and exit")
    args = parser.parse_args()

    sb = get_supabase()

    if args.list_parties:
        election_id = get_election_id(sb)
        rows = (
            sb.table("election_parties")
            .select("name, short_name")
            .eq("election_id", election_id)
            .execute()
            .data
        )
        print("\nParties — short_name is the lookup key in TEST_CANDIDATES:")
        for r in sorted(rows, key=lambda x: x["short_name"] or x["name"]):
            key = r["short_name"] or r["name"]
            print(f'  key: "{key}"  →  full: "{r["name"]}"')
        return

    if args.approve:
        run_approve(sb, args.dry_run)
        return

    if args.test:
        election_id = get_election_id(sb)
        party_map   = get_party_map(sb, election_id)
        seed_test(sb, election_id, party_map)

    run(sb, args.dry_run)


if __name__ == "__main__":
    main()
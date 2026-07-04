#!/usr/bin/env python3
"""
generate_descriptions.py  — Pipeline Stage 3
=============================================
Generates a short Hebrew bio for each election candidate
who doesn't yet have a description.

Process per candidate:
  1. Fetch Wikipedia Hebrew article intro (free, no key)
  2. Send to OpenAI GPT-4o-mini with a tight prompt
  3. Write the result to election_candidates.description

Usage:
  python generate_descriptions.py           # all candidates without description
  python generate_descriptions.py --dry-run # print generated text, no writes

Requirements:
  pip install openai requests supabase python-dotenv
  OPENAI_API_KEY must be in .env
"""

import os
import time
import logging
import argparse

import requests
from openai import OpenAI
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger(__name__)

WIKI_API  = "https://he.wikipedia.org/api/rest_v1/page/summary/{}"
OPENAI_MODEL = "gpt-4o-mini"
REQUEST_DELAY = 0.5   # seconds between OpenAI calls


def get_supabase() -> Client:
    return create_client(
        os.environ["SUPABASE_URL"],
        os.environ["SUPABASE_SERVICE_KEY"],
    )


def get_openai() -> OpenAI:
    return OpenAI(api_key=os.environ["OPENAI_API_KEY"])


def get_election_id(sb: Client, year: int = 2026) -> int:
    rows = sb.table("elections").select("id").eq("year", year).execute().data
    return rows[0]["id"]


# ── Wikipedia ─────────────────────────────────────────────────────────────────

def fetch_wikipedia_intro(name: str) -> str | None:
    """
    Fetch the opening paragraph of the Hebrew Wikipedia article for a person.
    Returns plain text intro or None if not found.
    """
    url = WIKI_API.format(requests.utils.quote(name))
    try:
        resp = requests.get(url, timeout=10, headers={"Accept": "application/json"})
        if resp.status_code == 200:
            data    = resp.json()
            extract = data.get("extract", "").strip()
            if extract:
                # Take only the first 500 chars to keep the prompt tight
                return extract[:500]
    except Exception as exc:
        log.warning("    Wikipedia fetch failed for '%s': %s", name, exc)
    return None


# ── OpenAI ────────────────────────────────────────────────────────────────────

SYSTEM_PROMPT = """אתה כותב תיאורים קצרים ומדויקים על פוליטיקאים ישראלים עבור אתר נתוני אזרחות.
כתוב שתי משפטים בלבד בעברית. המשפטים יהיו עובדתיים, ניטרליים ותמציתיים.
אל תכלול דעות, שיפוטים, או מידע שאינו מאומת. אל תתחיל ב"הוא" או "היא" — התחיל בשם המלא."""

USER_PROMPT = """כתוב תיאור של שתי משפטים על {name}, המתמודד/ת בבחירות 2026 מטעם {party}.

מידע רקע מויקיפדיה:
{wiki}

כתוב שתי משפטים בלבד, בעברית."""

USER_PROMPT_NO_WIKI = """כתוב תיאור של שתי משפטים על {name}, המתמודד/ת בבחירות 2026 מטעם {party}.
כתוב שתי משפטים בלבד, בעברית, על סמך הידוע לך."""


def generate_description(
    client:    OpenAI,
    name:      str,
    party:     str,
    wiki_text: str | None,
) -> str | None:
    if wiki_text:
        user_msg = USER_PROMPT.format(name=name, party=party, wiki=wiki_text)
    else:
        user_msg = USER_PROMPT_NO_WIKI.format(name=name, party=party)

    try:
        resp = client.chat.completions.create(
            model=OPENAI_MODEL,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user",   "content": user_msg},
            ],
            max_tokens=200,
            temperature=0.3,
        )
        text = resp.choices[0].message.content.strip()
        return text if text else None
    except Exception as exc:
        log.warning("    OpenAI failed for '%s': %s", name, exc)
        return None


# ── Main ──────────────────────────────────────────────────────────────────────

def run(sb: Client, openai_client: OpenAI, dry_run: bool) -> None:
    election_id = get_election_id(sb)

    # Load candidates without a description, joined to people + party name
    ec_rows = (
        sb.table("election_candidates")
        .select("id, person_id, party_id")
        .eq("election_id", election_id)
        .is_("description", "null")
        .execute()
        .data
    )
    if not ec_rows:
        log.info("All candidates already have descriptions.")
        return

    log.info("Generating descriptions for %d candidates…", len(ec_rows))

    # Build person_id → name lookup
    person_ids = list({r["person_id"] for r in ec_rows})
    people = {}
    for i in range(0, len(person_ids), 200):
        batch = (
            sb.table("people")
            .select("id, full_name")
            .in_("id", person_ids[i:i + 200])
            .execute()
            .data
        )
        for p in batch:
            people[p["id"]] = p["full_name"]

    # Build party_id → name lookup
    party_ids = list({r["party_id"] for r in ec_rows})
    parties = {}
    for i in range(0, len(party_ids), 200):
        batch = (
            sb.table("election_parties")
            .select("id, name")
            .in_("id", party_ids[i:i + 200])
            .execute()
            .data
        )
        for p in batch:
            parties[p["id"]] = p["name"]

    success = failed = 0

    for ec in ec_rows:
        name  = people.get(ec["person_id"], "")
        party = parties.get(ec["party_id"], "")

        if not name:
            log.warning("  No name for person_id=%s — skipping", ec["person_id"])
            continue

        log.info("  %-25s (%s)…", name, party)

        wiki_text = fetch_wikipedia_intro(name)
        if wiki_text:
            log.info("    Wikipedia: found (%d chars)", len(wiki_text))
        else:
            log.info("    Wikipedia: not found — using model knowledge only")

        description = generate_description(openai_client, name, party, wiki_text)

        if not description:
            log.warning("    Failed to generate description")
            failed += 1
            continue

        log.info("    → %s", description[:80] + "…" if len(description) > 80 else description)

        if not dry_run:
            sb.table("election_candidates").update(
                {"description": description}
            ).eq("id", ec["id"]).execute()

        success += 1
        time.sleep(REQUEST_DELAY)

    log.info("Done — success: %d · failed: %d", success, failed)


def main():
    parser = argparse.ArgumentParser(description="Stage 3 — generate Hebrew descriptions")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    sb     = get_supabase()
    openai = get_openai()
    run(sb, openai, args.dry_run)


if __name__ == "__main__":
    main()

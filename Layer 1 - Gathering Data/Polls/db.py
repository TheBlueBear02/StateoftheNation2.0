"""Shared Supabase helpers for the polls pipeline."""

from __future__ import annotations

import os
from datetime import date, datetime
from zoneinfo import ZoneInfo

from dotenv import load_dotenv
from supabase import Client, create_client

load_dotenv()

JERUSALEM = ZoneInfo("Asia/Jerusalem")
PIPELINE_NAME = "polls"
ELECTION_YEAR = 2026
FALLBACK_ELECTION_DATE = date(2026, 10, 27)

WIKI_PAGES = [
    "Opinion_polling_for_the_2026_Israeli_legislative_election",
    "2025_opinion_polling_for_the_2026_Israeli_legislative_election",
    "2024_opinion_polling_for_the_2026_Israeli_legislative_election",
    "2022–2023_opinion_polling_for_the_2026_Israeli_legislative_election",
]

MAIN_WIKI_PAGE = WIKI_PAGES[0]

USER_AGENT = (
    "StateOfTheNationPollsBot/1.0 "
    "(https://github.com/stateofthenation; contact: polls@stateofthenation.org)"
)


def get_supabase() -> Client:
    return create_client(
        os.environ["SUPABASE_URL"],
        os.environ["SUPABASE_SERVICE_KEY"],
    )


def get_election_id(sb: Client, year: int = ELECTION_YEAR) -> int:
    rows = sb.table("elections").select("id, date").eq("year", year).execute().data
    if not rows:
        raise ValueError(f"No election row for year={year}")
    return rows[0]["id"]


def get_election_date(sb: Client, year: int = ELECTION_YEAR) -> date:
    rows = sb.table("elections").select("date").eq("year", year).execute().data
    if rows and rows[0].get("date"):
        return date.fromisoformat(rows[0]["date"][:10])
    return FALLBACK_ELECTION_DATE


def today_jerusalem() -> date:
    return datetime.now(JERUSALEM).date()


def normalize_party_short_name(name: str) -> str:
    """Collapse Hebrew quote/dash/space variants (ש״ס / ש\"ס / שס) for matching."""
    collapsed = name.strip()
    for ch in (" ", "-", "–", "—", '"', "״", "'", "׳", "`"):
        collapsed = collapsed.replace(ch, "")
    return collapsed


def party_id_by_short_name(sb: Client, election_id: int) -> dict[str, int]:
    rows = (
        sb.table("election_parties")
        .select("id, short_name")
        .eq("election_id", election_id)
        .execute()
        .data
    )
    return {r["short_name"]: r["id"] for r in rows if r.get("short_name")}


def party_id_by_normalized_short_name(sb: Client, election_id: int) -> dict[str, int]:
    """Map normalized short_name → party_id (first / lowest id wins for duplicates)."""
    rows = (
        sb.table("election_parties")
        .select("id, short_name")
        .eq("election_id", election_id)
        .order("id")
        .execute()
        .data
    )
    out: dict[str, int] = {}
    for row in rows:
        sn = row.get("short_name")
        if not sn:
            continue
        key = normalize_party_short_name(sn)
        if key and key not in out:
            out[key] = row["id"]
    return out


def resolve_publisher_id(sb: Client, publisher: str) -> int | None:
    """
    Resolve polls.publisher text → poll_publishers.id.

    publisher text remains the pipeline identity string; publisher_id is the FK
    used for logos / display. Creates a stub publisher row when missing.
    """
    name = (publisher or "").strip()
    if not name:
        return None

    existing = (
        sb.table("poll_publishers")
        .select("id")
        .eq("name", name)
        .limit(1)
        .execute()
        .data
    )
    if existing:
        return existing[0]["id"]

    inserted = (
        sb.table("poll_publishers")
        .insert({"name": name})
        .execute()
        .data
    )
    if not inserted:
        return None
    return inserted[0]["id"]

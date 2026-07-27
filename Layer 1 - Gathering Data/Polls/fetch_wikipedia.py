#!/usr/bin/env python3
"""Stage 1 — Fetch Wikipedia poll pages via MediaWiki API."""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from pathlib import Path

import requests
from supabase import Client

from db import MAIN_WIKI_PAGE, PIPELINE_NAME, USER_AGENT, WIKI_PAGES, get_supabase

log = logging.getLogger(__name__)

CACHE_DIR = Path(__file__).parent / ".cache"
API_URL = "https://en.wikipedia.org/w/api.php"


def _fetch_page(page: str) -> dict:
    params = {
        "action": "parse",
        "page": page,
        "prop": "text|revid|sections",
        "format": "json",
        "formatversion": "2",
    }
    resp = requests.get(
        API_URL,
        params=params,
        headers={"User-Agent": USER_AGENT},
        timeout=60,
    )
    resp.raise_for_status()
    data = resp.json()
    if "error" in data:
        raise RuntimeError(f"MediaWiki API error for {page}: {data['error']}")
    return data["parse"]


def _get_sync_state(sb: Client, page: str) -> dict | None:
    rows = (
        sb.table("pipeline_sync_state")
        .select("*")
        .eq("pipeline", PIPELINE_NAME)
        .eq("resource", page)
        .execute()
        .data
    )
    return rows[0] if rows else None


def _update_sync_state(
    sb: Client,
    page: str,
    *,
    revid: int | None = None,
    success: bool = False,
    dry_run: bool = False,
) -> None:
    now = datetime.now(timezone.utc).isoformat()
    existing = _get_sync_state(sb, page)

    row: dict = {"pipeline": PIPELINE_NAME, "resource": page, "last_run_at": now}
    if success and revid is not None:
        row["last_revid"] = revid
        row["last_success_at"] = now

    if dry_run:
        return

    if existing:
        sb.table("pipeline_sync_state").update(row).eq("id", existing["id"]).execute()
    else:
        sb.table("pipeline_sync_state").insert(row).execute()


def _cache_path(page: str) -> Path:
    safe = page.replace("/", "_").replace("–", "-")
    return CACHE_DIR / f"{safe}.json"


def fetch_page(
    sb: Client,
    page: str,
    *,
    force: bool = False,
    backfill: bool = False,
    dry_run: bool = False,
) -> dict | None:
    """Fetch one page. Returns parse dict or None if skipped (unchanged revid)."""
    log.info("Fetching %s", page)
    _update_sync_state(sb, page, dry_run=dry_run)

    if not backfill and not force:
        state = _get_sync_state(sb, page)
        if state and state.get("last_revid"):
            try:
                head = requests.get(
                    API_URL,
                    params={"action": "parse", "page": page, "prop": "revid", "format": "json", "formatversion": "2"},
                    headers={"User-Agent": USER_AGENT},
                    timeout=30,
                ).json()
                current_revid = head["parse"]["revid"]
                if current_revid == state["last_revid"]:
                    log.info("  revid unchanged (%d) — skipping fetch", current_revid)
                    cached = _cache_path(page)
                    if cached.exists():
                        return json.loads(cached.read_text(encoding="utf-8"))
                    return None
            except Exception as exc:
                log.warning("  revid pre-check failed: %s — fetching anyway", exc)

    parsed = _fetch_page(page)
    revid = parsed["revid"]
    log.info("  revid=%d, sections=%d", revid, len(parsed.get("sections", [])))

    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    cache_file = _cache_path(page)
    if not dry_run:
        cache_file.write_text(json.dumps(parsed, ensure_ascii=False), encoding="utf-8")

    _update_sync_state(sb, page, revid=revid, success=True, dry_run=dry_run)
    return parsed


def run(
    sb: Client,
    *,
    backfill: bool = False,
    force: bool = False,
    dry_run: bool = False,
    pages: list[str] | None = None,
) -> list[dict]:
    target_pages = pages or (WIKI_PAGES if backfill else [MAIN_WIKI_PAGE])
    results = []
    for page in target_pages:
        parsed = fetch_page(sb, page, force=force, backfill=backfill, dry_run=dry_run)
        if parsed:
            results.append({"page": page, "parse": parsed})
    return results


def load_cached(page: str) -> dict | None:
    cache_file = _cache_path(page)
    if cache_file.exists():
        return json.loads(cache_file.read_text(encoding="utf-8"))
    return None


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s  %(levelname)-8s  %(message)s")
    run(get_supabase(), backfill=True)

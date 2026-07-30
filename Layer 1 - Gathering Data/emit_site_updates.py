"""Shared helper — emit homepage news-strip updates from pipeline finish hooks.

Best-effort: never raises. Missing OPENAI_API_KEY or empty facts → skip.
Orchestrators must call emit only when the run produced new/changed data
(e.g. polls inserted > 0, knesset position diffs non-empty, new candidates > 0).
"""

from __future__ import annotations

import json
import logging
import os
from datetime import datetime, timezone
from typing import Any

from supabase import Client

log = logging.getLogger(__name__)

OPENAI_MODEL = "gpt-4o"
MAX_FACTS_ITEMS = 20

SYSTEM_PROMPT = """אתה כותב כותרות חדשות קצרות בעברית לאתר מצב האומה.

כתוב כותרת אחת בלבד לפי הכללים הבאים:
- טון חדשותי רשמי אך טבעי
- לכל היותר 8 מילים
- חייב להזכיר את העמוד הרלוונטי שמופיע בנתונים (למשל עמוד הסקרים / עמוד הכנסת / עמוד הבחירות)
- עובדתי בלבד — השתמש רק בנתונים שסופקו, בלי השערות
- בלי מרכאות, בלי אימוג'י, בלי סימני פיסוק מיותרים בסוף
- החזר רק את הכותרת, בלי הסבר"""


def _facts_are_empty(facts: dict[str, Any]) -> bool:
    if not facts:
        return True
    for key, value in facts.items():
        if key in ("pipeline", "page", "href"):
            continue
        if isinstance(value, list) and value:
            return False
        if isinstance(value, dict) and value:
            return False
        if isinstance(value, (int, float)) and value:
            return False
        if isinstance(value, str) and value.strip():
            return False
    return True


def _word_count(text: str) -> int:
    return len([w for w in text.split() if w])


def _generate_headline(
    *,
    page_label_he: str,
    facts: dict[str, Any],
) -> str | None:
    try:
        from openai import OpenAI
    except ImportError as exc:
        log.warning("openai package not installed — skip site_updates: %s", exc)
        return None

    user_msg = (
        f"עמוד רלוונטי: {page_label_he}\n"
        f"נתוני השינוי (JSON):\n{json.dumps(facts, ensure_ascii=False, default=str)}"
    )
    try:
        client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])
        resp = client.chat.completions.create(
            model=OPENAI_MODEL,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_msg},
            ],
            max_tokens=60,
            temperature=0.3,
        )
        text = (resp.choices[0].message.content or "").strip()
        text = text.strip('"\'«»')
        if not text:
            return None
        if _word_count(text) > 8:
            log.warning("site_updates headline exceeded 8 words: %s", text)
        return text
    except Exception as exc:
        log.warning("OpenAI headline generation failed: %s", exc)
        return None


def emit_pipeline_site_update(
    sb: Client,
    *,
    event_type: str,
    href: str,
    page_label_he: str,
    facts: dict[str, Any],
    dedupe_key: str,
    pipeline_run_id: int | None = None,
) -> None:
    """Insert one homepage ticker row. Never raises."""
    try:
        if _facts_are_empty(facts):
            return
        if not os.environ.get("OPENAI_API_KEY"):
            log.warning("OPENAI_API_KEY missing — skip site_updates emit")
            return

        payload = {
            **facts,
            "pipeline": facts.get("pipeline") or event_type,
            "page": page_label_he,
            "href": href,
        }
        headline = _generate_headline(page_label_he=page_label_he, facts=payload)
        if not headline:
            return

        row = {
            "event_type": event_type,
            "headline": headline,
            "href": href,
            "payload": payload,
            "dedupe_key": dedupe_key,
            "pipeline_run_id": pipeline_run_id,
            "occurred_at": datetime.now(timezone.utc).isoformat(),
        }
        sb.table("site_updates").upsert(row, on_conflict="dedupe_key").execute()
        log.info("site_updates: %s → %s", event_type, headline)
    except Exception as exc:
        log.warning("Failed to emit site_updates row: %s", exc)


# ── Polls collector ───────────────────────────────────────────────────────────

def emit_polls_run_update(
    sb: Client,
    *,
    since: datetime,
    pipeline_run_id: int | None = None,
) -> None:
    """Emit one summary if new non-scenario polls were created since `since`."""
    try:
        since_iso = since.astimezone(timezone.utc).isoformat() if since.tzinfo else since.replace(tzinfo=timezone.utc).isoformat()
        rows = (
            sb.table("polls")
            .select(
                "id, publisher, publisher_he, pollster, pollster_he, fieldwork_end, created_at"
            )
            .eq("is_scenario", False)
            .gte("created_at", since_iso)
            .order("created_at", desc=True)
            .limit(MAX_FACTS_ITEMS)
            .execute()
            .data
            or []
        )
        if not rows:
            return

        publishers: dict[str, str] = {}
        try:
            names = list({r["publisher"] for r in rows if r.get("publisher")})
            if names:
                pub_rows = (
                    sb.table("poll_publishers")
                    .select("name, name_he")
                    .in_("name", names)
                    .execute()
                    .data
                    or []
                )
                publishers = {
                    p["name"]: (p.get("name_he") or p["name"]) for p in pub_rows
                }
        except Exception as exc:
            log.warning("poll_publishers lookup failed: %s", exc)

        new_polls = []
        for r in rows:
            publisher = r.get("publisher") or ""
            publisher_he = (
                r.get("publisher_he")
                or publishers.get(publisher)
                or publisher
            )
            new_polls.append(
                {
                    "publisher_he": publisher_he,
                    "pollster_he": r.get("pollster_he") or r.get("pollster"),
                    "fieldwork_end": r.get("fieldwork_end"),
                }
            )

        poll_ids = sorted(str(r["id"]) for r in rows)
        dedupe = f"polls:{since_iso}:{','.join(poll_ids)}"
        emit_pipeline_site_update(
            sb,
            event_type="polls_run",
            href="/elections/polls",
            page_label_he="עמוד הסקרים",
            facts={
                "pipeline": "polls",
                "new_poll_count": len(new_polls),
                "new_polls": new_polls,
            },
            dedupe_key=dedupe[:500],
            pipeline_run_id=pipeline_run_id,
        )
    except Exception as exc:
        log.warning("emit_polls_run_update failed: %s", exc)


# ── Knesset collector ─────────────────────────────────────────────────────────

def snapshot_knesset_positions(sb: Client) -> dict[str, dict[str, Any]]:
    """Read-only snapshot of memberships + appointments for field-level diffs."""
    snap: dict[str, dict[str, Any]] = {"memberships": {}, "appointments": {}}
    try:
        memberships = (
            sb.table("knesset_memberships")
            .select(
                "knesset_position_id, person_id, start_date, end_date, duty_desc"
            )
            .execute()
            .data
            or []
        )
        for row in memberships:
            key = str(row["knesset_position_id"])
            snap["memberships"][key] = {
                "person_id": row.get("person_id"),
                "start_date": row.get("start_date"),
                "end_date": row.get("end_date"),
                "duty_desc": row.get("duty_desc"),
            }

        appointments = (
            sb.table("minister_appointments")
            .select(
                "knesset_position_id, person_id, office_id, start_date, end_date, "
                "duty_desc, is_current"
            )
            .execute()
            .data
            or []
        )
        for row in appointments:
            key = str(row["knesset_position_id"])
            snap["appointments"][key] = {
                "person_id": row.get("person_id"),
                "office_id": row.get("office_id"),
                "start_date": row.get("start_date"),
                "end_date": row.get("end_date"),
                "duty_desc": row.get("duty_desc"),
                "is_current": row.get("is_current"),
            }
    except Exception as exc:
        log.warning("snapshot_knesset_positions failed: %s", exc)
    return snap


def _person_names(sb: Client, person_ids: set[int]) -> dict[int, str]:
    if not person_ids:
        return {}
    try:
        rows = (
            sb.table("people")
            .select("id, full_name")
            .in_("id", list(person_ids))
            .execute()
            .data
            or []
        )
        return {int(r["id"]): r.get("full_name") or str(r["id"]) for r in rows}
    except Exception as exc:
        log.warning("people name lookup failed: %s", exc)
        return {}


def _diff_position_maps(
    before: dict[str, dict[str, Any]],
    after: dict[str, dict[str, Any]],
    *,
    kind: str,
) -> list[dict[str, Any]]:
    changes: list[dict[str, Any]] = []
    for key, after_row in after.items():
        before_row = before.get(key)
        if before_row is None:
            changes.append(
                {
                    "kind": kind,
                    "change": "inserted",
                    "person_id": after_row.get("person_id"),
                    "duty_desc": after_row.get("duty_desc"),
                    "end_date": after_row.get("end_date"),
                    "is_current": after_row.get("is_current"),
                    "office_id": after_row.get("office_id"),
                }
            )
            continue
        tracked = ("end_date", "duty_desc", "is_current", "office_id", "start_date")
        if any(before_row.get(f) != after_row.get(f) for f in tracked if f in after_row or f in before_row):
            changes.append(
                {
                    "kind": kind,
                    "change": "updated",
                    "person_id": after_row.get("person_id"),
                    "duty_desc": after_row.get("duty_desc"),
                    "end_date": after_row.get("end_date"),
                    "is_current": after_row.get("is_current"),
                    "office_id": after_row.get("office_id"),
                    "previous_end_date": before_row.get("end_date"),
                    "previous_duty_desc": before_row.get("duty_desc"),
                }
            )
    return changes


def diff_knesset_positions(
    before: dict[str, dict[str, Any]],
    after: dict[str, dict[str, Any]],
) -> list[dict[str, Any]]:
    """Return field-level membership/appointment changes (empty if none)."""
    return _diff_position_maps(
        before.get("memberships", {}),
        after.get("memberships", {}),
        kind="membership",
    ) + _diff_position_maps(
        before.get("appointments", {}),
        after.get("appointments", {}),
        kind="appointment",
    )


def emit_knesset_run_update(
    sb: Client,
    *,
    before: dict[str, dict[str, Any]] | None = None,
    after: dict[str, dict[str, Any]] | None = None,
    changes: list[dict[str, Any]] | None = None,
    pipeline_run_id: int | None = None,
) -> bool:
    """Emit one summary from membership/appointment diffs. Returns True if emitted."""
    try:
        if changes is None:
            if before is None or after is None:
                return False
            changes = diff_knesset_positions(before, after)
        if not changes:
            return False

        changes = changes[:MAX_FACTS_ITEMS]
        person_ids = {
            int(c["person_id"])
            for c in changes
            if c.get("person_id") is not None
        }
        names = _person_names(sb, person_ids)
        for c in changes:
            pid = c.get("person_id")
            c["person_name"] = names.get(int(pid), str(pid)) if pid is not None else None

        keys = [
            f"{c.get('kind')}:{c.get('change')}:{c.get('person_id')}:{c.get('duty_desc')}"
            for c in changes
        ]
        dedupe = f"knesset:{hash('|'.join(keys)) & 0xFFFFFFFFFFFFFFFF:x}"
        emit_pipeline_site_update(
            sb,
            event_type="knesset_run",
            href="/knesset",
            page_label_he="עמוד הכנסת",
            facts={
                "pipeline": "knesset",
                "change_count": len(changes),
                "changes": changes,
            },
            dedupe_key=dedupe,
            pipeline_run_id=pipeline_run_id,
        )
        return True
    except Exception as exc:
        log.warning("emit_knesset_run_update failed: %s", exc)
        return False


# ── Elections collector ───────────────────────────────────────────────────────

def count_new_election_candidates(
    sb: Client,
    *,
    since: datetime,
    election_year: int = 2026,
) -> int:
    """How many election_candidates were created since `since` (0 if none/unknown)."""
    try:
        since_iso = (
            since.astimezone(timezone.utc).isoformat()
            if since.tzinfo
            else since.replace(tzinfo=timezone.utc).isoformat()
        )
        elections = (
            sb.table("elections")
            .select("id")
            .eq("year", election_year)
            .limit(1)
            .execute()
            .data
            or []
        )
        if not elections:
            return 0
        election_id = elections[0]["id"]
        parties = (
            sb.table("election_parties")
            .select("id")
            .eq("election_id", election_id)
            .execute()
            .data
            or []
        )
        party_ids = [p["id"] for p in parties]
        if not party_ids:
            return 0
        result = (
            sb.table("election_candidates")
            .select("id", count="exact")
            .in_("party_id", party_ids)
            .gte("created_at", since_iso)
            .limit(1)
            .execute()
        )
        return int(result.count or 0)
    except Exception as exc:
        log.warning("count_new_election_candidates failed: %s", exc)
        return 0


def emit_elections_run_update(
    sb: Client,
    *,
    since: datetime,
    pipeline_run_id: int | None = None,
    election_year: int = 2026,
) -> bool:
    """Emit one summary if new election_candidates appeared since `since`.

    Returns True if a site_updates row was written. Call only when
    count_new_election_candidates(...) > 0 (or this no-ops cheaply).
    """
    try:
        since_iso = since.astimezone(timezone.utc).isoformat() if since.tzinfo else since.replace(tzinfo=timezone.utc).isoformat()

        elections = (
            sb.table("elections")
            .select("id")
            .eq("year", election_year)
            .limit(1)
            .execute()
            .data
            or []
        )
        if not elections:
            return False
        election_id = elections[0]["id"]

        parties = (
            sb.table("election_parties")
            .select("id, short_name")
            .eq("election_id", election_id)
            .execute()
            .data
            or []
        )
        party_ids = [p["id"] for p in parties]
        party_names = {p["id"]: p.get("short_name") for p in parties}
        if not party_ids:
            return False

        candidates: list[dict] = []
        try:
            candidates = (
                sb.table("election_candidates")
                .select("id, party_id, person_id, list_position, created_at")
                .in_("party_id", party_ids)
                .gte("created_at", since_iso)
                .order("created_at", desc=True)
                .limit(MAX_FACTS_ITEMS)
                .execute()
                .data
                or []
            )
        except Exception:
            log.warning(
                "election_candidates created_at filter failed — "
                "trying people.created_at join via recent people"
            )
            people = (
                sb.table("people")
                .select("id, full_name, created_at")
                .gte("created_at", since_iso)
                .limit(MAX_FACTS_ITEMS)
                .execute()
                .data
                or []
            )
            if not people:
                return False
            person_ids = [p["id"] for p in people]
            name_by_id = {p["id"]: p.get("full_name") for p in people}
            linked = (
                sb.table("election_candidates")
                .select("id, party_id, person_id, list_position")
                .in_("person_id", person_ids)
                .in_("party_id", party_ids)
                .limit(MAX_FACTS_ITEMS)
                .execute()
                .data
                or []
            )
            new_items = []
            for c in linked:
                new_items.append(
                    {
                        "person_name": name_by_id.get(c["person_id"]),
                        "party": party_names.get(c["party_id"]),
                        "list_position": c.get("list_position"),
                    }
                )
            if not new_items:
                return False
            dedupe = f"elections:{since_iso}:{len(new_items)}:{new_items[0].get('person_name')}"
            emit_pipeline_site_update(
                sb,
                event_type="elections_run",
                href="/elections",
                page_label_he="עמוד הבחירות",
                facts={
                    "pipeline": "elections",
                    "new_candidate_count": len(new_items),
                    "new_candidates": new_items,
                },
                dedupe_key=dedupe[:500],
                pipeline_run_id=pipeline_run_id,
            )
            return True

        if not candidates:
            return False

        person_ids = {int(c["person_id"]) for c in candidates if c.get("person_id")}
        names = _person_names(sb, person_ids)
        new_items = []
        for c in candidates:
            new_items.append(
                {
                    "person_name": names.get(int(c["person_id"])) if c.get("person_id") else None,
                    "party": party_names.get(c["party_id"]),
                    "list_position": c.get("list_position"),
                }
            )

        ids = sorted(str(c["id"]) for c in candidates)
        dedupe = f"elections:{since_iso}:{','.join(ids)}"
        emit_pipeline_site_update(
            sb,
            event_type="elections_run",
            href="/elections",
            page_label_he="עמוד הבחירות",
            facts={
                "pipeline": "elections",
                "new_candidate_count": len(new_items),
                "new_candidates": new_items,
            },
            dedupe_key=dedupe[:500],
            pipeline_run_id=pipeline_run_id,
        )
        return True
    except Exception as exc:
        log.warning("emit_elections_run_update failed: %s", exc)
        return False

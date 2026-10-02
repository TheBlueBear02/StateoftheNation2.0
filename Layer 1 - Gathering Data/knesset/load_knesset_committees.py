#!/usr/bin/env python3
"""
load_knesset_committees.py
==========================
Sync Knesset 25 committee data into Supabase.

Sources:
  - Knesset OData ParliamentInfo.svc
      KNS_Committee / KNS_CommitteeSession / KNS_DocumentCommitteeSession
  - Hasadna dumps (memberships + parsed protocol text/parts)
      members/mk_individual/*.csv
      committees/kns_committeesession/*.csv
      committees/meeting_protocols_{text,parts}/...
  - Self-parse fallback: download protocol DOC/DOCX from FilePath when
    Hasadna has no text/parts (requires `antiword` for .doc; WSL/Linux)

Tables written:
  knesset_committees
  knesset_committee_memberships
  knesset_committee_sessions
  knesset_committee_session_documents
  knesset_committee_session_transcripts
  knesset_committee_transcript_parts

Usage:
  python load_knesset_committees.py
  python load_knesset_committees.py --skip-transcripts
  python load_knesset_committees.py --transcripts-mode missing --transcripts-limit 200
  python load_knesset_committees.py --table committees
  python load_knesset_committees.py --table memberships
  python load_knesset_committees.py --knesset 25

Env:
  SUPABASE_URL, SUPABASE_SERVICE_KEY
  PIPELINE_RUN_SOURCE (optional; default cli)
"""

from __future__ import annotations

import argparse
import csv
import io
import logging
import os
import re
import sys
import time
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import quote

import requests
from dotenv import load_dotenv
from supabase import Client

# Reuse upsert / id-map helpers from the main knesset loader.
sys.path.insert(0, str(Path(__file__).resolve().parent))
from load_all_knesset_data import (  # noqa: E402
    get_supabase,
    load_id_map,
    upsert,
)

from committee_protocol_parse import (  # noqa: E402
    ProtocolParseError,
    parse_protocol_url,
)

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from record_pipeline_run import record_pipeline_run  # noqa: E402

# Prefer cwd .env, then repo root (two levels up from knesset/).
load_dotenv()
load_dotenv(Path(__file__).resolve().parents[2] / ".env")

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger(__name__)

# ── Config ────────────────────────────────────────────────────────────────────

ODATA_BASE = "http://knesset.gov.il/Odata/ParliamentInfo.svc"
HASADNA_BASE = "https://production.oknesset.org/pipelines/data"
PAGE_SIZE = 50
RETRY_MAX = 5
RETRY_DELAY = 4

DEFAULT_KNESSET_NUM = 25
PROTOCOL_GROUP_TYPE_ID = 23

POSITION_TO_SEAT_ROLE = {
    41: "chair",
    42: "member",
    66: "member",
    67: "alternate",
    663: "observer",
}

NS = {
    "atom": "http://www.w3.org/2005/Atom",
    "m": "http://schemas.microsoft.com/ado/2007/08/dataservices/metadata",
    "d": "http://schemas.microsoft.com/ado/2007/08/dataservices",
}

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "application/atom+xml,application/xml",
}

HTTP_HEADERS = {
    "User-Agent": HEADERS["User-Agent"],
    "Accept": "*/*",
}

# Speaker header cleanup — strip common protocol prefixes before name match.
_SPEAKER_PREFIX_RE = re.compile(
    r"^\s*(?:"
    r"היו\"?ר|יו\"?ר|מ\"?מ היו\"?ר|"
    r"חברת?\s+הכנסת|ח\"?כ|"
    r"השר(?:ה)?|שר(?:ת)?|"
    r"עו\"?ד|ד\"?ר|פרופ(?:'|')?|"
    r"גב(?:'|')?|מר"
    r")\s+",
    re.UNICODE,
)
_SPEAKER_TRAIL_RE = re.compile(r"[:：\-–—].*$")
_WHITESPACE_RE = re.compile(r"\s+")
_ATTENDANCE_ROLE_SUFFIX_RE = re.compile(
    r"\s*[–—\-]\s*(?:היו\"?ר|יו\"?ר|מ\"?מ.*|חבר(?:ת)? ועדה).*$"
)
# Non-MK blocks that end the attendance name list (invitees, staff, etc.).
_ATTENDANCE_SECTION_STOP_RE = re.compile(
    r"^(?:"
    r"מוזמנ(?:ים|ות)|ייעוץ משפטי|מנהל(?:ת)? הוועדה|רש[מת]|"
    r"נציג(?:י|ות)|עובד(?:י|ות)|אורח(?:ים|ות)|משתתפ(?:ים|ות)|"
    r"סגן מזכיר|יועץ משפטי|קצרנ|"
    r"רישום פרלמנטרי"
    r")\s*:?"
)
# Strip "חברי הוועדה:" / "חברי הכנסת" section labels (colon optional).
_ATTENDANCE_MEMBER_PREFIX_RE = re.compile(
    r"^(?:חבר(?:י|ות)\s+הוועדה|חבר(?:י|ות)\s+הכנסת)\s*:?\s*"
)
# Transcript part headers that carry MK attendance names.
_ATTENDANCE_PART_HEADERS = frozenset(
    {
        "נכחו",
        "חברי הכנסת",
        "חברות הכנסת",
        "חבר הכנסת",
        "חברת הכנסת",
    }
)


# ── OData (keeps full DateTime for session timestamps) ────────────────────────

def is_reblaze_block(text: str) -> bool:
    return any(
        s in text.lower()
        for s in ["reblaze", "access denied", "request blocked", "rbzid"]
    )


def parse_odata_value(elem: ET.Element):
    if elem.get(f"{{{NS['m']}}}null", "false").lower() == "true":
        return None

    type_attr = elem.get(f"{{{NS['m']}}}type", "")
    text = (elem.text or "").strip()
    if not text:
        return None

    if type_attr in ("Edm.Int32", "Edm.Int16", "Edm.Byte", "Edm.Int64"):
        return int(text)
    if type_attr == "Edm.Decimal":
        return float(text)
    if type_attr == "Edm.Boolean":
        return text.lower() == "true"
    if type_attr == "Edm.DateTime":
        # Keep full timestamp for sessions; date-only fields still work as ISO prefix.
        if "T" in text:
            return text.replace("Z", "+00:00")
        return text[:10]
    return text


def parse_entry(entry: ET.Element) -> dict:
    props = entry.find("./atom:content/m:properties", NS)
    if props is None:
        return {}
    return {
        child.tag.split("}")[-1]: parse_odata_value(child)
        for child in props
    }


def fetch_odata(entity: str, filter_expr: str | None = None) -> list[dict]:
    base_params: dict = {"$top": PAGE_SIZE}
    if filter_expr:
        base_params["$filter"] = filter_expr

    all_rows: list[dict] = []
    skip = 0
    page = 1

    while True:
        params = {**base_params, "$skip": skip}
        log.info("  %s: page %d (skip=%d)…", entity, page, skip)

        resp = None
        for attempt in range(1, RETRY_MAX + 1):
            try:
                resp = requests.get(
                    f"{ODATA_BASE}/{entity}",
                    params=params,
                    headers=HEADERS,
                    timeout=60,
                )
                resp.raise_for_status()
                if is_reblaze_block(resp.text):
                    wait = RETRY_DELAY * attempt
                    log.warning(
                        "  Reblaze block (attempt %d/%d) — waiting %ds",
                        attempt,
                        RETRY_MAX,
                        wait,
                    )
                    time.sleep(wait)
                    continue
                break
            except requests.RequestException as exc:
                if attempt == RETRY_MAX:
                    raise
                wait = RETRY_DELAY * attempt
                log.warning(
                    "  Error (attempt %d/%d): %s — retrying in %ds",
                    attempt,
                    RETRY_MAX,
                    exc,
                    wait,
                )
                time.sleep(wait)

        assert resp is not None
        root = ET.fromstring(resp.content)
        entries = root.findall("atom:entry", NS)
        rows = [parse_entry(e) for e in entries]
        all_rows.extend(rows)
        log.info(
            "  %s: page %d → %d rows (total: %d)",
            entity,
            page,
            len(rows),
            len(all_rows),
        )

        if len(rows) < PAGE_SIZE:
            break
        skip += PAGE_SIZE
        page += 1
        time.sleep(0.25)

    return all_rows


# ── HTTP helpers (Hasadna) ────────────────────────────────────────────────────

def http_get_bytes(url: str, timeout: int = 120) -> bytes:
    for attempt in range(1, RETRY_MAX + 1):
        try:
            resp = requests.get(url, headers=HTTP_HEADERS, timeout=timeout)
            resp.raise_for_status()
            return resp.content
        except requests.RequestException as exc:
            if attempt == RETRY_MAX:
                raise
            wait = RETRY_DELAY * attempt
            log.warning(
                "  GET failed (attempt %d/%d) %s — %s; retry in %ds",
                attempt,
                RETRY_MAX,
                url,
                exc,
                wait,
            )
            time.sleep(wait)
    raise RuntimeError(f"unreachable: {url}")


def http_get_text(url: str, timeout: int = 120) -> str:
    return http_get_bytes(url, timeout=timeout).decode("utf-8-sig", errors="replace")


def download_csv_rows(url: str) -> list[dict]:
    log.info("  downloading CSV %s", url)
    text = http_get_text(url, timeout=300)
    reader = csv.DictReader(io.StringIO(text))
    rows = list(reader)
    log.info("  → %d CSV rows", len(rows))
    return rows


def to_int(value) -> int | None:
    if value is None or value == "":
        return None
    try:
        return int(float(str(value).strip()))
    except (TypeError, ValueError):
        return None


def to_date(value) -> str | None:
    """Normalize to YYYY-MM-DD or None."""
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    if len(text) >= 10 and text[4] == "-" and text[7] == "-":
        return text[:10]
    return None


def to_timestamptz(value) -> str | None:
    """Normalize OData/Hasadna datetime strings for Postgres timestamptz."""
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    if len(text) == 10 and text[4] == "-" and text[7] == "-":
        return f"{text}T00:00:00+03:00"
    # Hasadna often uses "YYYY-MM-DD HH:MM:SS"
    text = text.replace(" ", "T", 1)
    if text.endswith("Z"):
        return text
    if "+" in text[10:] or text.count("-") > 2:
        return text
    # Naive local wall clock → treat as Israel time
    if "T" in text:
        return f"{text}+03:00"
    return text


def normalize_person_name(name: str) -> str:
    text = _WHITESPACE_RE.sub(" ", (name or "").strip())
    return text


def speaker_header_to_name(header: str | None) -> str | None:
    if not header:
        return None
    text = header.strip()
    if not text:
        return None
    text = _SPEAKER_TRAIL_RE.sub("", text).strip()
    text = _SPEAKER_PREFIX_RE.sub("", text).strip()
    text = text.strip(" .,:;-–—\"'")
    text = normalize_person_name(text)
    return text or None


def attendance_line_to_name(line: str) -> str | None:
    text = (line or "").strip()
    if not text:
        return None
    text = _ATTENDANCE_MEMBER_PREFIX_RE.sub("", text).strip()
    if not text or _ATTENDANCE_SECTION_STOP_RE.match(text):
        return None
    text = _ATTENDANCE_ROLE_SUFFIX_RE.sub("", text).strip()
    text = text.strip(" .,:;-–—\"'")
    text = normalize_person_name(text)
    return text or None


def parse_attendance_names_from_body(body: str) -> list[str]:
    """
    Extract MK names from a protocol attendance section body, e.g.:

      חברי הוועדה: דוד ביטן – היו"ר
      שלי טל מירון
      חברי הכנסת
      ולדימיר בליאק

    Stops at non-MK blocks (מוזמנים, staff, …). Section labels like
    חברי הכנסת are skipped; names under them are kept.
    """
    names: list[str] = []
    seen: set[str] = set()
    for raw_line in (body or "").splitlines():
        line = raw_line.strip()
        if not line:
            continue
        if _ATTENDANCE_SECTION_STOP_RE.match(line):
            break
        name = attendance_line_to_name(line)
        if not name or name in seen:
            continue
        # Ignore leftover section labels that survived prefix stripping.
        if name in _ATTENDANCE_PART_HEADERS or name in {
            "חברי הוועדה",
            "חברות הוועדה",
        }:
            continue
        seen.add(name)
        names.append(name)
    return names


def is_attendance_part_header(header: str) -> bool:
    text = (header or "").strip()
    if not text:
        return False
    if text in _ATTENDANCE_PART_HEADERS:
        return True
    # Hasadna sometimes keeps trailing punctuation / whitespace variants.
    normalized = text.strip(" .,:;-–—\"'")
    return normalized in _ATTENDANCE_PART_HEADERS


def extract_attendance_names_from_parts(parts: list[dict]) -> list[str]:
    """parts may use header/body (Hasadna) or speaker_header/body (DB).

    Includes both the נכחו block (committee members) and the separate
    חברי הכנסת block (guest MKs who are not committee members).
    """
    names: list[str] = []
    seen: set[str] = set()
    for part in parts:
        header = (
            part.get("header")
            or part.get("speaker_header")
            or ""
        ).strip()
        if not is_attendance_part_header(header):
            continue
        body = part.get("body") or ""
        # When the header itself is "חברי הכנסת", the body is only names —
        # still run through the same line parser.
        for name in parse_attendance_names_from_body(str(body)):
            if name not in seen:
                seen.add(name)
                names.append(name)
    return names


def resolve_person_id(name: str, name_index: dict[str, int]) -> int | None:
    direct = name_index.get(name)
    if direct is not None:
        return direct
    # Try without middle tokens / alternate spacing already normalized.
    for key, person_id in name_index.items():
        if key.endswith(name) or name.endswith(key):
            return person_id
        # Containment for longer official names vs short protocol forms
        if len(name) >= 4 and (name in key or key in name):
            return person_id
    return None


def replace_session_attendance(
    sb: Client,
    *,
    session_id: int,
    attendee_person_ids: list[int],
    source: str = "protocol_nochachu",
) -> int:
    """Replace attendance rows for a session with the parsed attendee set."""
    sb.table("knesset_committee_session_attendance").delete().eq(
        "session_id", session_id
    ).execute()
    if not attendee_person_ids:
        return 0
    # Dedupe while preserving order
    seen: set[int] = set()
    rows = []
    for pid in attendee_person_ids:
        if pid in seen:
            continue
        seen.add(pid)
        rows.append(
            {
                "session_id": session_id,
                "person_id": pid,
                "attended": True,
                "source": source,
            }
        )
    for i in range(0, len(rows), 500):
        sb.table("knesset_committee_session_attendance").insert(
            rows[i : i + 500]
        ).execute()
    return len(rows)


def sync_attendance_for_session_parts(
    sb: Client,
    *,
    session_id: int,
    parts: list[dict],
    name_index: dict[str, int],
) -> dict:
    names = extract_attendance_names_from_parts(parts)
    person_ids: list[int] = []
    unmatched: list[str] = []
    for name in names:
        pid = resolve_person_id(name, name_index)
        if pid is None:
            unmatched.append(name)
        else:
            person_ids.append(pid)
    written = replace_session_attendance(
        sb, session_id=session_id, attendee_person_ids=person_ids
    )
    if unmatched:
        log.info(
            "    attendance unmatched names (%d): %s",
            len(unmatched),
            ", ".join(unmatched[:8]),
        )
    return {
        "names": len(names),
        "matched": written,
        "unmatched": len(unmatched),
    }


def sync_attendance_from_existing_parts(sb: Client) -> dict:
    """Backfill attendance from נכחו + חברי הכנסת transcript parts."""
    log.info("── backfilling attendance from existing attendance parts ──")
    name_index = build_people_name_index(sb)

    attendance_headers = sorted(_ATTENDANCE_PART_HEADERS)
    attendance_rows: list[dict] = []
    page_size = 1000
    offset = 0
    while True:
        batch = (
            sb.table("knesset_committee_transcript_parts")
            .select("session_id, speaker_header, body")
            .in_("speaker_header", attendance_headers)
            .range(offset, offset + page_size - 1)
            .execute()
            .data
        )
        attendance_rows.extend(batch or [])
        if len(batch or []) < page_size:
            break
        offset += page_size

    by_session: dict[int, list[dict]] = {}
    for row in attendance_rows:
        sid = row["session_id"]
        by_session.setdefault(sid, []).append(row)

    total_matched = 0
    total_unmatched = 0
    sessions_done = 0
    for session_id, parts in by_session.items():
        stats = sync_attendance_for_session_parts(
            sb,
            session_id=session_id,
            parts=parts,
            name_index=name_index,
        )
        total_matched += stats["matched"]
        total_unmatched += stats["unmatched"]
        sessions_done += 1

    log.info(
        "  → attendance backfill: %d sessions, %d attendees matched, %d unmatched names",
        sessions_done,
        total_matched,
        total_unmatched,
    )
    return {
        "table": "knesset_committee_session_attendance",
        "sessions": sessions_done,
        "matched": total_matched,
        "unmatched": total_unmatched,
        "upserted": total_matched,
        "inserted": total_matched,
        "updated": 0,
        "skipped": 0,
    }


def build_people_name_index(sb: Client) -> dict[str, int]:
    """
    Map normalized full_name → people.id.
    Prefer rows that have knesset_person_id when names collide.
    """
    index: dict[str, int] = {}
    preferred: dict[str, int] = {}
    page_size = 1000
    offset = 0
    while True:
        rows = (
            sb.table("people")
            .select("id, full_name, knesset_person_id")
            .range(offset, offset + page_size - 1)
            .execute()
            .data
        )
        for row in rows:
            name = normalize_person_name(row.get("full_name") or "")
            if not name:
                continue
            pid = row["id"]
            if row.get("knesset_person_id") is not None:
                preferred[name] = pid
            index.setdefault(name, pid)
        if len(rows) < page_size:
            break
        offset += page_size
    index.update(preferred)
    log.info("  people name index: %d names", len(index))
    return index


# ── Sync: committees ──────────────────────────────────────────────────────────

def sync_committees(sb: Client, knesset_num: int) -> dict:
    log.info("── syncing knesset_committees (Knesset %d) ──", knesset_num)
    knesset_map = load_id_map(sb, "knessets", "knesset_number")
    knesset_id = knesset_map.get(knesset_num)
    if knesset_id is None:
        raise RuntimeError(
            f"knessets row for knesset_number={knesset_num} not found — "
            "run load_all_knesset_data.py first"
        )

    raw = fetch_odata("KNS_Committee", f"KnessetNum eq {knesset_num}")
    rows = []
    for r in raw:
        cid = r.get("CommitteeID")
        name = (r.get("Name") or "").strip()
        if cid is None or not name:
            continue
        rows.append(
            {
                "knesset_committee_id": cid,
                "knesset_id": knesset_id,
                "name": name,
                "committee_type_id": r.get("CommitteeTypeID"),
                "committee_type_desc": r.get("CommitteeTypeDesc"),
                "additional_type_id": r.get("AdditionalTypeID"),
                "additional_type_desc": r.get("AdditionalTypeDesc"),
                "parent_committee_id": r.get("ParentCommitteeID"),
                "start_date": to_date(r.get("StartDate")),
                "end_date": to_date(r.get("FinishDate")),
                "is_current": bool(r.get("IsCurrent")),
                "email": r.get("Email") or None,
            }
        )

    stats = upsert(sb, "knesset_committees", rows, "knesset_committee_id")
    return stats


# ── Sync: memberships (Hasadna) ───────────────────────────────────────────────

def sync_memberships(sb: Client, knesset_num: int) -> dict:
    log.info("── syncing knesset_committee_memberships (Hasadna, K%d) ──", knesset_num)

    mk_url = f"{HASADNA_BASE}/members/mk_individual/mk_individual.csv"
    mem_url = f"{HASADNA_BASE}/members/mk_individual/mk_individual_committees.csv"

    mk_rows = download_csv_rows(mk_url)
    mk_to_person: dict[int, int] = {}
    for row in mk_rows:
        mk_id = to_int(row.get("mk_individual_id"))
        person_id = to_int(row.get("PersonID"))
        if mk_id is not None and person_id is not None:
            mk_to_person[mk_id] = person_id

    people_by_kpid = load_id_map(sb, "people", "knesset_person_id")
    committee_by_oid = load_id_map(sb, "knesset_committees", "knesset_committee_id")

    mem_rows = download_csv_rows(mem_url)
    # Dedupe on natural key — Hasadna can emit multiple position rows
    # for the same person/committee/start (prefer chair > member > …).
    seat_rank = {"chair": 0, "member": 1, "alternate": 2, "observer": 3}
    by_key: dict[tuple, dict] = {}
    skipped_no_committee = 0
    skipped_no_person = 0

    for row in mem_rows:
        if str(row.get("knesset") or "").strip() != str(knesset_num):
            continue
        committee_oid = to_int(row.get("committee_id"))
        mk_id = to_int(row.get("mk_individual_id"))
        if committee_oid is None or mk_id is None:
            continue

        committee_id = committee_by_oid.get(committee_oid)
        if committee_id is None:
            skipped_no_committee += 1
            continue

        knesset_person_id = mk_to_person.get(mk_id)
        person_id = people_by_kpid.get(knesset_person_id) if knesset_person_id else None
        if person_id is None:
            skipped_no_person += 1
            continue

        position_id = to_int(row.get("position_id"))
        seat_role = POSITION_TO_SEAT_ROLE.get(position_id or -1, "member")
        role_desc = (row.get("position_name") or "").strip() or None
        start_date = to_date(row.get("start_date"))

        candidate = {
            "committee_id": committee_id,
            "person_id": person_id,
            "knesset_position_id": position_id,
            "role_desc": role_desc,
            "seat_role": seat_role,
            "start_date": start_date,
            "end_date": to_date(row.get("finish_date")),
        }
        key = (committee_id, person_id, start_date)
        prev = by_key.get(key)
        if prev is None or seat_rank.get(seat_role, 9) < seat_rank.get(
            prev["seat_role"], 9
        ):
            by_key[key] = candidate

    payload = list(by_key.values())

    log.info(
        "  mapped %d memberships (%d no committee, %d no person)",
        len(payload),
        skipped_no_committee,
        skipped_no_person,
    )

    # Memberships have a composite natural key — custom merge (not simple conflict col).
    return upsert_memberships(sb, payload)


def upsert_memberships(sb: Client, rows: list[dict]) -> dict:
    """Upsert memberships on (committee_id, person_id, start_date) NULLS NOT DISTINCT."""
    if not rows:
        return {
            "table": "knesset_committee_memberships",
            "upserted": 0,
            "inserted": 0,
            "updated": 0,
            "skipped": 0,
        }

    existing: dict[tuple, dict] = {}
    page_size = 1000
    offset = 0
    while True:
        batch = (
            sb.table("knesset_committee_memberships")
            .select(
                "id, committee_id, person_id, start_date, end_date, "
                "knesset_position_id, role_desc, seat_role"
            )
            .range(offset, offset + page_size - 1)
            .execute()
            .data
        )
        for row in batch:
            key = (row["committee_id"], row["person_id"], row.get("start_date"))
            existing[key] = row
        if len(batch) < page_size:
            break
        offset += page_size

    to_insert: list[dict] = []
    to_update: list[dict] = []
    skipped = 0

    for row in rows:
        key = (row["committee_id"], row["person_id"], row.get("start_date"))
        prev = existing.get(key)
        if prev is None:
            to_insert.append(row)
            continue
        changed = False
        for field in (
            "end_date",
            "knesset_position_id",
            "role_desc",
            "seat_role",
        ):
            left = row.get(field)
            right = prev.get(field)
            if left != right and not (
                left is None and (right is None or right == "")
            ):
                # normalize empty string vs None for role_desc
                if field == "role_desc" and (left or None) == (right or None):
                    continue
                changed = True
                break
        if not changed:
            skipped += 1
            continue
        update_row = dict(row)
        update_row["id"] = prev["id"]
        to_update.append(update_row)

    for i in range(0, len(to_insert), 500):
        sb.table("knesset_committee_memberships").insert(
            to_insert[i : i + 500]
        ).execute()

    for i in range(0, len(to_update), 500):
        chunk = to_update[i : i + 500]
        # Prefer update by primary key to avoid unique-conflict surprises.
        for item in chunk:
            row_id = item.pop("id")
            sb.table("knesset_committee_memberships").update(item).eq(
                "id", row_id
            ).execute()

    written = len(to_insert) + len(to_update)
    log.info(
        "  → knesset_committee_memberships: wrote %d (%d new, %d updated, %d skipped)",
        written,
        len(to_insert),
        len(to_update),
        skipped,
    )
    return {
        "table": "knesset_committee_memberships",
        "upserted": written,
        "inserted": len(to_insert),
        "updated": len(to_update),
        "skipped": skipped,
    }


# ── Sync: sessions ────────────────────────────────────────────────────────────

def sync_sessions(sb: Client, knesset_num: int) -> dict:
    log.info("── syncing knesset_committee_sessions (Knesset %d) ──", knesset_num)
    committee_by_oid = load_id_map(sb, "knesset_committees", "knesset_committee_id")

    raw = fetch_odata("KNS_CommitteeSession", f"KnessetNum eq {knesset_num}")
    by_oid: dict[int, dict] = {}
    skipped = 0
    for r in raw:
        sid = r.get("CommitteeSessionID")
        committee_oid = r.get("CommitteeID")
        if sid is None or committee_oid is None:
            continue
        committee_id = committee_by_oid.get(committee_oid)
        if committee_id is None:
            skipped += 1
            continue
        # Last write wins if OData/pagination emits the same session twice.
        by_oid[int(sid)] = {
            "knesset_session_id": int(sid),
            "committee_id": committee_id,
            "session_number": r.get("Number"),
            "session_type_id": r.get("TypeID"),
            "session_type_desc": r.get("TypeDesc"),
            "status_id": r.get("StatusID"),
            "status_desc": r.get("StatusDesc"),
            "location": r.get("Location"),
            "session_url": r.get("SessionUrl"),
            "broadcast_url": r.get("BroadcastUrl"),
            "note": r.get("Note"),
            "start_at": to_timestamptz(r.get("StartDate")),
            "finish_at": to_timestamptz(r.get("FinishDate")),
        }

    rows = list(by_oid.values())
    log.info(
        "  prepared %d sessions (%d skipped — unknown committee; %d raw rows)",
        len(rows),
        skipped,
        len(raw),
    )
    return upsert(sb, "knesset_committee_sessions", rows, "knesset_session_id")


# ── Sync: protocol documents ──────────────────────────────────────────────────

def sync_documents(sb: Client, knesset_num: int) -> dict:
    """
    Load protocol documents from Hasadna's document dump (faster than paging
    all GroupTypeID=23 rows from OData), keep those whose session is already
    loaded for this knesset.
    """
    log.info("── syncing protocol documents (Hasadna, GroupTypeID=%d) ──", PROTOCOL_GROUP_TYPE_ID)
    session_by_oid = load_id_map(sb, "knesset_committee_sessions", "knesset_session_id")
    if not session_by_oid:
        log.warning("  no sessions in DB — skip documents")
        return {
            "table": "knesset_committee_session_documents",
            "upserted": 0,
            "inserted": 0,
            "updated": 0,
            "skipped": 0,
        }

    # Prefer the live dataservice dump (updated daily) for FilePath coverage;
    # fall back to the older mirror, then OData.
    urls = [
        f"{HASADNA_BASE}/committees/kns_documentcommitteesession_dataservice/"
        "kns_documentcommitteesession_dataservice.csv",
        f"{HASADNA_BASE}/committees/kns_documentcommitteesession/"
        "kns_documentcommitteesession.csv",
    ]
    raw: list[dict] = []
    for url in urls:
        try:
            raw = download_csv_rows(url)
            if raw:
                break
        except Exception as exc:
            log.warning("  document CSV failed (%s): %s", url, exc)

    if not raw:
        log.warning("  falling back to OData KNS_DocumentCommitteeSession")
        odata_rows = fetch_odata(
            "KNS_DocumentCommitteeSession",
            f"GroupTypeID eq {PROTOCOL_GROUP_TYPE_ID}",
        )
        raw = [
            {
                "DocumentCommitteeSessionID": r.get("DocumentCommitteeSessionID"),
                "CommitteeSessionID": r.get("CommitteeSessionID"),
                "GroupTypeID": r.get("GroupTypeID"),
                "GroupTypeDesc": r.get("GroupTypeDesc"),
                "ApplicationDesc": r.get("ApplicationDesc"),
                "FilePath": r.get("FilePath"),
            }
            for r in odata_rows
        ]

    by_doc: dict[int, dict] = {}
    for r in raw:
        group_type = to_int(r.get("GroupTypeID"))
        group_desc = (r.get("GroupTypeDesc") or "").strip()
        if group_type is not None:
            if group_type != PROTOCOL_GROUP_TYPE_ID:
                continue
        elif "פרוטוקול" not in group_desc:
            continue

        doc_id = to_int(r.get("DocumentCommitteeSessionID"))
        session_oid = to_int(r.get("CommitteeSessionID"))
        if doc_id is None or session_oid is None:
            continue
        session_id = session_by_oid.get(session_oid)
        if session_id is None:
            continue
        file_url = (r.get("FilePath") or r.get("file_path") or "").strip() or None
        if not file_url:
            continue
        lower_url = file_url.lower()
        if not (lower_url.endswith(".doc") or lower_url.endswith(".docx")):
            continue
        app_desc = (r.get("ApplicationDesc") or "").strip() or None
        by_doc[doc_id] = {
            "knesset_document_id": doc_id,
            "session_id": session_id,
            "group_type_id": group_type if group_type is not None else PROTOCOL_GROUP_TYPE_ID,
            "group_type_desc": group_desc or "פרוטוקול ועדה",
            "application_desc": app_desc,
            "file_url": file_url,
        }

    rows = list(by_doc.values())
    log.info("  %d protocol docs match loaded K%d sessions", len(rows), knesset_num)
    return upsert(
        sb, "knesset_committee_session_documents", rows, "knesset_document_id"
    )


# ── Sync: transcripts + parts (Hasadna) ───────────────────────────────────────

def load_session_rows(sb: Client) -> list[dict]:
    rows: list[dict] = []
    page_size = 1000
    offset = 0
    while True:
        batch = (
            sb.table("knesset_committee_sessions")
            .select("id, knesset_session_id, start_at")
            .order("start_at", desc=True)
            .range(offset, offset + page_size - 1)
            .execute()
            .data
        )
        rows.extend(batch)
        if len(batch) < page_size:
            break
        offset += page_size
    return rows


def load_ready_transcript_session_ids(sb: Client) -> set[int]:
    ready: set[int] = set()
    page_size = 1000
    offset = 0
    while True:
        batch = (
            sb.table("knesset_committee_session_transcripts")
            .select("session_id, parse_status")
            .eq("parse_status", "ready")
            .range(offset, offset + page_size - 1)
            .execute()
            .data
        )
        for row in batch:
            ready.add(row["session_id"])
        if len(batch) < page_size:
            break
        offset += page_size
    return ready


def load_protocol_docs_by_session(sb: Client) -> dict[int, dict]:
    """
    session_id → {id, file_url} for protocol DOC/DOCX rows.
    When several docs exist for one session, keep the first DOC-like URL.
    """
    by_session: dict[int, dict] = {}
    page_size = 1000
    offset = 0
    while True:
        batch = (
            sb.table("knesset_committee_session_documents")
            .select("id, session_id, file_url, application_desc, group_type_id")
            .eq("group_type_id", PROTOCOL_GROUP_TYPE_ID)
            .range(offset, offset + page_size - 1)
            .execute()
            .data
        )
        for row in batch:
            file_url = (row.get("file_url") or "").strip()
            if not file_url:
                continue
            lower = file_url.lower()
            if not (lower.endswith(".doc") or lower.endswith(".docx")):
                continue
            session_id = row["session_id"]
            if session_id in by_session:
                continue
            by_session[session_id] = {
                "id": row["id"],
                "file_url": file_url,
            }
        if len(batch) < page_size:
            break
        offset += page_size
    return by_session


def load_hasadna_session_file_index(knesset_num: int) -> dict[int, dict]:
    """
    CommitteeSessionID → {parts_parsed_filename, text_parsed_filename, ...}
    from Hasadna kns_committeesession.csv.
    """
    url = (
        f"{HASADNA_BASE}/committees/kns_committeesession/kns_committeesession.csv"
    )
    rows = download_csv_rows(url)
    index: dict[int, dict] = {}
    for row in rows:
        if str(row.get("KnessetNum") or "").strip() != str(knesset_num):
            continue
        sid = to_int(row.get("CommitteeSessionID"))
        if sid is None:
            continue
        parts = (row.get("parts_parsed_filename") or "").strip()
        text = (row.get("text_parsed_filename") or "").strip()
        if not parts and not text:
            continue
        index[sid] = {
            "parts_parsed_filename": parts or None,
            "text_parsed_filename": text or None,
        }
    log.info(
        "  Hasadna file index: %d K%d sessions with text/parts",
        len(index),
        knesset_num,
    )
    return index


def replace_transcript_parts(
    sb: Client,
    *,
    transcript_id: int,
    session_id: int,
    parts: list[dict],
    name_index: dict[str, int],
) -> tuple[int, dict]:
    """Delete existing parts for transcript and insert fresh ordered rows.

    Also refreshes session attendance from נכחו / חברי הכנסת parts.
    Returns (parts_written, attendance_stats).
    """
    sb.table("knesset_committee_transcript_parts").delete().eq(
        "transcript_id", transcript_id
    ).execute()

    payload = []
    for ordinal, part in enumerate(parts):
        header = (part.get("header") or "").strip() or None
        body = part.get("body")
        if body is None:
            body = ""
        body = str(body)
        speaker_name = speaker_header_to_name(header)
        person_id = (
            resolve_person_id(speaker_name, name_index) if speaker_name else None
        )
        payload.append(
            {
                "transcript_id": transcript_id,
                "session_id": session_id,
                "ordinal": ordinal,
                "speaker_header": header,
                "person_id": person_id,
                "body": body,
                "start_offset_ms": None,
            }
        )

    for i in range(0, len(payload), 500):
        sb.table("knesset_committee_transcript_parts").insert(
            payload[i : i + 500]
        ).execute()

    attendance_stats = sync_attendance_for_session_parts(
        sb,
        session_id=session_id,
        parts=parts,
        name_index=name_index,
    )
    return len(payload), attendance_stats


def upsert_transcript_row(
    sb: Client,
    *,
    session_id: int,
    full_text: str | None,
    parse_status: str,
    error: str | None = None,
    source: str = "hasadna",
    document_id: int | None = None,
) -> int:
    existing = (
        sb.table("knesset_committee_session_transcripts")
        .select("id")
        .eq("session_id", session_id)
        .limit(1)
        .execute()
        .data
    )
    now = datetime.now(timezone.utc).isoformat()
    row = {
        "session_id": session_id,
        "full_text": full_text,
        "source": source,
        "parse_status": parse_status,
        "parsed_at": now if parse_status in ("ready", "partial", "failed") else None,
        "error": error,
    }
    if document_id is not None:
        row["document_id"] = document_id
    if existing:
        tid = existing[0]["id"]
        sb.table("knesset_committee_session_transcripts").update(row).eq(
            "id", tid
        ).execute()
        return tid

    inserted = (
        sb.table("knesset_committee_session_transcripts")
        .insert(row)
        .execute()
        .data
    )
    return inserted[0]["id"]


def sync_transcripts(
    sb: Client,
    knesset_num: int,
    *,
    mode: str,
    limit: int | None,
) -> dict:
    log.info(
        "── syncing transcripts/parts (mode=%s, limit=%s) ──",
        mode,
        limit if limit is not None else "none",
    )
    if mode == "none":
        return {
            "table": "knesset_committee_session_transcripts",
            "upserted": 0,
            "inserted": 0,
            "updated": 0,
            "skipped": 0,
            "parts_written": 0,
        }

    file_index = load_hasadna_session_file_index(knesset_num)
    docs_by_session = load_protocol_docs_by_session(sb)
    sessions = load_session_rows(sb)
    ready_ids = load_ready_transcript_session_ids(sb) if mode == "missing" else set()
    name_index = build_people_name_index(sb)

    candidates = []
    for sess in sessions:
        if mode == "missing" and sess["id"] in ready_ids:
            continue
        oid = sess["knesset_session_id"]
        has_hasadna = oid in file_index
        has_doc = sess["id"] in docs_by_session
        if not has_hasadna and not has_doc:
            continue
        candidates.append(sess)

    if limit is not None:
        candidates = candidates[: max(0, limit)]

    log.info(
        "  transcript candidates this run: %d "
        "(Hasadna index %d; protocol DOCs %d)",
        len(candidates),
        len(file_index),
        len(docs_by_session),
    )

    ok = 0
    failed = 0
    parts_written = 0
    attendance_matched = 0
    skipped = 0
    from_hasadna = 0
    from_self_parse = 0

    for i, sess in enumerate(candidates, start=1):
        session_id = sess["id"]
        oid = sess["knesset_session_id"]
        meta = file_index.get(oid)
        doc = docs_by_session.get(session_id)

        log.info(
            "  [%d/%d] session oid=%s db_id=%s source=%s",
            i,
            len(candidates),
            oid,
            session_id,
            "hasadna" if meta else "parsed_file",
        )

        full_text = None
        parts_rows: list[dict] = []
        errors: list[str] = []
        source = "hasadna"
        document_id: int | None = None

        if meta:
            parts_path = meta.get("parts_parsed_filename")
            text_path = meta.get("text_parsed_filename")
            try:
                if text_path:
                    text_url = (
                        f"{HASADNA_BASE}/committees/meeting_protocols_text/"
                        f"{quote(text_path, safe='/')}"
                    )
                    full_text = http_get_text(text_url, timeout=120)
                if parts_path:
                    parts_url = (
                        f"{HASADNA_BASE}/committees/meeting_protocols_parts/"
                        f"{quote(parts_path, safe='/')}"
                    )
                    parts_text = http_get_text(parts_url, timeout=120)
                    parts_rows = list(csv.DictReader(io.StringIO(parts_text)))
            except Exception as exc:
                errors.append(str(exc))
                log.warning("    Hasadna fetch failed: %s", exc)

            # If Hasadna files are listed but empty/broken, fall through to DOC.
            if not full_text and not parts_rows and doc:
                log.info("    Hasadna empty — falling back to DOC self-parse")
                meta = None

        if not meta and doc:
            source = "parsed_file"
            document_id = doc["id"]
            try:
                full_text, parts_rows = parse_protocol_url(doc["file_url"])
            except ProtocolParseError as exc:
                errors.append(str(exc))
                log.warning("    self-parse failed: %s", exc)
            except Exception as exc:
                errors.append(str(exc))
                log.warning("    self-parse error: %s", exc)

        if not full_text and not parts_rows:
            upsert_transcript_row(
                sb,
                session_id=session_id,
                full_text=None,
                parse_status="failed",
                error="; ".join(errors) or "no text/parts available",
                source=source,
                document_id=document_id,
            )
            failed += 1
            time.sleep(0.15)
            continue

        status = "ready" if parts_rows else "partial"
        if errors and (full_text or parts_rows):
            status = "partial"

        transcript_id = upsert_transcript_row(
            sb,
            session_id=session_id,
            full_text=full_text,
            parse_status=status,
            error="; ".join(errors) if errors else None,
            source=source,
            document_id=document_id,
        )

        if parts_rows:
            n, att_stats = replace_transcript_parts(
                sb,
                transcript_id=transcript_id,
                session_id=session_id,
                parts=parts_rows,
                name_index=name_index,
            )
            parts_written += n
            attendance_matched += att_stats.get("matched", 0)
            log.info(
                "    → %d parts (%s, %s); attendance matched %d/%d",
                n,
                status,
                source,
                att_stats.get("matched", 0),
                att_stats.get("names", 0),
            )
        else:
            log.info("    → text only (%s, %s)", status, source)

        if source == "hasadna":
            from_hasadna += 1
        else:
            from_self_parse += 1
        ok += 1
        time.sleep(0.15)

    return {
        "table": "knesset_committee_session_transcripts",
        "upserted": ok + failed,
        "inserted": ok,
        "updated": 0,
        "skipped": skipped,
        "failed": failed,
        "parts_written": parts_written,
        "attendance_matched": attendance_matched,
        "candidates": len(candidates),
        "from_hasadna": from_hasadna,
        "from_self_parse": from_self_parse,
    }

# ── Orchestration ─────────────────────────────────────────────────────────────

TABLE_CHOICES = (
    "committees",
    "memberships",
    "sessions",
    "documents",
    "transcripts",
    "attendance",
    "all",
)


def run(
    *,
    knesset_num: int,
    table: str,
    transcripts_mode: str,
    transcripts_limit: int | None,
    skip_transcripts: bool,
) -> dict:
    sb = get_supabase()
    started = datetime.now(timezone.utc)
    summary: dict = {"knesset_num": knesset_num, "steps": {}}

    want = set(TABLE_CHOICES) - {"all"} if table == "all" else {table}
    if skip_transcripts:
        want.discard("transcripts")
        transcripts_mode = "none"

    try:
        if "committees" in want:
            summary["steps"]["committees"] = sync_committees(sb, knesset_num)
        if "memberships" in want:
            summary["steps"]["memberships"] = sync_memberships(sb, knesset_num)
        if "sessions" in want:
            summary["steps"]["sessions"] = sync_sessions(sb, knesset_num)
        if "documents" in want:
            summary["steps"]["documents"] = sync_documents(sb, knesset_num)
        if "transcripts" in want:
            summary["steps"]["transcripts"] = sync_transcripts(
                sb,
                knesset_num,
                mode=transcripts_mode,
                limit=transcripts_limit,
            )
        if "attendance" in want:
            summary["steps"]["attendance"] = sync_attendance_from_existing_parts(
                sb
            )

        finished = datetime.now(timezone.utc)
        record_pipeline_run(
            sb,
            pipeline="knesset-committees",
            action="sync",
            status="success",
            message=f"Knesset {knesset_num} committees sync complete",
            summary=summary,
            source=os.environ.get("PIPELINE_RUN_SOURCE", "cli"),
            started_at=started,
            finished_at=finished,
        )
        log.info("── done ──")
        return summary
    except Exception as exc:
        finished = datetime.now(timezone.utc)
        record_pipeline_run(
            sb,
            pipeline="knesset-committees",
            action="sync",
            status="error",
            message=f"Knesset {knesset_num} committees sync failed",
            error=str(exc),
            summary=summary,
            source=os.environ.get("PIPELINE_RUN_SOURCE", "cli"),
            started_at=started,
            finished_at=finished,
        )
        raise


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Sync Knesset committee data into Supabase"
    )
    parser.add_argument(
        "--knesset",
        type=int,
        default=DEFAULT_KNESSET_NUM,
        help=f"Knesset number (default {DEFAULT_KNESSET_NUM})",
    )
    parser.add_argument(
        "--table",
        choices=TABLE_CHOICES,
        default="all",
        help="Sync only one stage (default all)",
    )
    parser.add_argument(
        "--skip-transcripts",
        action="store_true",
        help="Skip Hasadna transcript/parts download",
    )
    parser.add_argument(
        "--transcripts-mode",
        choices=("missing", "all", "none"),
        default="missing",
        help="missing=only sessions without ready transcript (default)",
    )
    parser.add_argument(
        "--transcripts-limit",
        type=int,
        default=200,
        help="Max sessions to fetch transcripts for this run (default 200; use 0 for no limit)",
    )
    args = parser.parse_args()

    limit = args.transcripts_limit
    if limit == 0:
        limit = None

    run(
        knesset_num=args.knesset,
        table=args.table,
        transcripts_mode=args.transcripts_mode,
        transcripts_limit=limit,
        skip_transcripts=args.skip_transcripts,
    )


if __name__ == "__main__":
    main()

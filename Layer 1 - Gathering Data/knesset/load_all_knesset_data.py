#!/usr/bin/env python3
"""
sync_knesset_data.py  (v2 — field names verified against live API)
====================
Syncs all Knesset data directly from the official Knesset OData API
into Supabase. No third-party data dependencies.

Tables updated:
  knessets · people · knesset_factions · knesset_memberships
  offices  · governments · minister_appointments

Usage:
  python load_all_knesset_data.py                        # full sync
  python load_all_knesset_data.py --discover             # all known entities
  python load_all_knesset_data.py --discover KNS_Position  # one entity only
  python load_all_knesset_data.py --table people         # sync one table only

Requirements:
  pip install -r requirements.txt

Env vars (.env or shell):
  SUPABASE_URL         — Supabase project URL
  SUPABASE_SERVICE_KEY — service role key (NOT the anon key)
  OPENAI_API_KEY       — optional; homepage ticker after membership/appointment diffs
  PIPELINE_RUN_SOURCE  — optional; default cli (GitHub Actions sets github-actions)

Field name corrections vs v1 (from live API discovery):
  - KNS_Faction / KNS_PersonToPosition: EndDate → FinishDate
  - KNS_PersonToPosition: GovNum → GovernmentNum
  - KNS_Person: GenderID mapping removed — use GenderDesc directly ("נקבה"/"זכר")
  - KNS_GovMinistry: no NameEng, no IsShown fields
  - KNS_Knesset / KNS_Government: 404 — run --probe to find correct names
"""

import os
import sys
import time
import logging
import argparse
from datetime import datetime
import xml.etree.ElementTree as ET

import requests
from dotenv import load_dotenv
from supabase import create_client, Client
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from emit_site_updates import (  # noqa: E402
    diff_knesset_positions,
    emit_knesset_run_update,
    snapshot_knesset_positions,
)
from record_pipeline_run import record_pipeline_run  # noqa: E402

load_dotenv()

# ── Logging ───────────────────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger(__name__)

# ── OData config ──────────────────────────────────────────────────────────────

ODATA_BASE  = "http://knesset.gov.il/Odata/ParliamentInfo.svc"
PAGE_SIZE   = 50
RETRY_MAX   = 5
RETRY_DELAY = 4   # seconds × attempt number

NS = {
    "atom": "http://www.w3.org/2005/Atom",
    "m":    "http://schemas.microsoft.com/ado/2007/08/dataservices/metadata",
    "d":    "http://schemas.microsoft.com/ado/2007/08/dataservices",
}

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "application/atom+xml,application/xml",
}

# PositionIDs that mean "Knesset Member" in KNS_PersonToPosition.
# Confirmed via --discover KNS_Position against the live API:
#   43 = חבר הכנסת  (male MK)
#   61 = חברת הכנסת (female MK)
MK_POSITION_IDS = {43, 61}

# Confirmed via --probe against the live API:
#   KNS_KnessetDates ✓  — stores plenum sessions; aggregated by KnessetNum in sync_knessets
#   KNS_Government   ✗  — no endpoint exists; governments derived from KNS_PersonToPosition


# ── Supabase ──────────────────────────────────────────────────────────────────

def get_supabase() -> Client:
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_KEY")
    if not url or not key:
        raise EnvironmentError(
            "SUPABASE_URL and SUPABASE_SERVICE_KEY must be set in .env"
        )
    return create_client(url, key)


# ── OData XML fetching ────────────────────────────────────────────────────────

def is_reblaze_block(text: str) -> bool:
    return any(s in text.lower() for s in ["reblaze", "access denied", "request blocked", "rbzid"])


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
        return text[:10]  # "YYYY-MM-DD"
    return text


def parse_entry(entry: ET.Element) -> dict:
    props = entry.find("./atom:content/m:properties", NS)
    if props is None:
        return {}
    return {
        child.tag.split("}")[-1]: parse_odata_value(child)
        for child in props
    }


def fetch_odata(entity: str, filter_expr: str = None) -> list[dict]:
    """
    Fetch ALL rows from a KNS_* entity using explicit $skip-based pagination.

    The Knesset OData API does not reliably return <link rel="next"> in its
    Atom XML responses, so we never rely on that element. Instead we keep
    incrementing $skip by PAGE_SIZE until a page comes back with fewer rows
    than PAGE_SIZE — that signals the last page.
    """
    base_params: dict = {"$top": PAGE_SIZE}
    if filter_expr:
        base_params["$filter"] = filter_expr

    all_rows: list[dict] = []
    skip = 0
    page = 1

    while True:
        params = {**base_params, "$skip": skip}
        log.info("  %s: page %d (skip=%d)…", entity, page, skip)

        for attempt in range(1, RETRY_MAX + 1):
            try:
                resp = requests.get(
                    f"{ODATA_BASE}/{entity}",
                    params=params,
                    headers=HEADERS,
                    timeout=30,
                )
                resp.raise_for_status()
                if is_reblaze_block(resp.text):
                    wait = RETRY_DELAY * attempt
                    log.warning("  Reblaze block (attempt %d/%d) — waiting %ds", attempt, RETRY_MAX, wait)
                    time.sleep(wait)
                    continue
                break
            except requests.RequestException as exc:
                if attempt == RETRY_MAX:
                    raise
                wait = RETRY_DELAY * attempt
                log.warning("  Error (attempt %d/%d): %s — retrying in %ds", attempt, RETRY_MAX, exc, wait)
                time.sleep(wait)

        root    = ET.fromstring(resp.content)
        entries = root.findall("atom:entry", NS)
        rows    = [parse_entry(e) for e in entries]
        all_rows.extend(rows)
        log.info("  %s: page %d → %d rows (total: %d)", entity, page, len(rows), len(all_rows))

        if len(rows) < PAGE_SIZE:
            break   # last page — fewer rows than requested means no more data

        skip += PAGE_SIZE
        page += 1
        time.sleep(0.3)

    return all_rows


def probe_entity(name: str) -> bool:
    """Return True if an entity name responds with 200 and at least one row."""
    try:
        resp = requests.get(
            f"{ODATA_BASE}/{name}",
            params={"$top": 1},
            headers=HEADERS,
            timeout=10,
        )
        if resp.status_code == 200 and not is_reblaze_block(resp.text):
            root    = ET.fromstring(resp.content)
            entries = root.findall("atom:entry", NS)
            return len(entries) > 0
    except Exception:
        pass
    return False


# ── --discover mode ───────────────────────────────────────────────────────────

DISCOVER_ENTITIES = [
    "KNS_Person",
    "KNS_KnessetDates",
    "KNS_Faction",
    "KNS_PersonToPosition",
    "KNS_GovMinistry",
    "KNS_Position",   # all 29 rows printed — find PositionID for חבר כנסת here
]


def discover(entity: str) -> None:
    log.info("Discovering fields for %s…", entity)
    try:
        rows = fetch_odata(entity)
    except Exception as exc:
        print(f"\n── {entity}: FAILED ({exc})")
        return
    if not rows:
        print(f"\n── {entity}: no rows returned")
        return

    # For small tables (≤ 50 rows) print every row so nothing is hidden.
    # For large tables print only the first row as a field-name reference.
    if len(rows) <= 50:
        print(f"\n── {entity} (ALL {len(rows)} rows) ──")
        for i, row in enumerate(rows):
            print(f"\n  [row {i + 1}]")
            for k, v in row.items():
                print(f"    {k:<40} = {repr(v)}")
    else:
        print(f"\n── {entity} ({len(rows)} total rows — showing first row only) ──")
        for k, v in rows[0].items():
            print(f"  {k:<40} = {repr(v)}")


# ── --probe mode ──────────────────────────────────────────────────────────────

def run_probe() -> None:
    """
    Try candidate entity names to find the correct endpoints for
    knessets and governments. Print the first working name for each.
    """
    print("\n── Probing for missing entity names ──")
    for group, candidates in PROBE_CANDIDATES.items():
        print(f"\n  Looking for: {group}")
        found = False
        for name in candidates:
            sys.stdout.write(f"    trying {name}… ")
            sys.stdout.flush()
            if probe_entity(name):
                print("✓ FOUND")
                # print fields of the working entity
                rows = fetch_odata(name)
                if rows:
                    print(f"    Fields in {name}:")
                    for k, v in rows[0].items():
                        print(f"      {k:<40} = {repr(v)}")
                found = True
                break
            else:
                print("✗")
        if not found:
            print(f"    ✗ No working entity found for {group}.")
            print(f"      → Derive {group} from existing data instead (see sync functions).")


# ── Helpers ───────────────────────────────────────────────────────────────────

def _empty_write_stats(table: str) -> dict:
    return {
        "table": table,
        "upserted": 0,
        "inserted": 0,
        "updated": 0,
        "skipped": 0,
    }


def _normalize_compare_value(value):
    """Normalize DB/OData values so format noise does not force false updates."""
    if value is None:
        return None
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return value
    if isinstance(value, datetime):
        return value.date().isoformat()
    text = str(value).strip()
    if not text:
        return None
    # Timestamps / dates from PostgREST → compare on calendar date when present.
    if len(text) >= 10 and text[4] == "-" and text[7] == "-":
        return text[:10]
    if text.lower() in ("true", "false"):
        return text.lower() == "true"
    return text


def _row_fields_equal(incoming: dict, existing: dict, fields: list[str]) -> bool:
    for field in fields:
        left = _normalize_compare_value(incoming.get(field))
        right = _normalize_compare_value(existing.get(field))
        if left != right:
            return False
    return True


def load_existing_rows(
    sb: Client,
    table: str,
    conflict_col: str,
    columns: list[str],
) -> dict:
    """
    Return {conflict_col_value → row dict} for every row in the table.
    Paginates past Supabase's 1000-row default limit.
    """
    select_cols = ", ".join(dict.fromkeys([conflict_col, *columns]))
    result: dict = {}
    page_size = 1000
    offset = 0
    while True:
        rows = (
            sb.table(table)
            .select(select_cols)
            .range(offset, offset + page_size - 1)
            .execute()
            .data
        )
        for row in rows:
            key = row.get(conflict_col)
            if key is not None:
                result[key] = row
        if len(rows) < page_size:
            break
        offset += page_size
    return result


def upsert(
    sb: Client,
    table: str,
    rows: list[dict],
    conflict_col: str,
    existing_keys: set | None = None,
) -> dict:
    """
    Insert new keys; update existing rows only when synced fields changed;
    skip identical rows. Never deletes.
    """
    if not rows:
        log.info("  → %s: nothing to upsert", table)
        return _empty_write_stats(table)

    # Union of payload keys (except conflict) — used for compare + update bodies.
    compare_fields: list[str] = []
    seen_fields: set[str] = set()
    for row in rows:
        for key in row:
            if key == conflict_col or key in seen_fields:
                continue
            seen_fields.add(key)
            compare_fields.append(key)

    existing_rows = load_existing_rows(sb, table, conflict_col, compare_fields)
    if existing_keys is None:
        existing_keys = set(existing_rows.keys())

    to_insert: list[dict] = []
    to_update: list[dict] = []
    skipped = 0

    for row in rows:
        key = row.get(conflict_col)
        if key is None:
            continue
        if key not in existing_keys:
            to_insert.append(row)
            continue
        existing = existing_rows.get(key)
        if existing is None:
            # Caller marked key as existing (e.g. just written in an earlier
            # pass) but we have no prior snapshot — conflict-upsert as update.
            to_update.append(row)
            continue
        fields = [f for f in row.keys() if f != conflict_col]
        if _row_fields_equal(row, existing, fields):
            skipped += 1
            continue
        to_update.append(row)

    for i in range(0, len(to_insert), 500):
        sb.table(table).insert(to_insert[i:i + 500]).execute()

    # Targeted upsert only for rows whose synced fields actually changed.
    for i in range(0, len(to_update), 500):
        sb.table(table).upsert(
            to_update[i:i + 500],
            on_conflict=conflict_col,
        ).execute()

    inserted = len(to_insert)
    updated = len(to_update)
    written = inserted + updated
    log.info(
        "  → %s: wrote %d rows (%d new, %d updated, %d skipped unchanged)",
        table,
        written,
        inserted,
        updated,
        skipped,
    )
    return {
        "table": table,
        "upserted": written,
        "inserted": inserted,
        "updated": updated,
        "skipped": skipped,
    }


def load_id_map(sb: Client, table: str, key_col: str) -> dict:
    """
    Return {key_col_value → supabase id} for every row in the table.
    Paginates past Supabase's 1000-row default limit so nothing is silently missed.
    """
    result_map: dict = {}
    page_size   = 1000
    offset      = 0
    while True:
        rows = (
            sb.table(table)
            .select(f"id, {key_col}")
            .range(offset, offset + page_size - 1)
            .execute()
            .data
        )
        for row in rows:
            if row[key_col] is not None:
                result_map[row[key_col]] = row["id"]
        if len(rows) < page_size:
            break
        offset += page_size
    return result_map


# ── Sync functions ────────────────────────────────────────────────────────────

def sync_knessets(sb: Client) -> dict[int, int]:
    """
    Source:   KNS_KnessetDates (confirmed via --probe)
    Verified: KnessetNum · PlenumStart · PlenumFinish · IsCurrent

    KNS_KnessetDates stores individual plenum sessions — multiple rows per
    Knesset (e.g. Knesset 13 has Assembly 1/Plenum 2, Assembly 1/Plenum 3…).
    We aggregate by KnessetNum:
      start_date = min(PlenumStart)   across all plenums for that Knesset
      end_date   = max(PlenumFinish)  across all plenums for that Knesset
      is_active  = any(IsCurrent)
    """
    from collections import defaultdict

    log.info("── syncing knessets ──")
    raw = fetch_odata("KNS_KnessetDates")
    log.info("  %d plenum-session rows fetched — aggregating by KnessetNum", len(raw))

    groups: dict[int, list] = defaultdict(list)
    for r in raw:
        k = r.get("KnessetNum")
        if k is not None:
            groups[k].append(r)

    rows = []
    for knum in sorted(groups):
        plenums     = groups[knum]
        start_dates = [p["PlenumStart"]  for p in plenums if p.get("PlenumStart")]
        end_dates   = [p["PlenumFinish"] for p in plenums if p.get("PlenumFinish")]
        rows.append({
            "knesset_number": knum,
            "knesset_name":   f"כנסת ה-{knum}",
            "start_date":     min(start_dates) if start_dates else None,
            "end_date":       max(end_dates)   if end_dates   else None,
            "is_active":      any(bool(p.get("IsCurrent")) for p in plenums),
        })

    log.info("  aggregated into %d knesset rows", len(rows))
    existing_keys = set(load_id_map(sb, "knessets", "knesset_number").keys())
    stats = upsert(sb, "knessets", rows, "knesset_number", existing_keys)
    return load_id_map(sb, "knessets", "knesset_number"), stats


def sync_people(sb: Client) -> dict[int, int]:
    """
    Source:   KNS_Person
    Verified: PersonID · LastName · FirstName · GenderDesc · Email · IsCurrent
    Note:     BirthDate not seen in discovery — kept but may be absent.
              GenderDesc already contains "נקבה"/"זכר" — used directly.
    """
    log.info("── syncing people ──")
    raw = fetch_odata("KNS_Person")

    rows = [
        {
            "knesset_person_id": r["PersonID"],
            "full_name":  f'{r.get("FirstName") or ""} {r.get("LastName") or ""}'.strip(),
            "gender":     r.get("GenderDesc"),          # "נקבה" or "זכר" directly
            "birth_date": r.get("BirthDate"),            # may be absent — handled as None
            "email":      r.get("Email"),
            "is_current": bool(r.get("IsCurrent", False)),
        }
        for r in raw
        if r.get("PersonID") is not None
    ]

    existing_keys = set(load_id_map(sb, "people", "knesset_person_id").keys())
    stats = upsert(sb, "people", rows, "knesset_person_id", existing_keys)
    return load_id_map(sb, "people", "knesset_person_id"), stats


def sync_factions(sb: Client, knesset_map: dict[int, int]) -> dict[int, int]:
    """
    Source:   KNS_Faction
    Verified: FactionID · Name · KnessetNum · StartDate · FinishDate · IsCurrent

    Fields NOT included in the upsert (manually curated, never overwritten):
      color · logo_url · short_name · is_coalition
    """
    log.info("── syncing knesset_factions ──")
    raw = fetch_odata("KNS_Faction")

    rows, skipped = [], 0
    for r in raw:
        k_id = knesset_map.get(r.get("KnessetNum"))
        if not k_id:
            skipped += 1
            continue
        rows.append({
            "knesset_faction_id": r["FactionID"],
            "knesset_id":         k_id,
            "name":               r.get("Name"),
            "start_date":         r.get("StartDate"),
            "end_date":           r.get("FinishDate"),  # ← FinishDate, NOT EndDate
            "is_current":         bool(r.get("IsCurrent", False)),
        })

    if skipped:
        log.warning("  knesset_factions: skipped %d rows (unknown KnessetNum)", skipped)

    existing_keys = set(load_id_map(sb, "knesset_factions", "knesset_faction_id").keys())
    stats = upsert(sb, "knesset_factions", rows, "knesset_faction_id", existing_keys)
    return load_id_map(sb, "knesset_factions", "knesset_faction_id"), stats


def sync_offices(sb: Client) -> dict[int, int]:
    """
    Source:   KNS_GovMinistry
    Verified: GovMinistryID · Name · IsActive
    Note:     NameEng and IsShown do NOT exist in the live API.

    Ownership:
      knesset_category_name — always mirrored from OData Name
      name — display override; set on insert only, never overwritten by sync
      is_active — mirrored from OData
    """
    log.info("── syncing offices ──")
    raw = fetch_odata("KNS_GovMinistry")

    existing_keys = set(load_id_map(sb, "offices", "knesset_category_id").keys())
    rows = []
    for r in raw:
        category_id = r.get("GovMinistryID")
        if category_id is None:
            continue
        row = {
            "knesset_category_id":   category_id,
            "knesset_category_name": r.get("Name"),
            "is_active":             bool(r.get("IsActive", True)),
        }
        # Preserve curated display names on existing rows.
        if category_id not in existing_keys:
            row["name"] = r.get("Name")
        rows.append(row)

    stats = upsert(sb, "offices", rows, "knesset_category_id", existing_keys)
    return load_id_map(sb, "offices", "knesset_category_id"), stats


def sync_governments(sb: Client) -> dict[int, int]:
    """
    No KNS_Government endpoint exists in the Knesset OData API (confirmed via --probe).
    The governments table has NOT NULL constraints on knesset_id and start_date which
    cannot be satisfied from OData data alone.

    This function does NOT write to the governments table. It loads whatever rows
    already exist in the DB and returns them as a map for use by minister_appointments.

    To populate governments properly, data must be entered manually in Supabase
    with the correct knesset_id and start_date values.
    """
    log.info("── governments: loading from DB (no OData endpoint, cannot auto-sync) ──")
    gov_map = load_id_map(sb, "governments", "government_number")
    log.info("  found %d government rows in DB", len(gov_map))
    if not gov_map:
        log.warning(
            "  governments table is empty - minister_appointments will be skipped. "
            "Populate governments manually in Supabase with knesset_id + start_date."
        )
    return gov_map


def sync_positions(sb: Client, people_map: dict, knesset_map: dict, faction_map: dict, gov_map: dict, office_map: dict) -> dict:
    """
    Fetches KNS_PersonToPosition ONCE and writes to both:
      - knesset_memberships  (rows where PositionID in MK_POSITION_IDS)
      - minister_appointments (rows where GovernmentNum and GovMinistryID are set)

    Verified fields: PersonToPositionID · PersonID · PositionID · KnessetNum
                     StartDate · FinishDate · GovMinistryID · FactionID
                     GovernmentNum · DutyDesc · IsCurrent
    """
    log.info("── fetching KNS_PersonToPosition (shared for memberships + appointments) ──")
    positions = fetch_odata("KNS_PersonToPosition")
    log.info("  total positions: %d", len(positions))

    # ── knesset_memberships ──────────────────────────────────────────────────
    log.info("── syncing knesset_memberships ──")
    mk_positions = [r for r in positions if r.get("PositionID") in MK_POSITION_IDS]
    log.info("  MK positions (PositionID in %s): %d", MK_POSITION_IDS, len(mk_positions))

    if not mk_positions:
        log.warning(
            "  ⚠ Zero MK rows found! MK_POSITION_IDS %s may be wrong.\n"
            "    Run: python load_all_knesset_data.py --discover\n"
            "    and check KNS_Position output for the correct PositionID for חבר כנסת.",
            MK_POSITION_IDS,
        )

    membership_rows, faction_updates, skipped = [], [], 0
    for r in mk_positions:
        person_id  = people_map.get(r.get("PersonID"))
        knesset_id = knesset_map.get(r.get("KnessetNum"))
        faction_id = faction_map.get(r.get("FactionID")) if r.get("FactionID") else None
        if not person_id or not knesset_id:
            skipped += 1
            continue
        # Base row — never includes faction_id so we never overwrite an existing
        # correct link with a null from OData. faction_id is managed separately below.
        membership_rows.append({
            "knesset_position_id": r["PersonToPositionID"],
            "person_id":           person_id,
            "knesset_id":          knesset_id,
            "start_date":          r.get("StartDate"),
            "end_date":            r.get("FinishDate"),  # ← FinishDate, NOT EndDate
            "duty_desc":           r.get("DutyDesc"),
        })
        # Only update faction_id when OData actually has a value.
        # This preserves any faction links set by previous scripts or manual curation.
        if faction_id is not None:
            faction_updates.append({
                "knesset_position_id": r["PersonToPositionID"],
                "faction_id":          faction_id,
            })

    if skipped:
        log.warning("  knesset_memberships: skipped %d unmapped rows", skipped)

    # Pass 1: upsert all base data (person, knesset, dates) — faction_id untouched
    membership_existing = set(
        load_id_map(sb, "knesset_memberships", "knesset_position_id").keys()
    )
    membership_stats = upsert(
        sb,
        "knesset_memberships",
        membership_rows,
        "knesset_position_id",
        membership_existing,
    )
    # Keys just written in pass 1 must count as existing for faction_id pass 2,
    # otherwise partial inserts (position_id + faction_id only) would be attempted.
    for row in membership_rows:
        key = row.get("knesset_position_id")
        if key is not None:
            membership_existing.add(key)

    # Pass 2: upsert faction links only where OData has a value
    faction_stats = {
        "table": "knesset_memberships.faction_id",
        "upserted": 0,
        "inserted": 0,
        "updated": 0,
        "skipped": 0,
    }
    if faction_updates:
        faction_stats = upsert(
            sb,
            "knesset_memberships",
            faction_updates,
            "knesset_position_id",
            membership_existing,
        )
        faction_stats["table"] = "knesset_memberships.faction_id"
        log.info("  → faction_id updated for %d rows", len(faction_updates))
    else:
        log.warning("  OData returned no FactionID values — faction links unchanged")

    # ── minister_appointments ────────────────────────────────────────────────
    log.info("── syncing minister_appointments ──")
    min_positions = [
        r for r in positions
        if r.get("GovernmentNum") is not None and r.get("GovMinistryID") is not None
    ]
    log.info("  ministerial positions: %d", len(min_positions))

    appointment_rows, skipped = [], 0
    for r in min_positions:
        person_id = people_map.get(r.get("PersonID"))
        gov_id    = gov_map.get(r.get("GovernmentNum"))  # ← GovernmentNum, NOT GovNum
        office_id = office_map.get(r.get("GovMinistryID"))
        if not person_id or not gov_id or not office_id:
            skipped += 1
            continue
        appointment_rows.append({
            "knesset_position_id": r["PersonToPositionID"],
            "person_id":           person_id,
            "government_id":       gov_id,
            "office_id":           office_id,
            "start_date":          r.get("StartDate"),
            "end_date":            r.get("FinishDate"),  # ← FinishDate, NOT EndDate
            "is_current":          bool(r.get("IsCurrent", False)),
            "is_acting":           False,
            "duty_desc":           r.get("DutyDesc"),
        })
    if skipped:
        log.warning("  minister_appointments: skipped %d unmapped rows", skipped)
    appointment_existing = set(
        load_id_map(sb, "minister_appointments", "knesset_position_id").keys()
    )
    appointment_stats = upsert(
        sb,
        "minister_appointments",
        appointment_rows,
        "knesset_position_id",
        appointment_existing,
    )

    return {
        "knesset_memberships": membership_stats,
        "knesset_memberships_faction_id": faction_stats,
        "minister_appointments": appointment_stats,
    }


# ── Full sync ─────────────────────────────────────────────────────────────────

def sync_all(sb: Client) -> dict:
    start = datetime.now()
    log.info("═══ Knesset OData full sync — %s ═══", start.strftime("%Y-%m-%d %H:%M"))

    knesset_map, knesset_stats = sync_knessets(sb)
    people_map, people_stats = sync_people(sb)
    faction_map, faction_stats = sync_factions(sb, knesset_map)
    office_map, office_stats = sync_offices(sb)
    gov_map = sync_governments(sb)
    before = snapshot_knesset_positions(sb)
    position_stats = sync_positions(
        sb, people_map, knesset_map, faction_map, gov_map, office_map
    )
    after = snapshot_knesset_positions(sb)
    changes = diff_knesset_positions(before, after)
    site_update = None
    if changes:
        site_update = emit_knesset_run_update(sb, changes=changes)
        if site_update:
            log.info(
                "site_updates: emitted headline — %s",
                site_update.get("headline"),
            )
        else:
            log.info(
                "site_updates: changes found but emit skipped "
                "(missing OPENAI_API_KEY or API error)"
            )
    else:
        log.info("site_updates: skipped — no membership/appointment field diffs")

    elapsed = (datetime.now() - start).seconds
    log.info("═══ Sync complete in %dm %ds ═══", elapsed // 60, elapsed % 60)

    stages = [
        knesset_stats,
        people_stats,
        faction_stats,
        office_stats,
        position_stats["knesset_memberships"],
        position_stats["knesset_memberships_faction_id"],
        position_stats["minister_appointments"],
    ]
    return {
        "elapsed_seconds": elapsed,
        "stages": stages,
        "change_count": len(changes),
        "site_update_emitted": bool(site_update),
        "site_update": site_update,
    }


# ── CLI ───────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Sync Knesset OData → Supabase")
    parser.add_argument(
        "--discover",
        nargs="?",
        const="all",
        metavar="ENTITY",
        help=(
            "Print raw API fields. No argument = all known entities. "
            "Pass an entity name to target one: --discover KNS_Position"
        ),
    )
    parser.add_argument(
        "--table",
        choices=["knessets", "people", "knesset_factions",
                 "offices", "governments", "knesset_memberships",
                 "minister_appointments"],
        help="Sync a single table only",
    )
    args = parser.parse_args()

    if args.discover:
        if args.discover == "all":
            for entity in DISCOVER_ENTITIES:
                discover(entity)
        else:
            discover(args.discover)
        return

    sb = get_supabase()
    start = datetime.now()
    run_error: str | None = None
    exit_code = 0
    summary: dict | None = None
    action = f"table-{args.table}" if args.table else "sync-full"
    site_update_emitted = False

    try:
        if args.table:
            log.info("Single-table sync: %s", args.table)
            km = load_id_map(sb, "knessets",        "knesset_number")
            pm = load_id_map(sb, "people",           "knesset_person_id")
            fm = load_id_map(sb, "knesset_factions", "knesset_faction_id")
            gm = load_id_map(sb, "governments",      "government_number")
            om = load_id_map(sb, "offices",          "knesset_category_id")

            def sync_positions_with_emit() -> dict:
                before = snapshot_knesset_positions(sb)
                position_stats = sync_positions(sb, pm, km, fm, gm, om)
                after = snapshot_knesset_positions(sb)
                changes = diff_knesset_positions(before, after)
                emitted = False
                if changes:
                    site_update = emit_knesset_run_update(sb, changes=changes)
                    emitted = bool(site_update)
                    if site_update:
                        log.info(
                            "site_updates: emitted headline — %s",
                            site_update.get("headline"),
                        )
                    else:
                        log.info(
                            "site_updates: changes found but emit skipped "
                            "(missing OPENAI_API_KEY or API error)"
                        )
                else:
                    log.info(
                        "site_updates: skipped — no membership/appointment field diffs"
                    )
                return {
                    "stages": [
                        position_stats["knesset_memberships"],
                        position_stats["knesset_memberships_faction_id"],
                        position_stats["minister_appointments"],
                    ],
                    "change_count": len(changes),
                    "site_update_emitted": emitted,
                }

            runners = {
                "knessets":              lambda: {"stages": [sync_knessets(sb)[1]]},
                "people":                lambda: {"stages": [sync_people(sb)[1]]},
                "knesset_factions":      lambda: {
                    "stages": [sync_factions(sb, km)[1]]
                },
                "offices":               lambda: {"stages": [sync_offices(sb)[1]]},
                "governments":           lambda: {
                    "stages": [],
                    "note": (
                        f"loaded {len(sync_governments(sb))} governments "
                        "(no OData write)"
                    ),
                },
                "knesset_memberships":   sync_positions_with_emit,
                "minister_appointments": sync_positions_with_emit,
            }
            summary = runners[args.table]()
            site_update_emitted = bool(summary.get("site_update_emitted"))
        else:
            summary = sync_all(sb)
            site_update_emitted = bool(summary.get("site_update_emitted"))
    except Exception as exc:
        exit_code = 1
        run_error = str(exc)
        log.exception("Knesset sync failed: %s", exc)

    elapsed = (datetime.now() - start).seconds
    source = os.environ.get("PIPELINE_RUN_SOURCE", "cli")
    status = "success" if exit_code == 0 else "error"
    if site_update_emitted:
        ticker_note = "site_updates emitted"
    elif exit_code == 0:
        ticker_note = "site_updates skipped"
    else:
        ticker_note = "site_updates not attempted"
    message = (
        f"Knesset {action} finished in {elapsed}s "
        f"(exit {exit_code}; {ticker_note})"
    )
    record_pipeline_run(
        sb,
        pipeline="knesset",
        action=action,
        status=status,
        message=message,
        error=run_error,
        summary=summary,
        source=source,
        started_at=start,
    )
    sys.exit(exit_code)


if __name__ == "__main__":
    main()

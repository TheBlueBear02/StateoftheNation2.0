"""
seed.py — One-time initial data load from Knesset OData-v4 API
===============================================================
Populates all core tables directly from the official Knesset API.

Tables seeded (in dependency order):
  1. knessets            ← KNS_KnessetDates
  2. offices             ← KNS_GovMinistry  (deduped by CategoryID)
  3. people              ← KNS_Person
  4. knesset_factions    ← KNS_Faction
  5. governments         ← derived from KNS_PersonToPosition
  6. knesset_memberships ← KNS_PersonToPosition (KM positions)
  7. minister_appointments ← KNS_PersonToPosition (minister positions)

Setup:
  pip install supabase python-dotenv requests

Env (.env):
  SUPABASE_URL
  SUPABASE_SERVICE_KEY   ← service role key, not anon
"""

import os
import time
import logging
from datetime import datetime
from collections import defaultdict

import requests
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv()
logging.basicConfig(level=logging.INFO, format="%(message)s")
log = logging.getLogger(__name__)

# ── Config ────────────────────────────────────────────────────────────────────

SUPABASE_URL         = os.environ["SUPABASE_URL"]
SUPABASE_SERVICE_KEY = os.environ["SUPABASE_SERVICE_KEY"]

ODATA_BASE   = "https://knesset.gov.il/OdataV4/ParliamentInfo"
BATCH_SIZE   = 500
REQUEST_DELAY = 0.3   # seconds between API calls — be respectful

# ── KNS_PersonToPosition: position IDs ───────────────────────────────────────
# From KNS_Position table / manual

KM_POSITION_IDS = {43, 61}             # חבר כנסת / חברת כנסת

MINISTER_POSITION_IDS = {
    39,   # שר
    57,   # שרה
    45,   # ראש הממשלה
    49,   # מ"מ שר
    51,   # מ"מ ראש הממשלה
    31,   # משנה לראש הממשלה
    50,   # סגן ראש הממשלה
    40,   # סגן שר
    59,   # סגנית שר
}

ACTING_POSITION_IDS = {49, 51}

# ── OData fetch ───────────────────────────────────────────────────────────────

def odata_fetch_all(entity: str, params: dict = None) -> list[dict]:
    """
    Fetches all pages from an OData-v4 endpoint, following @odata.nextLink.
    Returns the full combined list of records.
    """
    url = f"{ODATA_BASE}/{entity}"
    base_params = {"$format": "json"}
    if params:
        base_params.update(params)

    all_records = []
    page = 1

    while url:
        try:
            r = requests.get(url, params=base_params if page == 1 else None,
                             timeout=30)
            r.raise_for_status()
            data = r.json()
        except requests.RequestException as e:
            log.error(f"  ✗ API error fetching {entity} page {page}: {e}")
            break

        records = data.get("value", [])
        all_records.extend(records)
        log.info(f"    page {page}: {len(records)} records (total so far: {len(all_records)})")

        url = data.get("@odata.nextLink")
        base_params = None   # nextLink already has params baked in
        page += 1
        time.sleep(REQUEST_DELAY)

    return all_records


def batch_upsert(sb: Client, table: str, rows: list[dict],
                 on_conflict: str) -> int:
    if not rows:
        return 0
    inserted = 0
    for i in range(0, len(rows), BATCH_SIZE):
        batch = rows[i:i + BATCH_SIZE]
        sb.table(table).upsert(batch, on_conflict=on_conflict).execute()
        inserted += len(batch)
    return inserted


def parse_date(val: str) -> str | None:
    if not val:
        return None
    return val[:10]   # "2022-12-29T00:00:00Z" → "2022-12-29"


# ── Step 1: Knessets ──────────────────────────────────────────────────────────

def seed_knessets(sb: Client) -> dict:
    """
    KNS_KnessetDates has multiple rows per Knesset (one per session).
    We aggregate: take the earliest PlenumStart, latest PlenumFinish,
    and any IsCurrent=true means the Knesset is active.
    Returns map: knesset_number → knessets.id
    """
    log.info("\n── Step 1: Knessets (KNS_KnessetDates)")
    records = odata_fetch_all("KNS_KnessetDates")

    # Aggregate by KnessetNum
    agg = defaultdict(lambda: {
        "start": None, "end": None,
        "is_active": False, "name": None
    })
    for r in records:
        num = r["KnessetNum"]
        start = parse_date(r.get("PlenumStart"))
        end   = parse_date(r.get("PlenumFinish"))
        is_current = bool(r.get("IsCurrent"))

        if start and (agg[num]["start"] is None or start < agg[num]["start"]):
            agg[num]["start"] = start
        if end and (agg[num]["end"] is None or end > agg[num]["end"]):
            agg[num]["end"] = end
        if is_current:
            agg[num]["is_active"] = True
            agg[num]["end"] = None   # active Knesset has no end date
        if not agg[num]["name"] and r.get("Name"):
            agg[num]["name"] = r["Name"]

    rows = [
        {
            "knesset_number": num,
            "knesset_name":   data["name"],
            "start_date":     data["start"],
            "end_date":       data["end"],
            "is_active":      data["is_active"],
        }
        for num, data in agg.items()
        if data["start"]   # skip any rows with no date
    ]

    count = batch_upsert(sb, "knessets", rows, on_conflict="knesset_number")
    log.info(f"  ✓ {count} knessets seeded")

    result = sb.table("knessets").select("id, knesset_number").execute()
    return {r["knesset_number"]: r["id"] for r in result.data}


# ── Step 2: Offices ───────────────────────────────────────────────────────────

def seed_offices(sb: Client) -> tuple[dict, dict]:
    """
    KNS_GovMinistry has one row per ministry per government.
    We deduplicate by CategoryID — one row per stable ministry concept.
    Returns:
      office_map:   category_id → offices.id
      ministry_map: govministry_id → category_id  (for appointments lookup)
    """
    log.info("\n── Step 2: Offices (KNS_GovMinistry, deduped by CategoryID)")
    records = odata_fetch_all("KNS_GovMinistry")

    seen_categories = {}         # category_id → row
    ministry_map: dict[int, int] = {}   # govministry_id → category_id

    for r in records:
        ministry_id  = r.get("Id")
        category_id  = r.get("CategoryID")
        category_name = r.get("CategoryName") or r.get("Name")

        if not category_id:
            continue

        ministry_map[ministry_id] = category_id

        if category_id not in seen_categories:
            seen_categories[category_id] = {
                "knesset_category_id":   category_id,
                "knesset_category_name": category_name,
                "name":                  r.get("Name"),
                "is_active":             bool(r.get("IsActive", True)),
                "is_shown":              True,
            }

    rows = list(seen_categories.values())
    count = batch_upsert(sb, "offices", rows,
                         on_conflict="knesset_category_id")
    log.info(f"  ✓ {count} offices seeded ({len(rows)} unique categories)")

    result = sb.table("offices").select("id, knesset_category_id").execute()
    office_map = {r["knesset_category_id"]: r["id"]
                  for r in result.data if r.get("knesset_category_id")}
    return office_map, ministry_map


# ── Step 3: People ────────────────────────────────────────────────────────────

def seed_people(sb: Client) -> dict:
    """
    KNS_Person — every MK and government member in history.
    Returns map: knesset_person_id → people.id
    """
    log.info("\n── Step 3: People (KNS_Person)")
    records = odata_fetch_all("KNS_Person")

    rows = []
    for r in records:
        person_id  = r.get("Id")
        last_name  = (r.get("LastName") or "").strip()
        first_name = (r.get("FirstName") or "").strip()
        if not last_name:
            continue

        gender_desc = r.get("GenderDesc", "")
        gender = "זכר" if "זכר" in gender_desc else (
                 "נקבה" if "נקבה" in gender_desc else None)

        rows.append({
            "knesset_person_id": person_id,
            "full_name":         f"{first_name} {last_name}".strip(),
            "gender":            gender,
            "email":             r.get("Email") or None,
            "is_current":        bool(r.get("IsCurrent")),
        })

    count = batch_upsert(sb, "people", rows,
                         on_conflict="knesset_person_id")
    log.info(f"  ✓ {count} people seeded")

    # Paginate the full map read (can be large)
    all_rows, page = [], 0
    while True:
        result = sb.table("people").select("id, knesset_person_id") \
            .range(page * 1000, page * 1000 + 999).execute()
        if not result.data:
            break
        all_rows.extend(result.data)
        page += 1

    return {r["knesset_person_id"]: r["id"]
            for r in all_rows if r.get("knesset_person_id")}


# ── Step 4: Knesset factions ──────────────────────────────────────────────────

def seed_knesset_factions(sb: Client, knessets_map: dict) -> dict:
    """
    KNS_Faction — one record per faction per Knesset.
    Returns map: knesset_faction_id → knesset_factions.id
    """
    log.info("\n── Step 4: Knesset factions (KNS_Faction)")
    records = odata_fetch_all("KNS_Faction")

    rows = []
    skipped = 0
    for r in records:
        knesset_num = r.get("KnessetNum")
        knesset_id  = knessets_map.get(knesset_num)
        if not knesset_id:
            skipped += 1
            continue

        rows.append({
            "knesset_faction_id": r.get("Id"),
            "knesset_id":         knesset_id,
            "name":               r.get("Name", "").strip(),
            "start_date":         parse_date(r.get("StartDate")),
            "end_date":           parse_date(r.get("FinishDate")),
            "is_current":         bool(r.get("IsCurrent")),
            "party_id":           None,
        })

    count = batch_upsert(sb, "knesset_factions", rows,
                         on_conflict="knesset_faction_id")
    log.info(f"  ✓ {count} factions seeded  |  {skipped} skipped (no knesset mapping)")

    result = sb.table("knesset_factions").select("id, knesset_faction_id").execute()
    return {r["knesset_faction_id"]: r["id"] for r in result.data}


# ── Step 5: Governments ───────────────────────────────────────────────────────

def seed_governments(sb: Client, knessets_map: dict,
                     positions_data: list[dict]) -> dict:
    """
    Derived from KNS_PersonToPosition — group by GovernmentNum.
    Returns map: government_number → governments.id
    """
    log.info("\n── Step 5: Governments (derived from KNS_PersonToPosition)")

    agg = defaultdict(lambda: {
        "start": None, "end": None,
        "knesset_num": None, "is_active": False
    })

    for r in positions_data:
        gov_num = r.get("GovernmentNum")
        if not gov_num or gov_num == 0:
            continue

        start = parse_date(r.get("StartDate"))
        end   = parse_date(r.get("FinishDate"))
        knum  = r.get("KnessetNum")
        is_current = bool(r.get("IsCurrent"))

        g = agg[gov_num]
        if start and (g["start"] is None or start < g["start"]):
            g["start"] = start
        if end and (g["end"] is None or end > g["end"]):
            g["end"] = end
        if is_current:
            g["is_active"] = True
            g["end"] = None
        if knum and not g["knesset_num"]:
            g["knesset_num"] = knum

    rows = []
    skipped = 0
    for gov_num, data in agg.items():
        knesset_id = knessets_map.get(data["knesset_num"])
        if not knesset_id or not data["start"]:
            skipped += 1
            continue
        rows.append({
            "government_number": gov_num,
            "knesset_id":        knesset_id,
            "start_date":        data["start"],
            "end_date":          data["end"],
            "is_active":         data["is_active"],
        })

    count = batch_upsert(sb, "governments", rows,
                         on_conflict="government_number")
    log.info(f"  ✓ {count} governments seeded  |  {skipped} skipped")

    result = sb.table("governments").select("id, government_number").execute()
    return {r["government_number"]: r["id"] for r in result.data}


# ── Step 6: Knesset memberships ───────────────────────────────────────────────

def seed_knesset_memberships(sb: Client, positions_data: list[dict],
                              people_map: dict, knessets_map: dict,
                              factions_map: dict):
    log.info("\n── Step 6: Knesset memberships (KM positions)")

    rows = []
    skipped = defaultdict(int)

    for r in positions_data:
        if r.get("PositionID") not in KM_POSITION_IDS:
            continue

        person_id  = people_map.get(r.get("PersonID"))
        knesset_id = knessets_map.get(r.get("KnessetNum"))
        faction_id = factions_map.get(r.get("FactionID"))
        start      = parse_date(r.get("StartDate"))

        if not person_id:  skipped["no_person"] += 1;  continue
        if not knesset_id: skipped["no_knesset"] += 1; continue
        if not start:      skipped["no_date"] += 1;    continue

        rows.append({
            "knesset_position_id": r.get("Id"),
            "person_id":           person_id,
            "knesset_id":          knesset_id,
            "faction_id":          faction_id,   # nullable — OK if missing
            "party_id":            None,          # set manually later
            "is_coalition":        False,         # not in API — review manually
            "duty_desc":           r.get("DutyDesc") or None,
            "start_date":          start,
            "end_date":            parse_date(r.get("FinishDate")),
        })

    count = batch_upsert(sb, "knesset_memberships", rows,
                         on_conflict="knesset_position_id")
    log.info(f"  ✓ {count} memberships seeded")
    if any(skipped.values()):
        log.info(f"  ⚠  Skipped — {dict(skipped)}")
    log.info("  ⚠  is_coalition defaults to False — set manually")


# ── Step 7: Minister appointments ─────────────────────────────────────────────

def seed_minister_appointments(sb: Client, positions_data: list[dict],
                                people_map: dict, governments_map: dict,
                                office_map: dict, ministry_map: dict):
    log.info("\n── Step 7: Minister appointments (minister positions)")

    rows = []
    skipped = defaultdict(int)

    for r in positions_data:
        pos_id = r.get("PositionID")
        if pos_id not in MINISTER_POSITION_IDS:
            continue

        person_id  = people_map.get(r.get("PersonID"))
        gov_num    = r.get("GovernmentNum")
        gov_id     = governments_map.get(gov_num) if gov_num else None
        ministry_id = r.get("GovMinistryID")
        category_id = ministry_map.get(ministry_id)
        office_id   = office_map.get(category_id) if category_id else None
        start       = parse_date(r.get("StartDate"))

        if not person_id: skipped["no_person"] += 1;  continue
        if not gov_id:    skipped["no_gov"] += 1;     continue
        if not office_id: skipped["no_office"] += 1;  continue
        if not start:     skipped["no_date"] += 1;    continue

        rows.append({
            "knesset_position_id": r.get("Id"),
            "person_id":           person_id,
            "government_id":       gov_id,
            "office_id":           office_id,
            "duty_desc":           r.get("DutyDesc") or None,
            "start_date":          start,
            "end_date":            parse_date(r.get("FinishDate")),
            "is_current":          bool(r.get("IsCurrent")),
            "is_acting":           pos_id in ACTING_POSITION_IDS,
        })

    count = batch_upsert(sb, "minister_appointments", rows,
                         on_conflict="knesset_position_id")
    log.info(f"  ✓ {count} minister appointments seeded")
    if any(skipped.values()):
        log.info(f"  ⚠  Skipped — {dict(skipped)}")


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    log.info("\n╔════════════════════════════════════════════════════╗")
    log.info("║   מצב האומה 2.0 — Initial seed from OData-v4     ║")
    log.info(f"║   {datetime.now().strftime('%Y-%m-%d %H:%M')}                              ║")
    log.info("╚════════════════════════════════════════════════════╝")

    sb = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

    # Steps 1–4 are independent
    knessets_map  = seed_knessets(sb)
    office_map, ministry_map = seed_offices(sb)
    people_map    = seed_people(sb)
    factions_map  = seed_knesset_factions(sb, knessets_map)

    # Steps 5–7 all consume KNS_PersonToPosition — fetch it once
    log.info("\n── Fetching KNS_PersonToPosition (large table, may take a while...)")
    positions_data = odata_fetch_all("KNS_PersonToPosition")
    log.info(f"  ✓ {len(positions_data)} total position records fetched")

    governments_map = seed_governments(sb, knessets_map, positions_data)
    seed_knesset_memberships(sb, positions_data, people_map,
                             knessets_map, factions_map)
    seed_minister_appointments(sb, positions_data, people_map,
                               governments_map, office_map, ministry_map)

    log.info("\n╔════════════════════════════════════════════════════╗")
    log.info("║   ✅  Seed complete                                ║")
    log.info("╚════════════════════════════════════════════════════╝")
    log.info("\n  Review required after seeding:")
    log.info("  1. knesset_memberships.is_coalition — all default False")
    log.info("  2. knesset_factions.party_id — manual link to global parties")
    log.info("  3. parties — still empty, fill in manually (name, color, logo)")
    log.info("")


if __name__ == "__main__":
    main()
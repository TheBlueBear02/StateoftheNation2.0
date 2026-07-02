"""
fix_faction_links_v3.py
=======================
Correctly links faction_id for all 120 current KMs using the
mk_individual.csv PersonID field as a bridge between oknesset's
internal mk_individual_id and our knesset_person_id (= KNS_Person.Id).

Run AFTER cleaning up duplicates with the provided SQL.
"""

import os
import io
import csv
import logging
import requests
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()
logging.basicConfig(level=logging.INFO, format="%(message)s")
log = logging.getLogger(__name__)

SUPABASE_URL         = os.environ["SUPABASE_URL"]
SUPABASE_SERVICE_KEY = os.environ["SUPABASE_SERVICE_KEY"]

BASE = "https://production.oknesset.org/pipelines/data/members/mk_individual"
CURRENT_KNESSET = 25


def fetch_csv(url):
    log.info(f"  Downloading {url.split('/')[-1]}...")
    r = requests.get(url, timeout=30)
    r.raise_for_status()
    return list(csv.DictReader(io.StringIO(r.text)))


def main():
    log.info("\n── Fix v3: linking faction_id using PersonID bridge")
    sb = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

    # Download both CSVs
    factions_csv    = fetch_csv(f"{BASE}/mk_individual_factions.csv")
    individuals_csv = fetch_csv(f"{BASE}/mk_individual.csv")

    log.info(f"  mk_individual.csv sample keys: {list(individuals_csv[0].keys())}")

    # Build bridge: mk_individual_id → PersonID (OData ID = our knesset_person_id)
    bridge = {}
    for r in individuals_csv:
        mk_id     = r.get("mk_individual_id", "").strip()
        person_id = r.get("PersonID", "").strip()
        if mk_id and person_id:
            bridge[mk_id] = person_id
    log.info(f"  Bridge built: {len(bridge)} mk_individual_id → PersonID mappings")

    # Current Knesset 25 active factions from CSV
    current = [
        r for r in factions_csv
        if r.get("knesset", "").strip() == str(CURRENT_KNESSET)
        and not r.get("finish_date", "").strip()
    ]
    log.info(f"  Active Knesset 25 rows in CSV: {len(current)}")

    # Load people map: knesset_person_id (OData PersonID) → people.id
    all_people, page = [], 0
    while True:
        result = sb.table("people").select("id, knesset_person_id") \
            .range(page * 1000, page * 1000 + 999).execute()
        if not result.data:
            break
        all_people.extend(result.data)
        page += 1
    people_map = {str(r["knesset_person_id"]): r["id"]
                  for r in all_people if r.get("knesset_person_id")}
    log.info(f"  People in DB: {len(people_map)}")

    # Load factions map: knesset_faction_id → knesset_factions.id
    factions_result = sb.table("knesset_factions").select("id, knesset_faction_id").execute()
    factions_map = {str(r["knesset_faction_id"]): r["id"]
                    for r in factions_result.data if r.get("knesset_faction_id")}

    # Load current memberships map: person_id → membership row id
    mem_result = sb.table("knesset_memberships") \
        .select("id, person_id") \
        .is_("end_date", "null") \
        .execute()
    memberships_map = {r["person_id"]: r["id"] for r in mem_result.data}
    log.info(f"  Current memberships in DB: {len(memberships_map)}")

    # Build updates using the bridge
    updates = []
    skipped = {"no_bridge": 0, "no_person": 0, "no_faction": 0, "no_membership": 0}

    for row in current:
        mk_id      = row.get("mk_individual_id", "").strip()
        faction_id = row.get("faction_id", "").strip()

        # Translate oknesset mk_individual_id → OData PersonID
        odata_person_id = bridge.get(mk_id)
        if not odata_person_id:
            skipped["no_bridge"] += 1
            continue

        # Look up our internal people.id using the OData PersonID
        person_id = people_map.get(odata_person_id)
        if not person_id:
            skipped["no_person"] += 1
            log.info(f"  ⚠  mk_id={mk_id} PersonID={odata_person_id} not in people table")
            continue

        db_faction_id = factions_map.get(faction_id)
        if not db_faction_id:
            skipped["no_faction"] += 1
            continue

        membership_id = memberships_map.get(person_id)
        if not membership_id:
            skipped["no_membership"] += 1
            log.info(f"  ⚠  person_id={person_id} (mk_id={mk_id}) has no current membership row")
            continue

        updates.append({"id": membership_id, "faction_id": db_faction_id})

    log.info(f"\n  Updates to apply: {len(updates)}")
    if any(skipped.values()):
        log.info(f"  Skipped: {skipped}")

    if not updates:
        log.info("  ✗ Nothing to update")
        return

    # Apply updates
    updated = 0
    for u in updates:
        sb.table("knesset_memberships") \
            .update({"faction_id": u["faction_id"]}) \
            .eq("id", u["id"]) \
            .execute()
        updated += 1

    log.info(f"  ✓ Updated {updated} rows")

    # Final check
    check = sb.table("knesset_memberships") \
        .select("id", count="exact") \
        .is_("end_date", "null") \
        .is_("faction_id", "null") \
        .execute()
    log.info(f"\n  Remaining nulls: {check.count}")
    if check.count == 0:
        log.info("  ✅ All current KMs have faction_id linked — ready to build the hemicycle!")


if __name__ == "__main__":
    main()
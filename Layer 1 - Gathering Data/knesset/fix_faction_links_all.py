import pandas as pd
from supabase import create_client

from dotenv import load_dotenv
import os
load_dotenv()

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_SERVICE_KEY = os.environ["SUPABASE_SERVICE_KEY"]

supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

# Load CSVs
factions_df = pd.read_csv("https://production.oknesset.org/pipelines/data/members/mk_individual/mk_individual_factions.csv")
members_df = pd.read_csv("https://production.oknesset.org/pipelines/data/members/mk_individual/mk_individual.csv")

# Join to get PersonID + faction_id + knesset in one table
merged = factions_df.merge(members_df[["mk_individual_id", "PersonID"]], on="mk_individual_id")
merged = merged.dropna(subset=["PersonID"])
merged["PersonID"] = merged["PersonID"].astype(int)

# Fetch lookup tables from DB (limit set above 1185 to avoid pagination cutoff)
people = supabase.table("people").select("id, knesset_person_id").limit(2000).execute().data
knessets = supabase.table("knessets").select("id, knesset_number").limit(100).execute().data
kf = supabase.table("knesset_factions").select("id, knesset_faction_id").limit(1000).execute().data

person_map = {p["knesset_person_id"]: p["id"] for p in people}
knesset_map = {k["knesset_number"]: k["id"] for k in knessets}
faction_map = {f["knesset_faction_id"]: f["id"] for f in kf}

updated = 0
skipped = 0

for _, row in merged.iterrows():
    person_id = person_map.get(row["PersonID"])
    knesset_id = knesset_map.get(int(row["knesset"]))
    faction_id = faction_map.get(int(row["faction_id"]))

    if not all([person_id, knesset_id, faction_id]):
        skipped += 1
        continue

    result = supabase.table("knesset_memberships").update(
        {"faction_id": faction_id}
    ).eq("person_id", person_id).eq("knesset_id", knesset_id).execute()

    if result.data:
        updated += len(result.data)
        print(f"✓ PersonID {row['PersonID']} | Knesset {int(row['knesset'])} | {row['faction_name']}")
    else:
        skipped += 1

print(f"\nDone. {updated} memberships updated, {skipped} skipped.")
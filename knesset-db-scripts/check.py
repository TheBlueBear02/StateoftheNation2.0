import pandas as pd
from supabase import create_client
from dotenv import load_dotenv
import os
load_dotenv()

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_SERVICE_KEY = os.environ["SUPABASE_SERVICE_KEY"]

supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

factions_df = pd.read_csv("https://production.oknesset.org/pipelines/data/members/mk_individual/mk_individual_factions.csv")
members_df = pd.read_csv("https://production.oknesset.org/pipelines/data/members/mk_individual/mk_individual.csv")

merged = factions_df.merge(members_df[["mk_individual_id", "PersonID", "mk_individual_name"]], on="mk_individual_id")
merged = merged.dropna(subset=["PersonID"])
merged["PersonID"] = merged["PersonID"].astype(int)

people = supabase.table("people").select("knesset_person_id").execute().data
person_ids_in_db = {p["knesset_person_id"] for p in people}

unmatched = merged[~merged["PersonID"].isin(person_ids_in_db)].drop_duplicates(subset=["PersonID"])
print(f"People in oknesset CSV missing from people table: {len(unmatched)}")
print(unmatched[["mk_individual_name", "PersonID"]].to_string())
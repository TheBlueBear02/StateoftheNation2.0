import os
import urllib.parse
from supabase import create_client

from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_SERVICE_KEY = os.environ["SUPABASE_SERVICE_KEY"]

# Path to the folder on your machine
IMAGES_ROOT = "public\images\KM Images\הכנסת ה25"

# Base GitHub raw URL
GITHUB_BASE = "https://raw.githubusercontent.com/TheBlueBear02/StateoftheNation2.0/main/public/images/KM%20Images/%D7%94%D7%9B%D7%A0%D7%A1%D7%AA%20%D7%9425"

supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

matched = []
unmatched = []

for party_folder in os.listdir(IMAGES_ROOT):
    party_path = os.path.join(IMAGES_ROOT, party_folder)
    if not os.path.isdir(party_path):
        continue

    for filename in os.listdir(party_path):
        if not filename.endswith(".jpeg"):
            continue

        full_name = filename.replace(".jpeg", "")
        encoded_party = urllib.parse.quote(party_folder)
        encoded_name = urllib.parse.quote(filename)
        image_url = f"{GITHUB_BASE}/{encoded_party}/{encoded_name}"

        result = supabase.table("people").update({"image_url": image_url}).eq("full_name", full_name).execute()

        if result.data:
            matched.append(full_name)
            print(f"✓ {full_name}")
        else:
            unmatched.append(full_name)
            print(f"✗ NO MATCH: {full_name}")

print(f"\nDone. {len(matched)} updated, {len(unmatched)} unmatched.")
if unmatched:
    print("Unmatched:", unmatched)
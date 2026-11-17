import os
import sys
import urllib.parse
from pathlib import Path

from dotenv import load_dotenv
from supabase import create_client

from current_knesset import database_active_knesset_number
from knesset_term import knesset_image_folder_candidates
from manual_overrides import PERSON_MANUAL_COLUMN, apply_static_mk_image, column_ready

load_dotenv()

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_SERVICE_KEY = os.environ["SUPABASE_SERVICE_KEY"]

PROJECT_ROOT = Path(__file__).resolve().parents[2]
IMAGES_PARENT = PROJECT_ROOT / "public" / "images" / "KM Images"
GITHUB_RAW_ROOT = (
    "https://raw.githubusercontent.com/TheBlueBear02/StateoftheNation2.0/main"
)

supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
knesset_number = database_active_knesset_number(supabase)
if knesset_number is None:
    sys.exit("No active knesset — cannot choose an image folder")

IMAGES_ROOT = None
for folder_name in knesset_image_folder_candidates(knesset_number):
    candidate = IMAGES_PARENT / folder_name
    if candidate.is_dir():
        IMAGES_ROOT = candidate
        break
if IMAGES_ROOT is None:
    expected = ", ".join(knesset_image_folder_candidates(knesset_number))
    sys.exit(f"Image folder not found for Knesset {knesset_number}: {expected}")

GITHUB_BASE = (
    f"{GITHUB_RAW_ROOT}/"
    + urllib.parse.quote("public/images/KM Images")
    + "/"
    + urllib.parse.quote(IMAGES_ROOT.name)
)

matched = []
unmatched = []
manual_images = column_ready(supabase, "people", PERSON_MANUAL_COLUMN)

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

        if apply_static_mk_image(
            supabase,
            full_name,
            image_url,
            manual_column_ready=manual_images,
        ):
            matched.append(full_name)
            print(f"✓ {full_name}")
        else:
            unmatched.append(full_name)
            print(f"✗ NO MATCH: {full_name}")

print(f"\nDone. {len(matched)} updated, {len(unmatched)} unmatched.")
if unmatched:
    print("Unmatched:", unmatched)
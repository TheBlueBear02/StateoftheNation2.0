#!/usr/bin/env python3
"""
geocode_cities.py  — Pipeline Stage 4
======================================
Geocodes election_candidates.city → latitude + longitude
using Nominatim (OpenStreetMap) via the geopy library.

No API key required. Rate-limited to 1 request/second
per Nominatim's usage policy. City results are cached
in memory so duplicate cities only hit the API once.

Usage:
  python geocode_cities.py           # geocode all candidates with missing coords
  python geocode_cities.py --dry-run # print results, no DB writes

Requirements:
  pip install geopy supabase python-dotenv
"""

import os
import time
import logging
import argparse

from geopy.geocoders import Nominatim
from geopy.extra.rate_limiter import RateLimiter
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger(__name__)


def get_supabase() -> Client:
    return create_client(
        os.environ["SUPABASE_URL"],
        os.environ["SUPABASE_SERVICE_KEY"],
    )


def get_geocoder() -> RateLimiter:
    """
    Nominatim requires a unique user_agent string per app.
    RateLimiter enforces 1 req/sec automatically.
    """
    geolocator = Nominatim(user_agent="matzav-hauma-pipeline/1.0")
    return RateLimiter(
        geolocator.geocode,
        min_delay_seconds=1.1,   # slightly above 1s to be safe
        max_retries=3,
        error_wait_seconds=5.0,
    )


def get_election_id(sb: Client, year: int = 2026) -> int:
    rows = sb.table("elections").select("id").eq("year", year).execute().data
    return rows[0]["id"]


# ── Geocoding ─────────────────────────────────────────────────────────────────

def geocode_city(geocode: RateLimiter, city: str) -> tuple[float, float] | None:
    """
    Geocode a Hebrew city name, constrained to Israel.
    Returns (latitude, longitude) or None if not found.

    Strategy:
      1. Try with country_codes="il" (fastest, most accurate for Israeli cities)
      2. If no result, try appending "ישראל" to disambiguate
    """
    try:
        location = geocode(city, country_codes="il", language="he")
        if location:
            return location.latitude, location.longitude

        # Fallback: append ישראל explicitly
        location = geocode(f"{city}, ישראל", language="he")
        if location:
            return location.latitude, location.longitude

    except Exception as exc:
        log.warning("  Geocode error for '%s': %s", city, exc)

    return None


# ── Main ──────────────────────────────────────────────────────────────────────

def run(sb: Client, dry_run: bool) -> None:
    election_id = get_election_id(sb)

    # Load candidates with city but no coordinates
    rows = (
        sb.table("election_candidates")
        .select("id, city, latitude, longitude")
        .eq("election_id", election_id)
        .not_.is_("city", "null")
        .is_("latitude", "null")
        .execute()
        .data
    )

    if not rows:
        log.info("No candidates need geocoding.")
        return

    log.info("Geocoding %d candidates (Nominatim, 1 req/sec)…", len(rows))

    geocode = get_geocoder()

    # Cache results — same city only hits Nominatim once
    cache: dict[str, tuple | None] = {}
    success = failed = 0

    for ec in rows:
        city = ec["city"]
        if not city:
            continue

        if city not in cache:
            result = geocode_city(geocode, city)
            cache[city] = result
            log.info(
                "  %-20s → %s",
                city,
                f"{result[0]:.5f}, {result[1]:.5f}" if result else "NOT FOUND",
            )
        else:
            result = cache[city]
            log.info("  %-20s → cached", city)

        if result:
            lat, lng = result
            if not dry_run:
                sb.table("election_candidates").update({
                    "latitude":  lat,
                    "longitude": lng,
                }).eq("id", ec["id"]).execute()
            success += 1
        else:
            failed += 1

    log.info(
        "Done — geocoded: %d · not found: %d · unique cities queried: %d",
        success, failed, len(cache),
    )


def main():
    parser = argparse.ArgumentParser(description="Stage 4 — geocode candidate cities")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    sb = get_supabase()
    run(sb, args.dry_run)


if __name__ == "__main__":
    main()
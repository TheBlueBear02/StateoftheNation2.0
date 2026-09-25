#!/usr/bin/env python3
"""
seed_office_dashboard.py — Migrate curated office KPI/policy data from the old
Flask sn.db into Supabase ``offices`` / ``indexes`` / ``index_data``.

Idempotent: re-running updates office curated fields, upserts indexes by
(office_id, name), and upserts index_data by (index_id, recorded_at).

Source DB: ``office_dashboard_source.db`` (copy of old instance/sn.db).
Only offices with is_shown=1 in the source are migrated (ids 2,3,4,5).

Requires SUPABASE_URL + SUPABASE_SERVICE_KEY in env / .env.
"""

from __future__ import annotations

import argparse
import logging
import os
import re
import sqlite3
import sys
from calendar import monthrange
from datetime import date, datetime, timezone
from pathlib import Path

from dotenv import load_dotenv
from supabase import Client, create_client

# Layer 1 root (parent of knesset/)
LAYER1 = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(LAYER1))
from record_pipeline_run import record_pipeline_run  # noqa: E402

load_dotenv(LAYER1.parent / ".env")
load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger(__name__)

SOURCE_DB = Path(__file__).resolve().parent / "office_dashboard_source.db"
PIPELINE_NAME = "office-dashboard"

# Old desired display order: transport, national security, finance, education
DISPLAY_ORDER_OLD_IDS = [3, 2, 5, 4]

# Fallback when fuzzy name match fails (old name → substring to find in new offices)
OFFICE_NAME_FALLBACKS: dict[str, list[str]] = {
    "המשרד לביטחון לאומי": ["ביטחון לאומי", "בטחון לאומי"],
    "משרד התחבורה והבטיחות בדרכים": ["תחבורה"],
    "משרד החינוך": ["חינוך"],
    "משרד האוצר": ["אוצר"],
}

VALID_CHART_TYPES = {"line", "bar", "pie"}


def get_supabase() -> Client:
    return create_client(
        os.environ["SUPABASE_URL"],
        os.environ["SUPABASE_SERVICE_KEY"],
    )


def normalize_chart_type(raw: str | None) -> str:
    if raw and raw.strip().lower() in VALID_CHART_TYPES:
        return raw.strip().lower()
    return "line"


def normalize_icon_path(raw: str | None) -> str | None:
    """Map old Flask ``static\\images\\offices\\...`` paths to public URLs."""
    text = (raw or "").strip()
    if not text:
        return None
    path = text.replace("\\", "/")
    if path.startswith("static/images/"):
        return "/" + path[len("static/") :]
    if path.startswith("/static/images/"):
        return path.replace("/static/", "/", 1)
    if path.startswith("/images/"):
        return path
    if path.startswith("images/"):
        return "/" + path
    return None


def parse_label_to_date(label: str) -> date | None:
    """Convert old labels (DD.MM.YYYY / DD.MM.YY / YYYY) to a date for recorded_at."""
    text = (label or "").strip()
    if not text:
        return None

    # YYYY only
    if re.fullmatch(r"\d{4}", text):
        return date(int(text), 1, 1)

    # D.M.YYYY or DD.MM.YYYY
    m = re.fullmatch(r"(\d{1,2})\.(\d{1,2})\.(\d{4})", text)
    if m:
        day, month, year = int(m.group(1)), int(m.group(2)), int(m.group(3))
        try:
            return date(year, month, day)
        except ValueError:
            # Clamp to month end if day overflows
            last = monthrange(year, month)[1]
            return date(year, month, min(day, last))

    return None


def hebrew_display_label(label: str, recorded: date | None) -> str:
    """Keep original label when useful; otherwise format from recorded_at."""
    text = (label or "").strip()
    if text:
        return text
    if recorded:
        return recorded.isoformat()
    return ""


def parse_value(raw) -> float:
    if raw is None:
        return 0.0
    s = str(raw).replace(",", "").replace("%", "").strip()
    if s in ("", "-"):
        return 0.0
    try:
        return float(s)
    except ValueError:
        return 0.0


def load_source() -> tuple[list[dict], list[dict], list[dict]]:
    if not SOURCE_DB.exists():
        raise FileNotFoundError(f"Source DB not found: {SOURCE_DB}")

    conn = sqlite3.connect(SOURCE_DB)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()

    offices = [
        dict(r)
        for r in cur.execute(
            "SELECT id, name, info, is_shown FROM offices WHERE is_shown = 1"
        )
    ]
    office_ids = [o["id"] for o in offices]
    if not office_ids:
        conn.close()
        return [], [], []

    placeholders = ",".join("?" * len(office_ids))
    indexes = [
        dict(r)
        for r in cur.execute(
            f"SELECT id, name, info, icon, office_id, is_kpi, alert, chart_type, "
            f"source, is_shown FROM indexes WHERE office_id IN ({placeholders})",
            office_ids,
        )
    ]
    index_ids = [i["id"] for i in indexes]
    data_rows: list[dict] = []
    if index_ids:
        iph = ",".join("?" * len(index_ids))
        data_rows = [
            dict(r)
            for r in cur.execute(
                f"SELECT id, index_id, label, value FROM indexes_data "
                f"WHERE index_id IN ({iph})",
                index_ids,
            )
        ]
    conn.close()
    return offices, indexes, data_rows


def run(sb: Client, dry_run: bool = False) -> dict:
    started = datetime.now(timezone.utc)
    offices, indexes, data_rows = load_source()
    log.info(
        "Source: %d shown offices, %d indexes, %d data points",
        len(offices),
        len(indexes),
        len(data_rows),
    )

    # Sort offices into curated display order
    order_rank = {oid: i for i, oid in enumerate(DISPLAY_ORDER_OLD_IDS)}
    offices.sort(key=lambda o: order_rank.get(o["id"], 99))

    office_map: dict[int, int] = {}  # old_id → new_id
    offices_updated = 0

    # Fetch once; match_office queries repeatedly otherwise
    all_office_rows = (
        sb.table("offices")
        .select("id, name, knesset_category_name, info, is_shown")
        .execute()
        .data
        or []
    )

    def match_cached(old_name: str) -> dict | None:
        def score(row: dict) -> int:
            name = (row.get("name") or "").strip()
            cat = (row.get("knesset_category_name") or "").strip()
            if name == old_name or cat == old_name:
                return 100
            for needle in OFFICE_NAME_FALLBACKS.get(old_name, []):
                if needle in name or needle in cat:
                    return 50
            return 0

        best = None
        best_score = 0
        for row in all_office_rows:
            s = score(row)
            if s > best_score:
                best = row
                best_score = s
        return best if best_score > 0 else None

    for office in offices:
        old_id = office["id"]
        old_name = office["name"]
        matched = match_cached(old_name)
        if not matched:
            log.error("No Supabase office match for %r — skipping", old_name)
            continue

        new_id = matched["id"]
        office_map[old_id] = new_id
        payload = {
            "is_shown": True,
            "info": office.get("info") or matched.get("info"),
        }
        log.info(
            "Office %r (old=%d) → supabase id=%d  display_rank=%s",
            old_name,
            old_id,
            new_id,
            order_rank.get(old_id, "?"),
        )
        if dry_run:
            continue
        sb.table("offices").update(payload).eq("id", new_id).execute()
        offices_updated += 1

    # Clear is_shown on other offices so dashboard shows exactly the curated set
    if not dry_run and office_map:
        shown_ids = list(office_map.values())
        all_offices = sb.table("offices").select("id, is_shown").execute().data or []
        for row in all_offices:
            if row["id"] not in shown_ids and row.get("is_shown"):
                sb.table("offices").update({"is_shown": False}).eq("id", row["id"]).execute()
                log.info("Cleared is_shown on office id=%d", row["id"])

    # Index upsert by (office_id, name)
    index_map: dict[int, int] = {}  # old index id → new index id
    indexes_upserted = 0

    for idx in indexes:
        old_office_id = idx["office_id"]
        new_office_id = office_map.get(old_office_id)
        if not new_office_id:
            continue

        name = idx["name"]
        existing = (
            sb.table("indexes")
            .select("id")
            .eq("office_id", new_office_id)
            .eq("name", name)
            .limit(1)
            .execute()
            .data
        )

        row = {
            "office_id": new_office_id,
            "name": name,
            "info": idx.get("info"),
            "icon": normalize_icon_path(idx.get("icon")),
            "is_kpi": bool(idx.get("is_kpi")),
            "alert": bool(idx.get("alert")),
            # Source sn.db has no polarity; alert metrics default to lower-is-better.
            "higher_is_better": (
                bool(idx["higher_is_better"])
                if idx.get("higher_is_better") is not None
                else (not bool(idx.get("alert")))
            ),
            "chart_type": normalize_chart_type(idx.get("chart_type")),
            "source": (idx.get("source") or None) or None,
            "is_shown": True if idx.get("is_shown") is None else bool(idx.get("is_shown")),
        }

        if dry_run:
            log.info(
                "[dry-run] index %r office=%d kpi=%s alert=%s higher_is_better=%s chart=%s",
                name,
                new_office_id,
                row["is_kpi"],
                row["alert"],
                row["higher_is_better"],
                row["chart_type"],
            )
            continue

        if existing:
            new_index_id = existing[0]["id"]
            sb.table("indexes").update(row).eq("id", new_index_id).execute()
        else:
            inserted = sb.table("indexes").insert(row).execute().data
            if not inserted:
                log.error("Failed to insert index %r", name)
                continue
            new_index_id = inserted[0]["id"]

        index_map[idx["id"]] = new_index_id
        indexes_upserted += 1

    # index_data upsert
    data_by_old_index: dict[int, list[dict]] = {}
    for d in data_rows:
        data_by_old_index.setdefault(d["index_id"], []).append(d)

    data_upserted = 0
    data_skipped = 0

    for old_index_id, points in data_by_old_index.items():
        new_index_id = index_map.get(old_index_id)
        if not new_index_id:
            continue

        batch: list[dict] = []
        seen_dates: set[str] = set()
        for point in points:
            recorded = parse_label_to_date(point["label"])
            if not recorded:
                data_skipped += 1
                continue
            key = recorded.isoformat()
            if key in seen_dates:
                continue
            seen_dates.add(key)
            batch.append(
                {
                    "index_id": new_index_id,
                    "label": hebrew_display_label(point["label"], recorded),
                    "value": parse_value(point["value"]),
                    "recorded_at": key,
                }
            )

        if dry_run:
            log.info(
                "[dry-run] index_data old_index=%d → %d points",
                old_index_id,
                len(batch),
            )
            data_upserted += len(batch)
            continue

        # Upsert in chunks
        CHUNK = 200
        for i in range(0, len(batch), CHUNK):
            chunk = batch[i : i + CHUNK]
            sb.table("index_data").upsert(
                chunk, on_conflict="index_id,recorded_at"
            ).execute()
            data_upserted += len(chunk)

    summary = {
        "offices_mapped": len(office_map),
        "offices_updated": offices_updated,
        "indexes_upserted": indexes_upserted,
        "index_data_upserted": data_upserted,
        "index_data_skipped": data_skipped,
        "office_map": {str(k): v for k, v in office_map.items()},
        "display_order_old_ids": DISPLAY_ORDER_OLD_IDS,
    }
    log.info("Done: %s", summary)

    if not dry_run:
        record_pipeline_run(
            sb,
            pipeline=PIPELINE_NAME,
            action="seed",
            status="success" if office_map else "warning",
            message=(
                f"Seeded {len(office_map)} offices, {indexes_upserted} indexes, "
                f"{data_upserted} data points"
            ),
            summary=summary,
            source="cli",
            started_at=started,
            finished_at=datetime.now(timezone.utc),
        )

    return summary


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Seed office dashboard KPI/policy data into Supabase"
    )
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    run(get_supabase(), dry_run=args.dry_run)


if __name__ == "__main__":
    main()

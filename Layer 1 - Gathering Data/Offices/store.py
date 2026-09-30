"""Data access: Supabase (production) and the repo's SQLite snapshot (offline).

The offline store reads ``knesset/office_dashboard_source.db`` so the planner and
adapters can be exercised locally without credentials. It never writes anywhere.
"""

from __future__ import annotations

import logging
import os
import sqlite3
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any, Protocol

from models import Candidate
from periods import parse_site_label
from planner import CheckState
from registry import Entry

log = logging.getLogger(__name__)

SOURCE_DB = Path(__file__).resolve().parent.parent / "knesset" / "office_dashboard_source.db"
PAGE = 1000

# Registry office names → substrings to find the matching Supabase office row
# (same fallbacks as seed_office_dashboard.py).
OFFICE_NEEDLES: dict[str, list[str]] = {
    "המשרד לביטחון לאומי": ["ביטחון לאומי", "בטחון לאומי"],
    "משרד התחבורה והבטיחות בדרכים": ["תחבורה"],
    "משרד החינוך": ["חינוך"],
    "משרד האוצר": ["אוצר"],
}


def clean_number(raw: Any) -> float | None:
    if raw is None:
        return None
    if isinstance(raw, (int, float)):
        return float(raw)
    s = str(raw).replace(",", "").replace("%", "").strip()
    try:
        return float(s)
    except ValueError:
        return None


class Store(Protocol):
    writable: bool

    def resolve(self, entries: list[Entry]) -> dict[int, int]: ...
    def history(self, index_ids: list[int]) -> dict[int, list[tuple[date, float]]]: ...
    def staged_latest(self, index_ids: list[int]) -> dict[int, date]: ...
    def staged_periods(self, index_ids: list[int]) -> dict[int, set[date]]: ...
    def check_states(self, index_ids: list[int]) -> dict[tuple[int, date], CheckState]: ...
    def save_candidates(self, cands: list[Candidate]) -> None: ...
    def save_check_states(self, rows: list[dict]) -> None: ...


# ── Supabase ─────────────────────────────────────────────────────────────────


class SupabaseStore:
    writable = True

    def __init__(self) -> None:
        from supabase import create_client

        self.sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_KEY"])

    def _all(self, query_factory) -> list[dict]:
        rows: list[dict] = []
        start = 0
        while True:
            batch = query_factory().range(start, start + PAGE - 1).execute().data or []
            rows.extend(batch)
            if len(batch) < PAGE:
                return rows
            start += PAGE

    def resolve(self, entries: list[Entry]) -> dict[int, int]:
        offices = (
            self.sb.table("offices")
            .select("id, name, knesset_category_name")
            .eq("is_shown", True)
            .execute()
            .data
            or []
        )
        office_ids = [o["id"] for o in offices]
        indexes = self._all(
            lambda: self.sb.table("indexes").select("id, name, office_id").in_("office_id", office_ids)
        )
        out: dict[int, int] = {}
        for e in entries:
            needles = [e.office] + OFFICE_NEEDLES.get(e.office, [])
            office = next(
                (
                    o
                    for o in offices
                    if any(n in (o.get("name") or "") or n in (o.get("knesset_category_name") or "")
                           for n in needles)
                ),
                None,
            )
            if not office:
                log.warning("unresolved office for key=%s (%s)", e.key, e.office)
                continue
            match = [i for i in indexes if i["office_id"] == office["id"] and i["name"] == e.name]
            if len(match) == 1:
                out[e.key] = match[0]["id"]
            else:
                log.warning("key=%s %r: %d index matches in office %s", e.key, e.name, len(match), office["id"])
        return out

    def history(self, index_ids: list[int]) -> dict[int, list[tuple[date, float]]]:
        rows = self._all(
            lambda: self.sb.table("index_data")
            .select("index_id, recorded_at, label, value")
            .in_("index_id", index_ids)
            .order("recorded_at")
            .order("id")
        )
        # Prefer label → period when the site label is parseable, so a hand-entered
        # row with recorded_at=today / label=2025 doesn't look like a future year
        # and collide with a later canonical 2025-01-01 upsert.
        best: dict[int, dict[date, tuple[date, float]]] = {i: {} for i in index_ids}
        for r in rows:
            v = clean_number(r["value"])
            if v is None or not r.get("recorded_at"):
                continue
            recorded = date.fromisoformat(r["recorded_at"][:10])
            period = parse_site_label(r.get("label") or "") or recorded
            prev = best[r["index_id"]].get(period)
            # Prefer the row whose recorded_at already matches the canonical period.
            if prev is None or (recorded == period and prev[0] != period):
                best[r["index_id"]][period] = (recorded, v)
        return {
            i: [(p, v) for p, (_r, v) in sorted(periods.items())]
            for i, periods in best.items()
        }

    def staged_latest(self, index_ids: list[int]) -> dict[int, date]:
        periods = self.staged_periods(index_ids)
        return {i: max(dates) for i, dates in periods.items() if dates}

    def staged_periods(self, index_ids: list[int]) -> dict[int, set[date]]:
        rows = self._all(
            lambda: self.sb.table("index_data_candidates")
            .select("index_id, recorded_at")
            .in_("index_id", index_ids)
            .in_("status", ["pending", "approved", "published"])
        )
        out: dict[int, set[date]] = {i: set() for i in index_ids}
        for r in rows:
            d = date.fromisoformat(r["recorded_at"][:10])
            out.setdefault(r["index_id"], set()).add(d)
        return out

    def check_states(self, index_ids: list[int]) -> dict[tuple[int, date], CheckState]:
        rows = self._all(
            lambda: self.sb.table("kpi_check_state").select("*").in_("index_id", index_ids)
        )
        out = {}
        for r in rows:
            target = date.fromisoformat(r["target_period"])
            ts = r.get("last_checked_at")
            out[(r["index_id"], target)] = CheckState(
                target_period=target,
                last_checked_at=datetime.fromisoformat(ts) if ts else None,
                attempts=r.get("attempts") or 0,
                status=r.get("status") or "waiting",
            )
        return out

    def save_candidates(self, cands: list[Candidate]) -> None:
        for c in cands:
            if c.rejected or c.kind == "same":
                continue
            row = {
                "index_id": c.index_id,
                "recorded_at": c.recorded_at.isoformat(),
                "label": c.label,
                "value": c.obs.value,
                "raw_value": c.obs.raw_value,
                "method": c.obs.method,
                "confidence": c.obs.confidence,
                "source_url": c.obs.source_url,
                "document_id": (c.obs.evidence or {}).get("document_id"),
                "evidence": c.obs.evidence,
                "validation": {"flags": c.flags},
                "kind": c.kind,
                "previous_value": c.previous_value,
                "status": c.status,
            }
            saved = (
                self.sb.table("index_data_candidates")
                .upsert(row, on_conflict="index_id,recorded_at,value,method")
                .execute()
                .data
            )
            if c.auto_publish:
                self.sb.table("index_data").upsert(
                    {
                        "index_id": c.index_id,
                        "recorded_at": c.recorded_at.isoformat(),
                        "label": c.label,
                        "value": c.obs.value,
                    },
                    on_conflict="index_id,recorded_at",
                ).execute()
                # Drop same-label orphans with a non-canonical recorded_at
                # (e.g. manual "2025" entered as recorded_at=today).
                (
                    self.sb.table("index_data")
                    .delete()
                    .eq("index_id", c.index_id)
                    .eq("label", c.label)
                    .neq("recorded_at", c.recorded_at.isoformat())
                    .execute()
                )
                # A newer published value supersedes older pending rows for the same point.
                cand_id = (saved or [{}])[0].get("id")
                q = (
                    self.sb.table("index_data_candidates")
                    .update({"status": "superseded"})
                    .eq("index_id", c.index_id)
                    .eq("recorded_at", c.recorded_at.isoformat())
                    .eq("status", "pending")
                )
                if cand_id:
                    q = q.neq("id", cand_id)
                q.execute()

    def save_check_states(self, rows: list[dict]) -> None:
        if rows:
            self.sb.table("kpi_check_state").upsert(rows, on_conflict="index_id,target_period").execute()

    def save_document(self, doc) -> int | None:
        """Upsert kpi_documents by sha256; best-effort upload to Storage bucket kpi-sources."""
        from doc_cache import storage_object_name

        storage_path = None
        try:
            bucket = self.sb.storage.from_("kpi-sources")
            object_name = storage_object_name(doc)
            data = doc.path.read_bytes()
            try:
                bucket.upload(
                    object_name,
                    data,
                    {"content-type": doc.content_type or "application/octet-stream", "upsert": "true"},
                )
            except TypeError:
                # Older supabase-py: upsert via file_options differently
                bucket.upload(object_name, data)
            storage_path = object_name
        except Exception as exc:  # noqa: BLE001
            log.warning("kpi-sources upload skipped: %s", exc)

        row = {
            "doc_key": doc.doc_key,
            "url": doc.url,
            "sha256": doc.sha256,
            "storage_path": storage_path,
            "edition": doc.edition,
            "parse_status": "new",
        }
        existing = (
            self.sb.table("kpi_documents").select("id").eq("sha256", doc.sha256).limit(1).execute().data
            or []
        )
        if existing:
            self.sb.table("kpi_documents").update(row).eq("id", existing[0]["id"]).execute()
            return int(existing[0]["id"])
        saved = self.sb.table("kpi_documents").insert(row).execute().data or []
        return int(saved[0]["id"]) if saved else None


# ── Offline (SQLite snapshot) ────────────────────────────────────────────────


class OfflineStore:
    """Read-only store over the repo snapshot. Index ids == registry keys."""

    writable = False

    def __init__(self, path: Path = SOURCE_DB) -> None:
        self.conn = sqlite3.connect(path)
        self.saved: list[Candidate] = []
        self.states: list[dict] = []

    def resolve(self, entries: list[Entry]) -> dict[int, int]:
        names = dict(self.conn.execute("select id, name from indexes"))
        out = {}
        for e in entries:
            if names.get(e.key) == e.name:
                out[e.key] = e.key
            else:
                log.warning("offline: key=%s name mismatch (%r vs %r)", e.key, names.get(e.key), e.name)
        return out

    def history(self, index_ids: list[int]) -> dict[int, list[tuple[date, float]]]:
        out: dict[int, list[tuple[date, float]]] = {i: [] for i in index_ids}
        for index_id, label, value in self.conn.execute(
            "select index_id, label, value from indexes_data"
        ):
            if index_id not in out:
                continue
            d, v = parse_site_label(label), clean_number(value)
            if d and v is not None:
                out[index_id].append((d, v))
        for pts in out.values():
            pts.sort()
        return out

    def staged_latest(self, index_ids: list[int]) -> dict[int, date]:
        return {}

    def staged_periods(self, index_ids: list[int]) -> dict[int, set[date]]:
        return {i: set() for i in index_ids}

    def check_states(self, index_ids: list[int]) -> dict[tuple[int, date], CheckState]:
        return {}

    def save_candidates(self, cands: list[Candidate]) -> None:
        self.saved.extend(cands)

    def save_check_states(self, rows: list[dict]) -> None:
        self.states.extend(rows)


def now_utc() -> datetime:
    return datetime.now(timezone.utc)

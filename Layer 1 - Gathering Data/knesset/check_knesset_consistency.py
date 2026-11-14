#!/usr/bin/env python3
"""Fail loudly when the synced Knesset data does not match the current term.

Checks (recorded in pipeline_runs, action=consistency-check):
  - OData IsCurrent Knesset != knessets.is_active
  - current-Knesset memberships with null faction_id
  - OData current committees missing from knesset_committees
  - committees marked current, or last synced, for a non-current Knesset

Exit 0 when every check passes. Exit 1 on any issue or on a lookup failure.
Provisional election-list faction links are reported but are not a failure.
"""

from __future__ import annotations

import logging
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

from current_knesset import (
    database_active_knesset_number,
    odata_current_knesset_number,
)
from knesset_term import ConsistencyFacts, evaluate_consistency
from load_all_knesset_data import get_supabase
from odata_client import fetch_odata
from provisional_factions import provisional_column_ready

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from record_pipeline_run import record_pipeline_run  # noqa: E402

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger(__name__)


def _knesset_id(sb, knesset_number: int | None) -> int | None:
    if knesset_number is None:
        return None
    rows = (
        sb.table("knessets")
        .select("id")
        .eq("knesset_number", knesset_number)
        .limit(1)
        .execute()
        .data
        or []
    )
    if not rows:
        return None
    return int(rows[0]["id"])


def _count(sb, table: str, build) -> int:
    query = build(sb.table(table).select("id", count="exact")).limit(1)
    result = query.execute()
    if result.count is not None:
        return int(result.count)
    return len(result.data or [])


def _fetch_all(sb, table: str, columns: str, build) -> list[dict]:
    rows: list[dict] = []
    page_size = 1000
    offset = 0
    while True:
        query = build(sb.table(table).select(columns))
        batch = query.range(offset, offset + page_size - 1).execute().data or []
        rows.extend(batch)
        if len(batch) < page_size:
            break
        offset += page_size
    return rows


def _committee_ids_for_knesset(sb, knesset_id: int | None) -> frozenset[int]:
    if knesset_id is None:
        return frozenset()
    rows = _fetch_all(
        sb,
        "knesset_committees",
        "knesset_committee_id",
        lambda query: query.eq("knesset_id", knesset_id),
    )
    return frozenset(
        int(row["knesset_committee_id"])
        for row in rows
        if row.get("knesset_committee_id") is not None
    )


def _committees_marked_current(sb) -> frozenset[int]:
    rows = _fetch_all(
        sb,
        "knesset_committees",
        "knesset_id, knesset:knessets(knesset_number)",
        lambda query: query.eq("is_current", True),
    )
    numbers: set[int] = set()
    for row in rows:
        knesset = row.get("knesset")
        if isinstance(knesset, list):
            knesset = knesset[0] if knesset else None
        if isinstance(knesset, dict) and knesset.get("knesset_number") is not None:
            numbers.add(int(knesset["knesset_number"]))
    return frozenset(numbers)


def _last_committees_sync_knesset(sb) -> int | None:
    rows = (
        sb.table("pipeline_runs")
        .select("summary")
        .eq("pipeline", "knesset-committees")
        .order("finished_at", desc=True)
        .limit(1)
        .execute()
        .data
        or []
    )
    if not rows:
        return None
    summary = rows[0].get("summary") or {}
    if not isinstance(summary, dict):
        return None
    raw = summary.get("knesset_num")
    if raw is None:
        return None
    try:
        return int(raw)
    except (TypeError, ValueError):
        return None


def _odata_current_committee_ids(knesset_number: int) -> frozenset[int]:
    rows = fetch_odata("KNS_Committee", f"KnessetNum eq {knesset_number}")
    ids: set[int] = set()
    for row in rows:
        if not row.get("IsCurrent"):
            continue
        committee_id = row.get("CommitteeID")
        if committee_id is None:
            continue
        ids.add(int(committee_id))
    return frozenset(ids)


def load_facts(sb) -> ConsistencyFacts:
    lookup_ok = True
    odata_number = None
    try:
        odata_number = odata_current_knesset_number()
    except Exception as exc:
        lookup_ok = False
        log.error("OData current-Knesset lookup failed: %s", exc)

    db_number = database_active_knesset_number(sb)
    target_number = odata_number if odata_number is not None else db_number
    target_id = _knesset_id(sb, target_number)
    column_ready = provisional_column_ready(sb)

    null_factions = 0
    provisional_factions = 0
    if target_id is not None:
        null_factions = _count(
            sb,
            "knesset_memberships",
            lambda query: query.eq("knesset_id", target_id).is_("faction_id", "null"),
        )
        if column_ready:
            provisional_factions = _count(
                sb,
                "knesset_memberships",
                lambda query: query.eq("knesset_id", target_id).eq(
                    "faction_id_provisional", True
                ),
            )

    committee_ids: frozenset[int] | None
    if odata_number is None:
        committee_ids = frozenset()
    else:
        try:
            committee_ids = _odata_current_committee_ids(odata_number)
        except Exception as exc:
            log.error("OData current-committee lookup failed: %s", exc)
            committee_ids = None

    return ConsistencyFacts(
        odata_knesset_lookup_ok=lookup_ok,
        odata_current_knesset=odata_number,
        db_active_knesset=db_number,
        null_faction_memberships=null_factions,
        provisional_faction_memberships=provisional_factions,
        odata_current_committee_ids=committee_ids,
        db_committee_ids_for_current=_committee_ids_for_knesset(sb, target_id),
        committees_marked_current_on_knessets=_committees_marked_current(sb),
        last_committees_sync_knesset=_last_committees_sync_knesset(sb),
        provisional_column_ready=column_ready,
    )


def main() -> None:
    started = datetime.now(timezone.utc)
    sb = get_supabase()
    source = os.environ.get("PIPELINE_RUN_SOURCE", "cli")
    try:
        report = evaluate_consistency(load_facts(sb))
    except Exception as exc:
        log.exception("Knesset consistency check failed: %s", exc)
        record_pipeline_run(
            sb,
            pipeline="knesset",
            action="consistency-check",
            status="error",
            message="Knesset consistency check crashed",
            error=str(exc),
            source=source,
            started_at=started,
        )
        sys.exit(1)

    issues = report["issues"]
    if issues:
        for issue in issues:
            log.error("CONSISTENCY %s — %s", issue["code"], issue["message"])
        message = "Knesset consistency failed: " + "; ".join(
            issue["code"] for issue in issues
        )
        error = "\n".join(issue["message"] for issue in issues)
        status = "warning"
        exit_code = 1
    else:
        message = (
            "Knesset consistency ok "
            f"(Knesset {report['current_knesset']}, "
            f"provisional faction links: {report['provisional_faction_memberships']})"
        )
        error = None
        status = "success"
        exit_code = 0
        log.info(message)

    record_pipeline_run(
        sb,
        pipeline="knesset",
        action="consistency-check",
        status=status,
        message=message,
        error=error,
        summary=report,
        source=source,
        started_at=started,
    )
    sys.exit(exit_code)


if __name__ == "__main__":
    main()

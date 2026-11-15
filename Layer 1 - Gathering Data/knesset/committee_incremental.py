"""Plan current-Knesset committee fetches that resume after a cancelled run.

The scheduled run stays on the current Knesset. Session metadata is fetched
with LastUpdatedDate after the last checkpoint (minus a short overlap).
Protocol files, transcripts, and attendance rows that are already stored are
not downloaded again, so a run that dies mid-protocol continues with the
gaps. `--backfill` ignores the checkpoint and may name an older Knesset; the
scheduled workflow leaves that flag off.
"""

from __future__ import annotations

import logging
import os
from datetime import datetime, timezone

from incremental_sync import (
    OVERLAP_BUFFER,
    format_watermark,
    resolve_watermarks,
    watermark_after_fetch,
)

log = logging.getLogger(__name__)

COMMITTEE_PIPELINE = "knesset-committees"
SESSION_RESOURCE = "committee_session"


def session_query_since(
    watermark: datetime | None,
    *,
    backfill: bool,
) -> datetime | None:
    """Lower bound for LastUpdatedDate, or None for a full current-term pull."""
    if backfill or watermark is None:
        return None
    return watermark - OVERLAP_BUFFER


def session_odata_filter(knesset_num: int, since: datetime | None) -> str:
    """OData filter scoped to one Knesset, optionally after a checkpoint."""
    clause = f"KnessetNum eq {int(knesset_num)}"
    if since is None:
        return clause
    stamp = since.strftime("%Y-%m-%dT%H:%M:%S")
    return f"{clause} and LastUpdatedDate gt datetime'{stamp}'"


def ids_missing(wanted: list[int], already: set[int]) -> list[int]:
    """First occurrence only, in the original order.

    Protocol and transcript downloads use this so an id already stored, or
    listed twice, is not fetched again.
    """
    seen: set[int] = set()
    missing: list[int] = []
    for item in wanted:
        if item in already or item in seen:
            continue
        seen.add(item)
        missing.append(item)
    return missing


def sessions_missing_attendance(
    session_ids: set[int],
    have_attendance: set[int],
) -> set[int]:
    return set(session_ids) - set(have_attendance)


def advance_session_watermark(
    previous: datetime | None,
    rows: list[dict],
) -> datetime | None:
    """Move the checkpoint forward only. A dump with no timestamps keeps it."""
    return watermark_after_fetch(previous, rows, source="odata")


def read_committee_session_watermark(sb) -> datetime | None:
    """Last committed LastUpdatedDate for current-term session metadata.

    A cancelled run that checkpointed a page is visible here even when the
    surrounding sync row was never written. Success rows that predate
    watermarks contribute nothing.
    """
    state_rows = None
    try:
        state_rows = (
            sb.table("pipeline_sync_state")
            .select("resource, watermark")
            .eq("pipeline", COMMITTEE_PIPELINE)
            .eq("resource", SESSION_RESOURCE)
            .execute()
            .data
            or []
        )
    except Exception as exc:
        log.warning(
            "Could not read committee session watermark from pipeline_sync_state (%s)",
            exc,
        )
        state_rows = None
    run_rows: list = []
    try:
        run_rows = (
            sb.table("pipeline_runs")
            .select("action, status, summary")
            .eq("pipeline", COMMITTEE_PIPELINE)
            .eq("status", "success")
            .order("finished_at", desc=True)
            .limit(40)
            .execute()
            .data
            or []
        )
    except Exception as exc:
        log.warning("Could not read committee watermarks from pipeline_runs (%s)", exc)
    found = resolve_watermarks(
        state_rows,
        run_rows,
        allowed={SESSION_RESOURCE},
    )
    return found.get(SESSION_RESOURCE)


def write_committee_session_watermark(
    sb,
    stamp: datetime,
    *,
    when: datetime | None = None,
) -> None:
    """Persist a page checkpoint. Failures are logged and also copied to pipeline_runs."""
    when = when or datetime.now(timezone.utc)
    payload = {
        "pipeline": COMMITTEE_PIPELINE,
        "resource": SESSION_RESOURCE,
        "watermark": format_watermark(stamp),
        "last_run_at": when.isoformat(),
        "last_success_at": when.isoformat(),
    }
    try:
        existing = (
            sb.table("pipeline_sync_state")
            .select("id")
            .eq("pipeline", COMMITTEE_PIPELINE)
            .eq("resource", SESSION_RESOURCE)
            .limit(1)
            .execute()
            .data
            or []
        )
        if existing:
            (
                sb.table("pipeline_sync_state")
                .update(payload)
                .eq("id", existing[0]["id"])
                .execute()
            )
        else:
            sb.table("pipeline_sync_state").insert(payload).execute()
        log.info("  committee session watermark %s", payload["watermark"])
        return
    except Exception as exc:
        log.warning(
            "Could not store committee session watermark in pipeline_sync_state (%s)",
            exc,
        )
    try:
        sb.table("pipeline_runs").insert(
            {
                "pipeline": COMMITTEE_PIPELINE,
                "action": "watermark",
                "status": "success",
                "message": "committee session LastUpdatedDate checkpoint",
                "summary": {
                    "odata_watermarks": {SESSION_RESOURCE: format_watermark(stamp)}
                },
                "source": os.environ.get("PIPELINE_RUN_SOURCE", "cli"),
                "started_at": when.isoformat(),
                "finished_at": when.isoformat(),
            }
        ).execute()
    except Exception as exc:
        log.warning("Could not store committee session watermark on pipeline_runs (%s)", exc)

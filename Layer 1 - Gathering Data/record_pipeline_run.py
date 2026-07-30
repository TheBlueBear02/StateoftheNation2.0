"""Shared helper — insert a row into pipeline_runs (best-effort)."""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

from supabase import Client

log = logging.getLogger(__name__)


def record_pipeline_run(
    sb: Client,
    *,
    pipeline: str,
    action: str,
    status: str,
    message: str | None = None,
    error: str | None = None,
    summary: dict[str, Any] | None = None,
    source: str = "cli",
    started_at: datetime | None = None,
    finished_at: datetime | None = None,
) -> None:
    """Insert into pipeline_runs. Failures are logged and swallowed."""
    now = datetime.now(timezone.utc)
    row = {
        "pipeline": pipeline,
        "action": action,
        "status": status,
        "started_at": (started_at or now).isoformat(),
        "finished_at": (finished_at or now).isoformat(),
        "message": message,
        "error": error,
        "summary": summary,
        "source": source,
    }
    try:
        sb.table("pipeline_runs").insert(row).execute()
    except Exception as exc:
        log.warning("Failed to record pipeline_runs row: %s", exc)

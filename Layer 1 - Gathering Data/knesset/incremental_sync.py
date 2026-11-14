"""Incremental Knesset OData fetches keyed by LastUpdatedDate.

Large entities are reread from the last successful watermark minus a short
overlap. A missing watermark, `--full`, or Friday in Asia/Jerusalem fetches
the whole entity. KNS_KnessetDates stays full: plenum dates and IsCurrent are
aggregated across every row, and the table is small.

Watermarks are the max LastUpdatedDate actually returned by live OData. A
Hasadna CSV fallback must not advance them. Runs that never stored
`odata_watermarks` (including an in-flight full sync on the previous code)
are not a watermark.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from government_sync import (
    current_government_numbers,
    select_current_government_number,
)
from odata_client import parse_odata_datetime

PIPELINE = "knesset"
WATERMARK_FIELD = "LastUpdatedDate"
OVERLAP_BUFFER = timedelta(hours=6)
# Monday is 0. The daily cron decides Friday from the Jerusalem clock, so the
# weekly full refresh stays on Friday through IST/IDT.
FULL_REFRESH_WEEKDAY = 4

# entity → pipeline_sync_state.resource. Absence from this map means full fetch.
# GovMinistry is included only because close-if-missing is disabled unless the
# fetch itself was full. PersonToPosition and Person are the large tables.
INCREMENTAL_RESOURCES: dict[str, str] = {
    "KNS_Person": "person",
    "KNS_Faction": "faction",
    "KNS_GovMinistry": "gov_ministry",
    "KNS_PersonToPosition": "person_to_position",
}

_DATE_KEYS = {
    "StartDate",
    "FinishDate",
    "EndDate",
    "BirthDate",
    "PlenumStart",
    "PlenumFinish",
}


@dataclass(frozen=True)
class FetchPlan:
    entity: str
    resource: str | None
    mode: str  # "full" or "incremental"
    reason: str
    since: datetime | None
    filter_expr: str | None


@dataclass(frozen=True)
class GovernmentFeed:
    """Rows and current-government signal for plan_government_sync.

    use_explicit_current is false on a full feed so the planner derives the
    current number from those rows. On an incremental feed the number comes
    from a complete IsCurrent query, and trust_end is false.
    """

    rows: list[dict]
    odata_current: int | None
    trust_end: bool
    use_explicit_current: bool


def is_friday_in_jerusalem(now: datetime | None = None) -> bool:
    if now is None:
        now = datetime.now(timezone.utc)
    if now.tzinfo is None:
        now = now.replace(tzinfo=timezone.utc)
    local = now.astimezone(ZoneInfo("Asia/Jerusalem"))
    return local.weekday() == FULL_REFRESH_WEEKDAY


def run_full_reason(force_full: bool, now: datetime | None = None) -> str | None:
    """Why every incremental entity should be fetched in full, or None."""
    if force_full:
        return "flag"
    if is_friday_in_jerusalem(now):
        return "weekly-friday"
    return None


def format_watermark(value: datetime) -> str:
    """UTC timestamp with an offset so timestamptz does not guess a zone."""
    if value.tzinfo is not None:
        value = value.astimezone(timezone.utc).replace(tzinfo=None)
    return value.strftime("%Y-%m-%dT%H:%M:%S+00:00")


def plan_entity_fetch(
    entity: str,
    watermark: datetime | None,
    *,
    full_reason: str | None,
) -> FetchPlan:
    resource = INCREMENTAL_RESOURCES.get(entity)
    if resource is None:
        return FetchPlan(entity, None, "full", "not-incremental", None, None)
    if full_reason:
        return FetchPlan(entity, resource, "full", full_reason, None, None)
    if watermark is None:
        return FetchPlan(entity, resource, "full", "no-watermark", None, None)
    since = watermark - OVERLAP_BUFFER
    stamp = since.strftime("%Y-%m-%dT%H:%M:%S")
    return FetchPlan(
        entity,
        resource,
        "incremental",
        "watermark",
        since,
        f"{WATERMARK_FIELD} gt datetime'{stamp}'",
    )


def normalize_odata_dates(rows: list[dict]) -> list[dict]:
    """Keep LastUpdatedDate intact and store other dates as YYYY-MM-DD.

    keep_datetime=True is required so the watermark has a time. Business
    columns are dates; a full timestamp would fight the existing comparisons.
    """
    for row in rows:
        for key in list(row):
            if key == WATERMARK_FIELD or key not in _DATE_KEYS:
                continue
            value = row.get(key)
            if (
                isinstance(value, str)
                and len(value) >= 10
                and value[4] == "-"
                and value[7] == "-"
            ):
                row[key] = value[:10]
    return rows


def max_last_updated(rows: list[dict]) -> datetime | None:
    found = [
        parsed
        for parsed in (parse_odata_datetime(row.get(WATERMARK_FIELD)) for row in rows)
        if parsed is not None
    ]
    return max(found) if found else None


def watermark_after_fetch(
    previous: datetime | None,
    rows: list[dict],
    *,
    source: str,
) -> datetime | None:
    """Next stored watermark. Hasadna dumps do not move it forward.

    A live fetch with no LastUpdatedDate values keeps the previous watermark
    when there is one (an empty incremental page is not a reset). A live full
    fetch that never saw the field returns None, so the next run stays full.
    """
    if source != "odata":
        return previous
    observed = max_last_updated(rows)
    if observed is None:
        return previous
    if previous is None or observed > previous:
        return observed
    return previous


def merge_positions(primary: list[dict], extra: list[dict]) -> list[dict]:
    """Union by PersonToPositionID. `primary` wins when both have the row."""
    merged: dict[object, dict] = {}
    order: list[object] = []
    for row in [*extra, *primary]:
        key = row.get("PersonToPositionID")
        if key is None:
            key = id(row)
        if key not in merged:
            order.append(key)
        merged[key] = row
    return [merged[key] for key in order]


def government_feed(
    position_rows: list[dict],
    *,
    incremental: bool,
    current_rows: list[dict],
) -> GovernmentFeed:
    """Build the government planner input for a full or partial position fetch.

    Incremental rows update the positions they actually contain. The current
    GovernmentNum is taken from `current_rows` (the complete IsCurrent query),
    so a minister who was not in the batch is not treated as gone, and a real
    handover still closes the previous active government.
    """
    if not incremental:
        return GovernmentFeed(
            rows=position_rows,
            odata_current=None,
            trust_end=True,
            use_explicit_current=False,
        )
    number = select_current_government_number(current_government_numbers(current_rows))
    return GovernmentFeed(
        rows=merge_positions(position_rows, current_rows),
        odata_current=number,
        trust_end=False,
        use_explicit_current=True,
    )


def watermarks_from_state_rows(rows: list[dict]) -> dict[str, datetime]:
    known = set(INCREMENTAL_RESOURCES.values())
    found: dict[str, datetime] = {}
    for row in rows:
        resource = row.get("resource")
        if resource not in known:
            continue
        parsed = parse_odata_datetime(row.get("watermark"))
        if parsed is not None:
            found[str(resource)] = parsed
    return found


def watermarks_from_run_rows(rows: list[dict]) -> dict[str, datetime]:
    """Newest explicit odata_watermarks per resource.

    A successful sync that did not record the key contributes nothing. That
    includes the full loader from before watermarks existed: its finished_at
    is not a LastUpdatedDate.
    """
    known = set(INCREMENTAL_RESOURCES.values())
    found: dict[str, datetime] = {}
    for row in rows:
        status = row.get("status")
        if status not in (None, "success"):
            continue
        if row.get("action") == "consistency-check":
            continue
        summary = row.get("summary") or {}
        if not isinstance(summary, dict):
            continue
        marks = summary.get("odata_watermarks") or {}
        if not isinstance(marks, dict):
            continue
        for resource, value in marks.items():
            if resource in found or resource not in known:
                continue
            parsed = parse_odata_datetime(value)
            if parsed is not None:
                found[str(resource)] = parsed
    return found


def resolve_watermarks(
    state_rows: list[dict] | None,
    run_rows: list[dict] | None,
) -> dict[str, datetime]:
    """Prefer pipeline_sync_state and fill any gap from pipeline_runs summaries."""
    found: dict[str, datetime] = {}
    if state_rows is not None:
        found.update(watermarks_from_state_rows(state_rows))
    if run_rows:
        for resource, stamp in watermarks_from_run_rows(run_rows).items():
            found.setdefault(resource, stamp)
    return found


def summary_watermarks(
    previous: dict[str, datetime],
    committed: dict[str, datetime],
) -> dict[str, str]:
    merged = dict(previous)
    merged.update(committed)
    return {key: format_watermark(merged[key]) for key in sorted(merged)}


def sync_mode_name(full_reason: str | None, modes: set[str]) -> str:
    if full_reason or not modes or modes == {"full"}:
        return "full"
    if modes == {"incremental"}:
        return "incremental"
    return "mixed"

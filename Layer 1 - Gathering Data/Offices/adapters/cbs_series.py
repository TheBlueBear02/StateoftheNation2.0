"""CBS series API — apis.cbs.gov.il/series/data/list

params (per registry entry):
  id:   CBS series id (integer)
  use:  "yearly" (default) — take yearly observations as Jan-1 periods
        "yearly_avg"       — average monthly/quarterly values into a calendar year

Yearly CBS series often stamp TimePeriod as ``YYYY-01`` (not bare ``YYYY``).
"""

from __future__ import annotations

import logging
from collections import defaultdict
from datetime import date
from typing import Any

from adapters.base import AdapterError, FetchTask, get_json
from models import Observation
from periods import periods_between

log = logging.getLogger(__name__)

URL = "https://apis.cbs.gov.il/series/data/list"
MAX_POINTS = 400


def fetch_series(series_id: int, last: int) -> dict[str, Any]:
    return get_json(
        URL,
        {"id": series_id, "format": "json", "last": last, "addNull": "false"},
        timeout=60,
    )


def parse_obs(payload: dict[str, Any]) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    series_list = (payload.get("DataSet") or {}).get("Series") or []
    if not series_list:
        return {}, []
    ser = series_list[0]
    points = []
    for o in ser.get("obs") or []:
        tp = str(o.get("TimePeriod") or "")
        val = o.get("Value")
        if not tp or val is None:
            continue
        points.append({"time_period": tp, "value": float(val)})
    return ser, points


def yearly_periods(points: list[dict[str, Any]], *, average: bool) -> list[tuple[date, float, str]]:
    """Collapse CBS observations into (period_start, value, raw_time_period)."""
    if not average:
        out: list[tuple[date, float, str]] = []
        for pt in points:
            tp = pt["time_period"]
            year = int(tp[:4])
            # Accept bare year or YYYY-01 (CBS yearly stamp)
            if len(tp) == 4 or tp.endswith("-01") or (len(tp) == 7 and tp[4] == "-" and tp[5:7] == "01"):
                out.append((date(year, 1, 1), pt["value"], tp))
            elif "-" not in tp:
                out.append((date(year, 1, 1), pt["value"], tp))
        # Prefer later stamp if duplicates
        by_year: dict[int, tuple[date, float, str]] = {}
        for period, value, tp in out:
            by_year[period.year] = (period, value, tp)
        return [by_year[y] for y in sorted(by_year)]

    buckets: dict[int, list[float]] = defaultdict(list)
    raw: dict[int, list[str]] = defaultdict(list)
    for pt in points:
        tp = pt["time_period"]
        year = int(tp[:4])
        buckets[year].append(pt["value"])
        raw[year].append(tp)
    return [
        (date(y, 1, 1), sum(vals) / len(vals), f"avg({min(raw[y])}..{max(raw[y])},n={len(vals)})")
        for y, vals in sorted(buckets.items())
        if vals
    ]


def to_observations(task: FetchTask, ser: dict[str, Any], points: list[dict[str, Any]]) -> list[Observation]:
    p = task.entry.params
    use = p.get("use", "yearly")
    if use not in ("yearly", "yearly_avg"):
        raise AdapterError(f"cbs_series: unknown use {use!r}")
    series_id = int(p["id"])
    source = f"{URL}?id={series_id}&format=json"
    rows = yearly_periods(points, average=(use == "yearly_avg"))
    out: list[Observation] = []
    for period, value, raw_tp in rows:
        if period < task.since:
            continue
        out.append(
            Observation(
                key=task.entry.key,
                period=period,
                value=float(value),
                raw_value=str(value),
                source_url=source,
                method="api",
                evidence={
                    "cbs_series_id": series_id,
                    "time_period": raw_tp,
                    "time": (ser.get("time") or {}).get("name"),
                    "unit": (ser.get("unit") or {}).get("name"),
                    "data": (ser.get("data") or {}).get("name"),
                    "update": ser.get("update"),
                },
            )
        )
    return out


class CbsSeriesAdapter:
    family = "cbs_series"
    method = "api"

    def fetch(self, tasks: list[FetchTask], today: date) -> list[Observation]:
        out: list[Observation] = []
        by_id: dict[int, list[FetchTask]] = {}
        for t in tasks:
            by_id.setdefault(int(t.entry.params["id"]), []).append(t)
        for series_id, group in by_id.items():
            earliest = min(t.since for t in group)
            # yearly lookback + buffer; monthly_avg needs ~12× more points
            uses_avg = any(t.entry.params.get("use") == "yearly_avg" for t in group)
            span = max(3, periods_between(earliest, today, "yearly") + 2)
            last = min(MAX_POINTS, span * (14 if uses_avg else 2))
            payload = fetch_series(series_id, last)
            ser, points = parse_obs(payload)
            if not points:
                log.warning("cbs_series %s: empty series payload", series_id)
                continue
            for t in group:
                out.extend(to_observations(t, ser, points))
        return out

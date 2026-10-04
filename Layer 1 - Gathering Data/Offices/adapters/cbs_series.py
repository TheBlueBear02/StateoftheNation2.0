"""CBS series API — apis.cbs.gov.il/series/data/list

params (per registry entry):
  id:    CBS series id (integer)
  use:   "yearly" (default) — take yearly observations as Jan-1 periods
         "yearly_avg"       — average monthly/quarterly values into a calendar year
         "yearly_sum"       — sum monthly values into a calendar year (needs 12 months)
  scale: multiply the collapsed yearly value (default 1). E.g. CBS \"thousands\" → *1000.

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


def yearly_periods(
    points: list[dict[str, Any]],
    *,
    mode: str,
    today: date | None = None,
) -> list[tuple[date, float, str]]:
    """Collapse CBS observations into (period_start, value, raw_time_period)."""
    if mode == "yearly":
        out: list[tuple[date, float, str]] = []
        for pt in points:
            tp = pt["time_period"]
            year = int(tp[:4])
            # Accept bare year or YYYY-01 (CBS yearly stamp)
            if len(tp) == 4 or tp.endswith("-01") or (len(tp) == 7 and tp[4] == "-" and tp[5:7] == "01"):
                out.append((date(year, 1, 1), pt["value"], tp))
            elif "-" not in tp:
                out.append((date(year, 1, 1), pt["value"], tp))
        by_year: dict[int, tuple[date, float, str]] = {}
        for period, value, tp in out:
            by_year[period.year] = (period, value, tp)
        return [by_year[y] for y in sorted(by_year)]

    buckets: dict[int, list[tuple[str, float]]] = defaultdict(list)
    for pt in points:
        tp = pt["time_period"]
        if "-" not in tp or len(tp) < 7:
            continue
        year = int(tp[:4])
        buckets[year].append((tp, pt["value"]))

    out_rows: list[tuple[date, float, str]] = []
    for y, items in sorted(buckets.items()):
        if mode == "yearly_sum":
            # Only complete calendar years (12 distinct months). Skip in-progress year.
            months = {tp[5:7] for tp, _ in items if len(tp) >= 7}
            if len(months) < 12:
                continue
            if today is not None and y >= today.year:
                continue
            total = sum(v for _, v in items)
            tps = [tp for tp, _ in items]
            out_rows.append((date(y, 1, 1), total, f"sum({min(tps)}..{max(tps)},n={len(items)})"))
        elif mode == "yearly_avg":
            vals = [v for _, v in items]
            tps = [tp for tp, _ in items]
            out_rows.append(
                (date(y, 1, 1), sum(vals) / len(vals), f"avg({min(tps)}..{max(tps)},n={len(vals)})")
            )
        else:
            raise AdapterError(f"cbs_series: unknown mode {mode!r}")
    return out_rows


def to_observations(
    task: FetchTask,
    ser: dict[str, Any],
    points: list[dict[str, Any]],
    *,
    today: date,
) -> list[Observation]:
    p = task.entry.params
    use = p.get("use", "yearly")
    if use not in ("yearly", "yearly_avg", "yearly_sum"):
        raise AdapterError(f"cbs_series: unknown use {use!r}")
    scale = float(p.get("scale", 1))
    series_id = int(p["id"])
    source = f"{URL}?id={series_id}&format=json"
    rows = yearly_periods(points, mode=use, today=today)
    out: list[Observation] = []
    for period, value, raw_tp in rows:
        if period < task.since:
            continue
        scaled = float(value) * scale
        out.append(
            Observation(
                key=task.entry.key,
                period=period,
                value=scaled,
                raw_value=str(value) if scale == 1 else f"{value}*{scale}",
                source_url=source,
                method="api",
                evidence={
                    "cbs_series_id": series_id,
                    "time_period": raw_tp,
                    "scale": scale,
                    "use": use,
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
            uses_monthly = any(
                t.entry.params.get("use") in ("yearly_avg", "yearly_sum") for t in group
            )
            span = max(3, periods_between(earliest, today, "yearly") + 2)
            last = min(MAX_POINTS, span * (14 if uses_monthly else 2))
            payload = fetch_series(series_id, last)
            ser, points = parse_obs(payload)
            if not points:
                log.warning("cbs_series %s: empty series payload", series_id)
                continue
            for t in group:
                out.extend(to_observations(t, ser, points, today=today))
        return out

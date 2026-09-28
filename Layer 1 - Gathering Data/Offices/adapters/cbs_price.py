"""CBS price indices API — api.cbs.gov.il/index/data/price

params (per registry entry):
  id:   CBS index code (40010 = housing prices, 120010 = CPI general)
  use:  "currBase.value"          → monthly index level
        "december_percentYear"    → yearly: December year-over-year change (= annual inflation)
  base: optional expected baseDesc (e.g. "1993 ממוצע"); points on another base are skipped,
        because mixing bases would silently break the series.
"""

from __future__ import annotations

import logging
from datetime import date

from adapters.base import AdapterError, FetchTask, get_json
from models import Observation
from periods import periods_between

log = logging.getLogger(__name__)

URL = "https://api.cbs.gov.il/index/data/price"
MAX_MONTHS = 600


def parse_points(payload: dict) -> list[dict]:
    """Flatten the monthly block of one API page into dicts."""
    months = payload.get("month") or []
    points = []
    for block in months:
        for d in block.get("date") or []:
            points.append(
                {
                    "year": int(d["year"]),
                    "month": int(d["month"]),
                    "percentYear": d.get("percentYear"),
                    "value": (d.get("currBase") or {}).get("value"),
                    "base": (d.get("currBase") or {}).get("baseDesc"),
                }
            )
    return points


def fetch_points(index_id: int, months: int) -> list[dict]:
    params = {"id": index_id, "format": "json", "download": "false", "last": months, "PageSize": 100}
    points: list[dict] = []
    page = 1
    while True:
        payload = get_json(URL, {**params, "Page": page})
        points.extend(parse_points(payload))
        paging = payload.get("paging") or {}
        if not paging.get("next_url") or page >= int(paging.get("last_page") or 1):
            return points
        page += 1


def to_observations(task: FetchTask, points: list[dict]) -> list[Observation]:
    p = task.entry.params
    use = p.get("use", "currBase.value")
    expected_base = p.get("base")
    source = f"{URL}?id={p['id']}&format=json"
    out: list[Observation] = []
    for pt in points:
        if use == "currBase.value":
            period = date(pt["year"], pt["month"], 1)
            if expected_base and pt["base"] != expected_base:
                log.warning("cbs %s %s: base %r != expected %r — skipped", p["id"], period, pt["base"], expected_base)
                continue
            value, raw = pt["value"], pt["value"]
        elif use == "december_percentYear":
            if pt["month"] != 12:
                continue
            period = date(pt["year"], 1, 1)
            value, raw = pt["percentYear"], pt["percentYear"]
        else:
            raise AdapterError(f"cbs_price: unknown use {use!r}")
        if value is None or period < task.since:
            continue
        out.append(
            Observation(
                key=task.entry.key,
                period=period,
                value=float(value),
                raw_value=str(raw),
                source_url=source,
                method="api",
                evidence={"cbs_index": p["id"], "base": pt["base"]},
            )
        )
    return out


class CbsPriceAdapter:
    family = "cbs_price"
    method = "api"

    def fetch(self, tasks: list[FetchTask], today: date) -> list[Observation]:
        out: list[Observation] = []
        by_id: dict[int, list[FetchTask]] = {}
        for t in tasks:
            by_id.setdefault(int(t.entry.params["id"]), []).append(t)
        for index_id, group in by_id.items():
            earliest = min(t.since for t in group)
            months = min(MAX_MONTHS, max(3, periods_between(earliest, today, "monthly") + 2))
            points = fetch_points(index_id, months)
            for t in group:
                out.extend(to_observations(t, points))
        return out

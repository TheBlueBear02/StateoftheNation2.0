"""data.gov.il CKAN datastore — data.gov.il/api/3/action/datastore_search

params:
  resource_id: CKAN resource UUID
  metric:      currently only \"ev_share_new_registrations\"
  fuel_field:  fuel-type column (default sug_delek_nm)
  date_field:  first-registration column (default moed_aliya_lakvish)
  ev_fuel:     fuel label for EVs (default חשמל)

SQL search is disabled on data.gov.il, so yearly EV share of *new* registrations
is computed from filter totals: for each calendar month ``YYYY-M`` sum
``total`` for all vehicles and for EV fuel, then share = 100 * ev / all.
Only **complete** calendar years are emitted (all 12 months have registrations,
and never the current year). Values match the dashboard history within ~0.3pp.
"""

from __future__ import annotations

import json
import logging
import re
from datetime import date
from typing import Any
from urllib.parse import urlencode

import requests

from adapters.base import USER_AGENT, AdapterError, FetchTask
from models import Observation

log = logging.getLogger(__name__)

SEARCH_URL = "https://data.gov.il/api/3/action/datastore_search"
RESOURCE_RE = re.compile(r"^[0-9a-fA-F-]{36}$")


def datastore_total(resource_id: str, filters: dict[str, Any]) -> int:
    if not RESOURCE_RE.fullmatch(resource_id):
        raise AdapterError(f"datagov: bad resource_id {resource_id!r}")
    r = requests.get(
        SEARCH_URL,
        params={
            "resource_id": resource_id,
            "limit": 0,
            "filters": json.dumps(filters, ensure_ascii=False),
        },
        headers={"User-Agent": USER_AGENT},
        timeout=60,
    )
    r.raise_for_status()
    payload = r.json()
    if not payload.get("success"):
        raise AdapterError(f"datagov: search failed: {payload.get('error')}")
    return int((payload.get("result") or {}).get("total") or 0)


def last_complete_year(today: date) -> int:
    """Yearly points close after year-end; never emit the in-progress calendar year."""
    return today.year - 1


def yearly_ev_share(
    resource_id: str,
    *,
    fuel_field: str,
    date_field: str,
    ev_fuel: str,
    since_year: int,
    until_year: int,
) -> list[tuple[date, float, dict[str, Any]]]:
    out: list[tuple[date, float, dict[str, Any]]] = []
    for year in range(since_year, until_year + 1):
        month_all: list[int] = []
        month_ev: list[int] = []
        for month in range(1, 13):
            key = f"{year}-{month}"  # registry uses YYYY-M, not zero-padded
            month_all.append(datastore_total(resource_id, {date_field: key}))
            month_ev.append(
                datastore_total(resource_id, {date_field: key, fuel_field: ev_fuel})
            )
        # Incomplete year (e.g. current YTD summed by mistake) — skip.
        if any(n <= 0 for n in month_all):
            log.info(
                "datagov %s: skip %s — missing months %s",
                resource_id,
                year,
                [i + 1 for i, n in enumerate(month_all) if n <= 0],
            )
            continue
        all_n = sum(month_all)
        ev_n = sum(month_ev)
        raw_share = 100.0 * ev_n / all_n
        share = round(raw_share, 1)  # site history uses one decimal (e.g. 18.0)
        out.append(
            (
                date(year, 1, 1),
                share,
                {"year": year, "all": all_n, "ev": ev_n, "share": share, "share_raw": raw_share},
            )
        )
    return out


def to_observations(
    task: FetchTask,
    points: list[tuple[date, float, dict[str, Any]]],
    *,
    source_url: str,
) -> list[Observation]:
    out: list[Observation] = []
    for period, value, evidence in points:
        if period < task.since:
            continue
        out.append(
            Observation(
                key=task.entry.key,
                period=period,
                value=float(value),
                raw_value=str(value),
                source_url=source_url,
                method="api",
                evidence=evidence,
            )
        )
    return out


class DatagovAdapter:
    family = "datagov"
    method = "api"

    def fetch(self, tasks: list[FetchTask], today: date) -> list[Observation]:
        out: list[Observation] = []
        for t in tasks:
            p = t.entry.params
            metric = p.get("metric")
            if metric != "ev_share_new_registrations":
                raise AdapterError(f"datagov: unsupported metric {metric!r}")
            resource_id = str(p["resource_id"])
            fuel_field = str(p.get("fuel_field", "sug_delek_nm"))
            date_field = str(p.get("date_field", "moed_aliya_lakvish"))
            ev_fuel = str(p.get("ev_fuel", "חשמל"))
            since_year = t.since.year
            until_year = last_complete_year(today)
            if until_year < since_year:
                log.warning(
                    "datagov %s: no complete year yet (since=%s until=%s)",
                    resource_id,
                    since_year,
                    until_year,
                )
                continue
            points = yearly_ev_share(
                resource_id,
                fuel_field=fuel_field,
                date_field=date_field,
                ev_fuel=ev_fuel,
                since_year=since_year,
                until_year=until_year,
            )
            if not points:
                log.warning("datagov %s: no yearly points since %s", resource_id, since_year)
                continue
            qs = urlencode({"resource_id": resource_id, "limit": 0})
            source = f"{SEARCH_URL}?{qs}"
            out.extend(to_observations(t, points, source_url=source))
        return out

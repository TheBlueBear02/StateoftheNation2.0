"""World Bank API — api.worldbank.org/v2

params:
  indicator: WDI indicator id (e.g. NY.GDP.PCAP.CD)
  country:   ISO2 or ISO3 (default IL)
  scale:     divide OBS by this (default 1); use for unit alignment
"""

from __future__ import annotations

import logging
import re
from datetime import date
from typing import Any

from adapters.base import AdapterError, FetchTask, get_json
from models import Observation

log = logging.getLogger(__name__)

BASE = "https://api.worldbank.org/v2"
COUNTRY_RE = re.compile(r"^[A-Za-z]{2,3}$")
INDICATOR_RE = re.compile(r"^[A-Za-z0-9._]+$")


def fetch_indicator(country: str, indicator: str, date_from: int, date_to: int) -> list[dict[str, Any]]:
    if not COUNTRY_RE.fullmatch(country):
        raise AdapterError(f"worldbank: bad country {country!r}")
    if not INDICATOR_RE.fullmatch(indicator):
        raise AdapterError(f"worldbank: bad indicator {indicator!r}")
    url = f"{BASE}/country/{country}/indicator/{indicator}"
    payload = get_json(
        url,
        {
            "format": "json",
            "per_page": 200,
            "date": f"{int(date_from)}:{int(date_to)}",
        },
        timeout=60,
    )
    if not isinstance(payload, list) or len(payload) < 2:
        raise AdapterError(f"worldbank: unexpected payload for {indicator}")
    rows = payload[1] or []
    if not isinstance(rows, list):
        raise AdapterError(f"worldbank: unexpected rows for {indicator}")
    return rows


def parse_rows(rows: list[dict[str, Any]], *, scale: float = 1.0) -> list[tuple[date, float, str]]:
    out: list[tuple[date, float, str]] = []
    for row in rows:
        raw_date = row.get("date")
        value = row.get("value")
        if raw_date is None or value is None:
            continue
        year = int(str(raw_date)[:4])
        out.append((date(year, 1, 1), float(value) / scale, str(value)))
    out.sort(key=lambda x: x[0])
    return out


def to_observations(
    task: FetchTask,
    rows: list[dict[str, Any]],
    *,
    source_url: str,
) -> list[Observation]:
    p = task.entry.params
    scale = float(p.get("scale", 1) or 1)
    indicator = str(p["indicator"])
    country = str(p.get("country", "IL"))
    points = parse_rows(rows, scale=scale)
    out: list[Observation] = []
    for period, value, raw in points:
        if period < task.since:
            continue
        out.append(
            Observation(
                key=task.entry.key,
                period=period,
                value=value,
                raw_value=raw,
                source_url=source_url,
                method="api",
                evidence={
                    "indicator": indicator,
                    "country": country,
                    "scale": scale,
                },
            )
        )
    return out


class WorldbankAdapter:
    family = "worldbank"
    method = "api"

    def fetch(self, tasks: list[FetchTask], today: date) -> list[Observation]:
        out: list[Observation] = []
        groups: dict[tuple[str, str], list[FetchTask]] = {}
        for t in tasks:
            country = str(t.entry.params.get("country", "IL"))
            indicator = str(t.entry.params["indicator"])
            groups.setdefault((country, indicator), []).append(t)
        for (country, indicator), group in groups.items():
            earliest = min(t.since for t in group)
            date_from = earliest.year
            date_to = today.year
            rows = fetch_indicator(country, indicator, date_from, date_to)
            if not rows:
                log.warning("worldbank %s/%s: empty", country, indicator)
                continue
            source = (
                f"{BASE}/country/{country}/indicator/{indicator}"
                f"?format=json&date={date_from}:{date_to}"
            )
            for t in group:
                out.extend(to_observations(t, rows, source_url=source))
        return out

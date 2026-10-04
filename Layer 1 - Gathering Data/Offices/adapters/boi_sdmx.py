"""Bank of Israel SDMX 2.1 — edge.boi.gov.il Fusion Edge Server

params (single series):
  dataflow, series, version?, pick?, unit_mult?, scale?

params (derived monthly deficit %% of GDP — index 51):
  metric: rolling_deficit_gdp_pct
  deficit_dataflow / deficit_series  (default PS / OZAR_A5TZM_M)
  gdp_dataflow / gdp_series          (default NA / GDP_Q_N)
  decimals: round output (default 1)

rolling_deficit_gdp_pct = 100 * sum(last 12 months deficit)
                        / sum(trailing 4 quarters nominal GDP)
Matches Accountant General \"גירעון מצטבר 12 חודשים כאחוז מהתוצר\".
"""

from __future__ import annotations

import csv
import io
import logging
import re
from datetime import date
from typing import Any
from urllib.parse import urlencode

import requests

from adapters.base import USER_AGENT, AdapterError, FetchTask
from models import Observation

log = logging.getLogger(__name__)

ORIGIN = "https://edge.boi.gov.il"
BASE = f"{ORIGIN}/FusionEdgeServer/sdmx/v2/data/dataflow/BOI.STATISTICS"
DATAFLOW_RE = re.compile(r"^[A-Za-z0-9_]+$")
SERIES_RE = re.compile(r"^[A-Za-z0-9_]+$")


def fetch_csv(
    dataflow: str,
    series: str,
    *,
    version: str,
    start: str,
    end: str,
) -> str:
    if not DATAFLOW_RE.fullmatch(dataflow):
        raise AdapterError(f"boi_sdmx: bad dataflow {dataflow!r}")
    if not SERIES_RE.fullmatch(series):
        raise AdapterError(f"boi_sdmx: bad series {series!r}")
    if series.upper().startswith("TODO"):
        raise AdapterError(f"boi_sdmx: series still TODO ({dataflow}/{series})")
    url = f"{BASE}/{dataflow}/{version}"
    r = requests.get(
        url,
        params={
            "format": "csv",
            "c[SERIES_CODE]": series,
            "startPeriod": start,
            "endPeriod": end,
        },
        headers={"User-Agent": USER_AGENT, "Accept": "text/csv"},
        timeout=120,
    )
    r.raise_for_status()
    return r.text


def parse_csv_rows(text: str) -> list[dict[str, str]]:
    if not text.strip():
        return []
    return list(csv.DictReader(io.StringIO(text)))


def scaled_series(rows: list[dict[str, str]]) -> dict[str, float]:
    out: dict[str, float] = {}
    for row in rows:
        tp = (row.get("TIME_PERIOD") or "").strip()
        raw = row.get("OBS_VALUE")
        if not tp or raw in (None, ""):
            continue
        try:
            value = float(raw)
        except ValueError:
            continue
        mult_raw = row.get("UNIT_MULT")
        try:
            mult = int(mult_raw) if mult_raw not in (None, "", "_Z") else 0
        except ValueError:
            mult = 0
        out[tp] = value * (10**mult)
    return out


def collapse_yearly(
    rows: list[dict[str, str]],
    *,
    pick: str,
    unit_mult_override: int | None,
    scale: float,
) -> list[tuple[date, float, dict[str, Any]]]:
    best: dict[int, tuple[str, float, dict[str, Any]]] = {}
    for row in rows:
        tp = (row.get("TIME_PERIOD") or "").strip()
        raw = row.get("OBS_VALUE")
        if not tp or raw in (None, ""):
            continue
        try:
            value = float(raw)
        except ValueError:
            continue
        year = int(tp[:4])
        if pick == "annual":
            if len(tp) != 4:
                continue
            sort_key = tp
        elif pick == "year_end_q":
            if "-Q" not in tp:
                continue
            sort_key = tp
        elif pick == "year_end_m":
            if len(tp) < 7 or tp[4] != "-":
                continue
            sort_key = tp
        else:
            raise AdapterError(f"boi_sdmx: unknown pick {pick!r}")

        mult_raw = row.get("UNIT_MULT")
        if unit_mult_override is not None:
            mult = unit_mult_override
        else:
            try:
                mult = int(mult_raw) if mult_raw not in (None, "", "_Z") else 0
            except ValueError:
                mult = 0
        scaled = value * (10**mult) / scale
        evidence = {
            "time_period": tp,
            "obs_value": raw,
            "unit_mult": mult,
            "unit_measure": row.get("UNIT_MEASURE"),
            "original_code": row.get("ORIGINAL_CODE"),
        }
        prev = best.get(year)
        if prev is None or sort_key >= prev[0]:
            best[year] = (sort_key, scaled, evidence)
    return [(date(y, 1, 1), val, ev) for y, (_, val, ev) in sorted(best.items())]


def rolling_deficit_gdp_points(
    deficit: dict[str, float],
    gdp_q: dict[str, float],
    *,
    since: date,
    until: date,
    decimals: int,
) -> list[tuple[date, float, dict[str, Any]]]:
    """Month-start periods: 100 * trailing-12m deficit / trailing-4Q GDP."""
    out: list[tuple[date, float, dict[str, Any]]] = []
    y, m = since.year, since.month
    end_y, end_m = until.year, until.month
    while (y, m) <= (end_y, end_m):
        total_def = 0.0
        ok = True
        for i in range(12):
            mm = m - i
            yy = y
            while mm <= 0:
                mm += 12
                yy -= 1
            key = f"{yy}-{mm:02d}"
            if key not in deficit:
                ok = False
                break
            total_def += deficit[key]
        q = (m - 1) // 3 + 1
        gdp_sum = 0.0
        for i in range(4):
            qq = q - i
            yy = y
            while qq <= 0:
                qq += 4
                yy -= 1
            gkey = f"{yy}-Q{qq}"
            if gkey not in gdp_q:
                ok = False
                break
            gdp_sum += gdp_q[gkey]
        if ok and gdp_sum != 0:
            raw = 100.0 * total_def / gdp_sum
            value = round(raw, decimals)
            out.append(
                (
                    date(y, m, 1),
                    value,
                    {
                        "deficit_12m": total_def,
                        "gdp_4q": gdp_sum,
                        "share_raw": raw,
                    },
                )
            )
        m += 1
        if m > 12:
            m = 1
            y += 1
    return out


def to_observations(
    task: FetchTask,
    points: list[tuple[date, float, dict[str, Any]]],
    *,
    source_url: str,
    evidence_base: dict[str, Any],
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
                evidence={**evidence_base, **evidence},
            )
        )
    return out


class BoiSdmxAdapter:
    family = "boi_sdmx"
    method = "api"

    def fetch(self, tasks: list[FetchTask], today: date) -> list[Observation]:
        out: list[Observation] = []
        derived = [t for t in tasks if t.entry.params.get("metric") == "rolling_deficit_gdp_pct"]
        plain = [t for t in tasks if t.entry.params.get("metric") != "rolling_deficit_gdp_pct"]
        if derived:
            out.extend(self._fetch_rolling_deficit(derived, today))
        if plain:
            out.extend(self._fetch_plain(plain, today))
        return out

    def _fetch_rolling_deficit(self, tasks: list[FetchTask], today: date) -> list[Observation]:
        # One shared fetch for the default series pair.
        earliest = min(t.since for t in tasks)
        start_year = earliest.year - 2  # need lookback for 12m / 4Q
        version = "1.0"
        out: list[Observation] = []
        for t in tasks:
            p = t.entry.params
            d_flow = str(p.get("deficit_dataflow", "PS"))
            d_ser = str(p.get("deficit_series", "OZAR_A5TZM_M"))
            g_flow = str(p.get("gdp_dataflow", "NA"))
            g_ser = str(p.get("gdp_series", "GDP_Q_N"))
            decimals = int(p.get("decimals", 1))
            start = str(start_year)
            end = str(today.year)
            d_rows = parse_csv_rows(fetch_csv(d_flow, d_ser, version=version, start=start, end=end))
            g_rows = parse_csv_rows(fetch_csv(g_flow, g_ser, version=version, start=start, end=end))
            deficit = scaled_series(d_rows)
            gdp_q = scaled_series(g_rows)
            # Don't publish the unfinished current month (GDP/deficit may lag).
            until = date(today.year, today.month, 1)
            if today.day < 20:
                # previous month more reliable
                if until.month == 1:
                    until = date(until.year - 1, 12, 1)
                else:
                    until = date(until.year, until.month - 1, 1)
            points = rolling_deficit_gdp_points(
                deficit,
                gdp_q,
                since=t.since,
                until=until,
                decimals=decimals,
            )
            source = (
                f"{BASE}/{d_flow}/{version}?c[SERIES_CODE]={d_ser}"
                f" + {g_flow}/{g_ser}"
            )
            out.extend(
                to_observations(
                    t,
                    points,
                    source_url=source,
                    evidence_base={
                        "metric": "rolling_deficit_gdp_pct",
                        "deficit_series": d_ser,
                        "gdp_series": g_ser,
                    },
                )
            )
        return out

    def _fetch_plain(self, tasks: list[FetchTask], today: date) -> list[Observation]:
        out: list[Observation] = []
        groups: dict[tuple[str, str, str], list[FetchTask]] = {}
        for t in tasks:
            p = t.entry.params
            if "dataflow" not in p or "series" not in p:
                raise AdapterError(f"boi_sdmx: missing dataflow/series for key {t.entry.key}")
            dataflow = str(p["dataflow"])
            series = str(p["series"])
            version = str(p.get("version", "1.0"))
            groups.setdefault((dataflow, series, version), []).append(t)

        for (dataflow, series, version), group in groups.items():
            if series.upper().startswith("TODO"):
                log.warning(
                    "boi_sdmx: series not configured yet (%s/%s) — skipping %s",
                    dataflow,
                    series,
                    [t.entry.key for t in group],
                )
                continue
            earliest = min(t.since for t in group)
            start = str(earliest.year)
            end = str(today.year)
            text = fetch_csv(dataflow, series, version=version, start=start, end=end)
            rows = parse_csv_rows(text)
            if not rows:
                log.warning("boi_sdmx %s/%s: empty", dataflow, series)
                continue
            qs = urlencode(
                {
                    "format": "csv",
                    "c[SERIES_CODE]": series,
                    "startPeriod": start,
                    "endPeriod": end,
                }
            )
            source = f"{BASE}/{dataflow}/{version}?{qs}"
            for t in group:
                p = t.entry.params
                pick = str(p.get("pick", "annual"))
                unit_mult = p.get("unit_mult")
                scale = float(p.get("scale", 1) or 1)
                points = collapse_yearly(
                    rows,
                    pick=pick,
                    unit_mult_override=int(unit_mult) if unit_mult is not None else None,
                    scale=scale,
                )
                out.extend(
                    to_observations(
                        t,
                        points,
                        source_url=source,
                        evidence_base={"dataflow": dataflow, "series": series},
                    )
                )
        return out

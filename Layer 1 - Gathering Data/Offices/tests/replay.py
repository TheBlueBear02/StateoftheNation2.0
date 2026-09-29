"""Adapters that replay recorded real API responses (tests/fixtures) instead of the network."""

import csv
import io
import json
from datetime import date
from pathlib import Path

from adapters.boi_sdmx import collapse_yearly
from adapters.boi_sdmx import to_observations as boi_obs
from adapters.cbs_price import to_observations as cbs_obs
from adapters.cbs_series import parse_obs
from adapters.cbs_series import to_observations as cbs_series_obs
from adapters.datagov import to_observations as datagov_obs
from adapters.obudget import to_observations as obudget_obs
from adapters.worldbank import to_observations as worldbank_obs

FIX = Path(__file__).resolve().parent / "fixtures"


class ReplayCbs:
    family = "cbs_price"
    method = "api"

    def __init__(self):
        self.data = json.loads((FIX / "cbs_price_history.json").read_text(encoding="utf-8"))

    def fetch(self, tasks, today):
        out = []
        for t in tasks:
            out += cbs_obs(t, self.data[str(t.entry.params["id"])])
        return out


class ReplayCbsSeries:
    family = "cbs_series"
    method = "api"

    def __init__(self):
        self.data = json.loads((FIX / "cbs_series_history.json").read_text(encoding="utf-8"))

    def fetch(self, tasks, today):
        out = []
        for t in tasks:
            raw = self.data.get(str(t.entry.params["id"]))
            if not raw:
                continue
            ser, points = parse_obs(raw)
            out += cbs_series_obs(t, ser, points, today=today)
        return out


class ReplayObudget:
    family = "obudget"
    method = "api"

    def __init__(self):
        self.rows = json.loads((FIX / "obudget_all_2009_2026.json").read_text(encoding="utf-8"))["rows"]

    def fetch(self, tasks, today):
        out = []
        for t in tasks:
            codes = {str(c) for c in t.entry.params["codes"]}
            out += obudget_obs(t, [r for r in self.rows if r["code"] in codes], "replay")
        return out


class ReplayWorldbank:
    family = "worldbank"
    method = "api"

    def __init__(self):
        self.rows = json.loads((FIX / "worldbank_gdp_pcap_il.json").read_text(encoding="utf-8"))[1]

    def fetch(self, tasks, today):
        out = []
        for t in tasks:
            out += worldbank_obs(t, self.rows, source_url="fixture:worldbank")
        return out


class ReplayDatagov:
    family = "datagov"
    method = "api"

    def __init__(self):
        self.data = json.loads((FIX / "datagov_ev_share_history.json").read_text(encoding="utf-8"))

    def fetch(self, tasks, today):
        out = []
        for t in tasks:
            rid = str(t.entry.params["resource_id"])
            points = []
            for year, row in sorted((self.data.get(rid) or {}).items()):
                points.append(
                    (
                        date(int(year), 1, 1),
                        float(row["share"]),
                        {"year": int(year), "all": row["all"], "ev": row["ev"], "share": row["share"]},
                    )
                )
            out += datagov_obs(t, points, source_url="fixture:datagov")
        return out


class ReplayBoiSdmx:
    """Demo annual fixture for plain series; rolling deficit needs live/network."""

    family = "boi_sdmx"
    method = "api"

    def __init__(self):
        self.text = (FIX / "boi_sdmx_demo_debt_gdp.csv").read_text(encoding="utf-8")

    def fetch(self, tasks, today):
        rows = list(csv.DictReader(io.StringIO(self.text)))
        points = collapse_yearly(rows, pick="annual", unit_mult_override=None, scale=1.0)
        out = []
        for t in tasks:
            if t.entry.params.get("metric") == "rolling_deficit_gdp_pct":
                continue
            series = str(t.entry.params.get("series", ""))
            if not series or series.upper().startswith("TODO"):
                continue
            out += boi_obs(
                t,
                points,
                source_url="fixture:boi_sdmx",
                evidence_base={"dataflow": str(t.entry.params.get("dataflow", "DEMO")), "series": series},
            )
        return out

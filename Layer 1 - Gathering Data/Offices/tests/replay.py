"""Adapters that replay recorded real API responses (tests/fixtures) instead of the network."""

import json
from pathlib import Path

from adapters.cbs_price import to_observations as cbs_obs
from adapters.obudget import to_observations as obudget_obs

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

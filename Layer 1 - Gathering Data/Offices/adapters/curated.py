"""Curated yearly series from a YAML file in the Offices package.

Used when no machine-readable API exists yet (e.g. Accountant General debt).
Update curated_series.yaml when the source publishes a new year.

params:
  series: key inside curated_series.yaml (e.g. debt_gdp)
"""

from __future__ import annotations

import logging
from datetime import date
from pathlib import Path
from typing import Any

import yaml

from adapters.base import AdapterError, FetchTask
from models import Observation

log = logging.getLogger(__name__)
CURATED_PATH = Path(__file__).resolve().parent.parent / "curated_series.yaml"


def load_series(name: str) -> dict[str, Any]:
    data = yaml.safe_load(CURATED_PATH.read_text(encoding="utf-8")) or {}
    if name not in data:
        raise AdapterError(f"curated: unknown series {name!r}")
    block = data[name]
    if not isinstance(block, dict) or "points" not in block:
        raise AdapterError(f"curated: series {name!r} missing points")
    return block


class CuratedAdapter:
    family = "curated"
    method = "api"  # trusted hand-maintained official figures → auto-publish path

    def fetch(self, tasks: list[FetchTask], today: date) -> list[Observation]:
        out: list[Observation] = []
        for t in tasks:
            name = str(t.entry.params["series"])
            block = load_series(name)
            source = str(block.get("source_url") or CURATED_PATH.name)
            points = block["points"] or {}
            for year_raw, value in sorted(points.items(), key=lambda kv: int(kv[0])):
                year = int(year_raw)
                period = date(year, 1, 1)
                if period < t.since:
                    continue
                if year > today.year:
                    continue
                out.append(
                    Observation(
                        key=t.entry.key,
                        period=period,
                        value=float(value),
                        raw_value=str(value),
                        source_url=source,
                        method="api",
                        evidence={"curated_series": name, "year": year},
                    )
                )
        return out

"""Load and validate kpi_sources.yaml."""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import yaml

from periods import FREQUENCIES, LABEL_RULES

REGISTRY_PATH = Path(__file__).resolve().parent / "kpi_sources.yaml"
TIERS = ("A", "A'", "B", "C", "D")


@dataclass(frozen=True)
class Entry:
    key: int                      # stable id from the source DB (not the Supabase id)
    name: str
    office: str
    frequency: str
    tier: str
    adapter: str                  # "cbs_price", "obudget", "document:police_yearbook", ...
    params: dict[str, Any]
    label_rule: str
    release: dict[str, Any]
    kind: str = "kpi"
    bounds: tuple[float, float] | None = None
    max_jump_pct: float | None = None
    notes: str = ""
    raw: dict[str, Any] = field(default_factory=dict, compare=False, repr=False)

    @property
    def adapter_family(self) -> str:
        """'document:police_yearbook' → 'document'."""
        return self.adapter.split(":", 1)[0]

    @property
    def doc_key(self) -> str | None:
        return self.adapter.split(":", 1)[1] if ":" in self.adapter else None

    @property
    def check_every_days(self) -> int:
        return int(self.release.get("check_every_days", 7))


class RegistryError(ValueError):
    pass


def load_registry(path: Path = REGISTRY_PATH) -> list[Entry]:
    data = yaml.safe_load(path.read_text(encoding="utf-8")) or []
    if not isinstance(data, list):
        raise RegistryError("kpi_sources.yaml must be a list of entries")

    entries: list[Entry] = []
    seen: set[int] = set()
    errors: list[str] = []
    for i, row in enumerate(data):
        where = f"entry #{i} ({row.get('name', '?')})"
        try:
            key = int(row["key"])
            if key in seen:
                errors.append(f"{where}: duplicate key {key}")
            seen.add(key)
            freq = row["frequency"]
            if freq not in FREQUENCIES:
                errors.append(f"{where}: bad frequency {freq!r}")
            rule = row["label_rule"]
            if rule not in LABEL_RULES:
                errors.append(f"{where}: bad label_rule {rule!r}")
            if freq == "yearly" and rule != "yearly_jan1":
                errors.append(f"{where}: yearly series must use yearly_jan1")
            if freq == "monthly" and rule == "yearly_jan1":
                errors.append(f"{where}: monthly series cannot use yearly_jan1")
            tier = str(row["tier"])
            if tier not in TIERS:
                errors.append(f"{where}: bad tier {tier!r}")
            release = row.get("release") or {}
            if freq == "yearly" and "window" not in release:
                errors.append(f"{where}: yearly entries need release.window")
            if freq == "monthly" and "window" in release:
                errors.append(f"{where}: monthly entries use min/max_lag_days, not window")
            bounds = row.get("bounds")
            entries.append(
                Entry(
                    key=key,
                    name=str(row["name"]),
                    office=str(row["office"]),
                    frequency=freq,
                    tier=tier,
                    adapter=str(row["adapter"]),
                    params=dict(row.get("params") or {}),
                    label_rule=rule,
                    release=dict(release),
                    kind=str(row.get("kind", "kpi")),
                    bounds=(float(bounds[0]), float(bounds[1])) if bounds else None,
                    max_jump_pct=(
                        float(row["max_jump_pct"]) if row.get("max_jump_pct") is not None else None
                    ),
                    notes=str(row.get("notes") or ""),
                    raw=row,
                )
            )
        except KeyError as exc:
            errors.append(f"{where}: missing field {exc}")
    if errors:
        raise RegistryError("kpi_sources.yaml invalid:\n  " + "\n  ".join(errors))
    return entries

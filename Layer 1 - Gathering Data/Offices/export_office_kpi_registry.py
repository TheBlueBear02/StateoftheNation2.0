"""Emit src/content/officeKpiRegistry.ts from kpi_sources.yaml."""

from __future__ import annotations

import json
from pathlib import Path

from adapters import IMPLEMENTED_FAMILIES
from registry import load_registry

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "src" / "content" / "officeKpiRegistry.ts"


def main() -> None:
    entries = []
    for e in load_registry():
        family = e.adapter_family
        entries.append(
            {
                "key": e.key,
                "name": e.name,
                "office": e.office,
                "kind": e.kind,
                "frequency": e.frequency,
                "adapterFamily": family,
                "automated": family in IMPLEMENTED_FAMILIES
                and not str(e.params.get("series", "")).upper().startswith("TODO"),
                "release": e.release,
                "labelRule": e.label_rule,
                "tier": e.tier,
            }
        )

    families = sorted(IMPLEMENTED_FAMILIES)
    body = json.dumps(entries, ensure_ascii=False, indent=2)
    # quote keys already from json.dumps; reformat as TS array of objects with camelCase preserved
    text = f"""/** Auto-derived from Layer 1 kpi_sources.yaml — re-run extract when registry changes. */
export type OfficeKpiRegistryRelease = {{
  window?: string
  year_offset?: number
  min_lag_days?: number
  max_lag_days?: number
  check_every_days?: number
}}

export type OfficeKpiRegistryEntry = {{
  key: number
  name: string
  office: string
  kind: string
  frequency: 'yearly' | 'monthly'
  adapterFamily: string
  /** True when an adapter is registered in ADAPTERS today. */
  automated: boolean
  release: OfficeKpiRegistryRelease
  labelRule: string
  tier: string
}}

export const OFFICE_KPI_IMPLEMENTED_FAMILIES = {json.dumps(families)} as const

export const OFFICE_KPI_REGISTRY: OfficeKpiRegistryEntry[] = {body}
"""
    OUT.write_text(text, encoding="utf-8")
    print(f"wrote {OUT} ({len(entries)} entries, automated={sum(1 for e in entries if e['automated'])})")


if __name__ == "__main__":
    main()

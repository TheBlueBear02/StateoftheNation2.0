"""Emit src/content/officeKpiRegistry.ts from kpi_sources.yaml."""

from __future__ import annotations

import json
from pathlib import Path

from adapters import IMPLEMENTED_FAMILIES
from registry import load_registry

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "src" / "content" / "officeKpiRegistry.ts"

# Document adapters that are wired + tested (board shows automated=true).
# Nightly still requires OFFICE_KPI_DOCUMENTS / --documents.
WORKING_DOC_KEYS = frozenset(
    {
        "shabak_monthly",
        "police_yearbook",
    }
)


def _doc_key(adapter: str) -> str | None:
    if ":" not in adapter:
        return None
    family, _, rest = adapter.partition(":")
    if family != "document" or not rest:
        return None
    return rest.strip()


def _is_automated(entry) -> bool:
    family = entry.adapter_family
    if str(entry.params.get("series", "")).upper().startswith("TODO"):
        return False
    if family == "document":
        return _doc_key(entry.adapter) in WORKING_DOC_KEYS
    return family in IMPLEMENTED_FAMILIES


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
                "automated": _is_automated(e),
                "release": e.release,
                "labelRule": e.label_rule,
                "tier": e.tier,
            }
        )

    # Board "implemented families" includes document when any working doc key exists.
    families = sorted(set(IMPLEMENTED_FAMILIES) | ({"document"} if WORKING_DOC_KEYS else set()))
    body = json.dumps(entries, ensure_ascii=False, indent=2)
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

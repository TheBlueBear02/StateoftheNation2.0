"""Adapter registry. Add a new source family here and it becomes plannable."""

from __future__ import annotations

from adapters.base import Adapter
from adapters.cbs_price import CbsPriceAdapter
from adapters.obudget import ObudgetAdapter

ADAPTERS: dict[str, Adapter] = {
    a.family: a
    for a in (
        CbsPriceAdapter(),
        ObudgetAdapter(),
    )
}

# Cheapest first: APIs, then files, then PDF + LLM.
FAMILY_ORDER = ["cbs_price", "cbs_series", "obudget", "worldbank", "boi_sdmx", "datagov", "shkifut", "document", "manual_watch"]

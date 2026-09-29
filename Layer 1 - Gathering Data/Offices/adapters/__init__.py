"""Adapter registry. Add a new source family here and it becomes plannable."""

from __future__ import annotations

from adapters.base import Adapter
from adapters.boi_sdmx import BoiSdmxAdapter
from adapters.cbs_price import CbsPriceAdapter
from adapters.cbs_series import CbsSeriesAdapter
from adapters.curated import CuratedAdapter
from adapters.datagov import DatagovAdapter
from adapters.obudget import ObudgetAdapter
from adapters.worldbank import WorldbankAdapter

ADAPTERS: dict[str, Adapter] = {
    a.family: a
    for a in (
        CbsPriceAdapter(),
        CbsSeriesAdapter(),
        ObudgetAdapter(),
        WorldbankAdapter(),
        BoiSdmxAdapter(),
        DatagovAdapter(),
        CuratedAdapter(),
    )
}

# Cheapest first: APIs, then files, then PDF + LLM.
FAMILY_ORDER = [
    "cbs_price",
    "cbs_series",
    "obudget",
    "worldbank",
    "boi_sdmx",
    "datagov",
    "curated",
    "shkifut",
    "document",
    "manual_watch",
]

# Families with working registry params today (board automated=true).
IMPLEMENTED_FAMILIES = frozenset(
    {
        "cbs_price",
        "cbs_series",
        "obudget",
        "worldbank",
        "datagov",
        "boi_sdmx",
        "curated",
    }
)

"""Adapter registry. Add a new source family here and it becomes plannable."""

from __future__ import annotations

from adapters.base import Adapter
from adapters.boi_sdmx import BoiSdmxAdapter
from adapters.cbs_price import CbsPriceAdapter
from adapters.cbs_series import CbsSeriesAdapter
from adapters.curated import CuratedAdapter
from adapters.datagov import DatagovAdapter
from adapters.document import documents_enabled
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

# Document sources are opt-in so the nightly API run stays unchanged until
# OFFICE_KPI_DOCUMENTS=true (or --documents on the CLI).
if documents_enabled():
    from adapters.document import DocumentAdapter

    ADAPTERS["document"] = DocumentAdapter()

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
        *(["document"] if documents_enabled() else []),
    }
)


def with_documents(enabled: bool = True, **doc_kwargs) -> dict[str, Adapter]:
    """Return a copy of ADAPTERS with the document adapter forced on/off (tests/CLI)."""
    from adapters.document import DocumentAdapter

    out = dict(ADAPTERS)
    if enabled:
        out["document"] = DocumentAdapter(**doc_kwargs)
    else:
        out.pop("document", None)
    return out

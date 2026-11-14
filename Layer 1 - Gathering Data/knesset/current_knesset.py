"""Resolve the current Knesset from OData IsCurrent, then the DB active row."""

from __future__ import annotations

import logging

from knesset_term import current_knesset_numbers, select_current_knesset_number
from odata_client import fetch_odata

log = logging.getLogger(__name__)


def odata_current_knesset_number() -> int | None:
    """Highest KnessetNum with IsCurrent on KNS_KnessetDates.

    Tries a server-side filter first. An empty filter result is confirmed
    against the full entity so a dropped $filter cannot hide the current term.
    """
    filtered = fetch_odata("KNS_KnessetDates", "IsCurrent eq true")
    numbers = current_knesset_numbers(filtered)
    if not numbers:
        log.info(
            "IsCurrent filter returned no Knesset — confirming against full KNS_KnessetDates"
        )
        numbers = current_knesset_numbers(fetch_odata("KNS_KnessetDates"))
    if len(numbers) > 1:
        log.warning(
            "OData IsCurrent is set on multiple Knessets %s — using %s",
            numbers,
            max(numbers),
        )
    return select_current_knesset_number(numbers)


def database_active_knesset_number(sb) -> int | None:
    rows = (
        sb.table("knessets")
        .select("knesset_number")
        .eq("is_active", True)
        .execute()
        .data
        or []
    )
    numbers = sorted(
        {
            int(row["knesset_number"])
            for row in rows
            if row.get("knesset_number") is not None
        }
    )
    if not numbers:
        return None
    if len(numbers) > 1:
        log.warning(
            "Multiple knessets.is_active rows %s — using %s",
            numbers,
            numbers[-1],
        )
    return numbers[-1]


def resolve_current_knesset_number(sb) -> int | None:
    """OData IsCurrent, else knessets.is_active. None when both are unavailable."""
    odata_number = None
    try:
        odata_number = odata_current_knesset_number()
    except Exception as exc:
        log.warning("OData current-Knesset lookup failed: %s", exc)
    if odata_number is not None:
        log.info("Current Knesset %s from OData IsCurrent", odata_number)
        return odata_number
    db_number = database_active_knesset_number(sb)
    if db_number is not None:
        log.warning(
            "Using DB active Knesset %s (OData IsCurrent unavailable)",
            db_number,
        )
        return db_number
    return None

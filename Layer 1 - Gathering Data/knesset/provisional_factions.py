"""Election-list fallback for MK faction links when OData FactionID is null.

Official Knesset FactionID values are applied by load_all_knesset_data before
this module runs. This module only fills null links, or refreshes links already
marked faction_id_provisional. It never overwrites an official faction_id.
"""

from __future__ import annotations

import logging
from typing import Any

from knesset_term import (
    FactionRef,
    FactionWrite,
    MembershipFactionState,
    PartyRef,
    match_party_to_faction,
    person_party_map,
    plan_provisional_faction_writes,
)

log = logging.getLogger(__name__)

PROVISIONAL_COLUMN = "faction_id_provisional"


def provisional_column_ready(sb) -> bool:
    try:
        sb.table("knesset_memberships").select(PROVISIONAL_COLUMN).limit(1).execute()
        return True
    except Exception as exc:
        log.error(
            "knesset_memberships.%s is missing — apply "
            "schema_knesset_membership_faction_provisional.sql before provisional "
            "faction links can be stored (%s)",
            PROVISIONAL_COLUMN,
            exc,
        )
        return False


def _fetch_all(sb, table: str, columns: str, **filters: Any) -> list[dict]:
    rows: list[dict] = []
    page_size = 1000
    offset = 0
    while True:
        query = sb.table(table).select(columns)
        for key, value in filters.items():
            query = query.eq(key, value)
        batch = query.range(offset, offset + page_size - 1).execute().data or []
        rows.extend(batch)
        if len(batch) < page_size:
            break
        offset += page_size
    return rows


def _election_for_knesset(sb, knesset_number: int) -> dict | None:
    rows = (
        sb.table("elections")
        .select("id, year, date, knesset_number")
        .eq("knesset_number", knesset_number)
        .execute()
        .data
        or []
    )
    if not rows:
        return None
    rows.sort(key=lambda row: (row.get("year") or 0, row.get("date") or ""))
    return rows[-1]


def build_provisional_plan(
    sb,
    *,
    current_knesset_number: int,
    current_knesset_id: int,
    memberships: list[dict],
    official_position_ids: set[int],
) -> dict[str, Any]:
    """Return planned provisional writes plus match diagnostics. Does not write."""
    election = _election_for_knesset(sb, current_knesset_number)
    if election is None:
        log.warning(
            "No elections row for Knesset %s — provisional faction fallback skipped",
            current_knesset_number,
        )
        return {
            "writes": [],
            "election_id": None,
            "unmatched_memberships": 0,
            "ambiguous_people": 0,
            "parties_unmatched": [],
        }

    election_id = int(election["id"])
    party_rows = _fetch_all(
        sb,
        "election_parties",
        "id, name, short_name, knesset_faction_id",
        election_id=election_id,
    )
    faction_rows = _fetch_all(
        sb,
        "knesset_factions",
        "id, name, short_name",
        knesset_id=current_knesset_id,
    )
    candidate_rows = _fetch_all(
        sb,
        "election_candidates",
        "person_id, party_id, list_position",
        election_id=election_id,
    )

    factions = [
        FactionRef(
            id=int(row["id"]),
            name=row.get("name"),
            short_name=row.get("short_name"),
        )
        for row in faction_rows
        if row.get("id") is not None
    ]
    parties_unmatched: list[str] = []
    party_to_faction: dict[int, int] = {}
    for row in party_rows:
        party = PartyRef(
            id=int(row["id"]),
            name=row.get("name") or "",
            short_name=row.get("short_name"),
            linked_faction_id=(
                int(row["knesset_faction_id"])
                if row.get("knesset_faction_id") is not None
                else None
            ),
        )
        faction_id = match_party_to_faction(party, factions)
        if faction_id is None:
            parties_unmatched.append(party.short_name or party.name)
            continue
        party_to_faction[party.id] = faction_id

    candidates = [
        (
            int(row["person_id"]),
            int(row["party_id"]),
            int(row.get("list_position") or 0),
        )
        for row in candidate_rows
        if row.get("person_id") is not None and row.get("party_id") is not None
    ]
    person_to_party, ambiguous = person_party_map(candidates)
    if ambiguous:
        log.warning(
            "Provisional factions: %d people are on more than one election list — skipped",
            len(ambiguous),
        )
    if parties_unmatched:
        log.warning(
            "Provisional factions: no current-Knesset faction for parties: %s",
            ", ".join(parties_unmatched),
        )

    states = [
        MembershipFactionState(
            knesset_position_id=int(row["knesset_position_id"]),
            person_id=int(row["person_id"]),
            knesset_id=int(row["knesset_id"]),
            faction_id=(
                int(row["faction_id"]) if row.get("faction_id") is not None else None
            ),
            faction_id_provisional=bool(row.get(PROVISIONAL_COLUMN)),
        )
        for row in memberships
        if row.get("knesset_position_id") is not None and row.get("person_id") is not None
    ]
    writes = plan_provisional_faction_writes(
        states,
        current_knesset_id=current_knesset_id,
        person_to_party=person_to_party,
        party_to_faction=party_to_faction,
        official_position_ids=official_position_ids,
    )
    matched_positions = {write.knesset_position_id for write in writes}
    unmatched = 0
    for state in states:
        if state.knesset_id != current_knesset_id:
            continue
        if state.knesset_position_id in official_position_ids:
            continue
        if state.faction_id is not None and not state.faction_id_provisional:
            continue
        if state.knesset_position_id in matched_positions:
            continue
        if state.faction_id is not None and state.faction_id_provisional:
            continue
        unmatched += 1

    log.info(
        "Provisional factions: %d links planned (%d current memberships still unmatched)",
        len(writes),
        unmatched,
    )
    return {
        "writes": writes,
        "election_id": election_id,
        "unmatched_memberships": unmatched,
        "ambiguous_people": len(ambiguous),
        "parties_unmatched": parties_unmatched,
    }


def faction_write_payload(write: FactionWrite) -> dict[str, Any]:
    return {
        "knesset_position_id": write.knesset_position_id,
        "faction_id": write.faction_id,
        "faction_id_provisional": write.faction_id_provisional,
    }

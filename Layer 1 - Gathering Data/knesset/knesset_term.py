"""Current-Knesset helpers shared by the OData sync, committees loader, and consistency check.

No network or database access. Official Knesset FactionID always wins over the
election-list fallback; callers must not overwrite a non-provisional faction_id.
"""

from __future__ import annotations

from dataclasses import dataclass

_NIKUD_AND_BIDI = {chr(code) for code in range(0x0591, 0x05C8)} | {
    "\u200e",
    "\u200f",
    "\u202a",
    "\u202b",
    "\u202c",
    "\ufeff",
}
_QUOTE_CHARS = set("\"'`״׳„“”«»")
_DASH_CHARS = set("-–—־")
_BOUNDARY_CHARS = set(" -–—־ו")


def _strip_marks(value: str) -> str:
    return "".join(ch for ch in value if ch not in _NIKUD_AND_BIDI)


def loose_political_name(value: str | None) -> str:
    """Collapse quotes, dashes, and spacing but keep word boundaries."""
    if not value:
        return ""
    text = _strip_marks(value).strip()
    chars: list[str] = []
    for ch in text:
        if ch in _QUOTE_CHARS or ch in _DASH_CHARS:
            chars.append(" ")
        else:
            chars.append(ch)
    return " ".join("".join(chars).split())


def normalize_political_name(value: str | None) -> str:
    """Quote- and space-insensitive key (ש״ס / ש\"ס / שס)."""
    loose = loose_political_name(value)
    return loose.replace(" ", "")


def _name_variants(value: str | None) -> list[str]:
    loose = loose_political_name(value)
    if not loose:
        return []
    variants = [loose]
    for marker in (" בראשות ", " בהנהגת "):
        if marker in loose:
            head = loose.split(marker, 1)[0].strip()
            if head:
                variants.append(head)
    return variants


def _boundary_prefix(shorter: str, longer: str) -> bool:
    if len(shorter) < 3 or len(longer) <= len(shorter):
        return False
    if not longer.startswith(shorter):
        return False
    return longer[len(shorter)] in _BOUNDARY_CHARS


def names_refer_to_same_party(left: str | None, right: str | None) -> bool:
    left_variants = _name_variants(left)
    right_variants = _name_variants(right)
    if not left_variants or not right_variants:
        return False
    for a in left_variants:
        for b in right_variants:
            if normalize_political_name(a) == normalize_political_name(b):
                return True
            if _boundary_prefix(a, b) or _boundary_prefix(b, a):
                return True
    return False


def _is_current_flag(value: object) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return value == 1
    if isinstance(value, str):
        return value.strip().lower() in {"true", "1", "yes"}
    return False


def current_knesset_numbers(plenum_rows: list[dict]) -> list[int]:
    """Distinct KnessetNum values that have any IsCurrent row, ascending."""
    found: set[int] = set()
    for row in plenum_rows:
        if not _is_current_flag(row.get("IsCurrent")):
            continue
        raw = row.get("KnessetNum")
        if raw is None:
            continue
        try:
            found.add(int(raw))
        except (TypeError, ValueError):
            continue
    return sorted(found)


def select_current_knesset_number(numbers: list[int]) -> int | None:
    if not numbers:
        return None
    return max(numbers)


def active_flags_for_knesset_rows(
    numbers: list[int],
    *,
    odata_current: int | None,
    existing_active: dict[int, bool],
) -> dict[int, bool]:
    """One active knesset when OData says so; otherwise keep the DB flags."""
    if odata_current is None:
        return {number: bool(existing_active.get(number, False)) for number in numbers}
    return {number: number == odata_current for number in numbers}


def knesset_numbers_to_deactivate(
    existing_active_numbers: list[int],
    odata_current: int | None,
) -> list[int]:
    """Rows that must be cleared before the new active knesset is written.

    The partial unique index on knessets.is_active allows only one true value,
    so the previous term is deactivated in its own update.
    """
    if odata_current is None:
        return []
    return sorted(number for number in existing_active_numbers if number != odata_current)


def knesset_image_folder_candidates(knesset_number: int) -> list[str]:
    """Directory names under public/images/KM Images for one Knesset term."""
    return [f"הכנסת ה{knesset_number}", f"הכנסת ה-{knesset_number}"]


@dataclass(frozen=True)
class FactionRef:
    id: int
    name: str | None = None
    short_name: str | None = None


@dataclass(frozen=True)
class PartyRef:
    id: int
    name: str
    short_name: str | None = None
    linked_faction_id: int | None = None


@dataclass(frozen=True)
class MembershipFactionState:
    knesset_position_id: int
    person_id: int
    knesset_id: int
    faction_id: int | None
    faction_id_provisional: bool


@dataclass(frozen=True)
class FactionWrite:
    knesset_position_id: int
    faction_id: int
    faction_id_provisional: bool
    previous_faction_id: int | None
    previous_provisional: bool


def match_party_to_faction(party: PartyRef, factions: list[FactionRef]) -> int | None:
    """Map a ballot party onto one current-Knesset faction, or None if ambiguous.

    An election_parties.knesset_faction_id link is used only when that row is in
    `factions` (the current Knesset). A link to an older term is ignored.
    """
    by_id = {faction.id: faction for faction in factions}
    if party.linked_faction_id is not None and party.linked_faction_id in by_id:
        return party.linked_faction_id

    party_names = [party.short_name, party.name]
    hits: list[int] = []
    for faction in factions:
        faction_names = [faction.short_name, faction.name]
        if any(
            names_refer_to_same_party(party_name, faction_name)
            for party_name in party_names
            for faction_name in faction_names
        ):
            hits.append(faction.id)
    unique = list(dict.fromkeys(hits))
    if len(unique) == 1:
        return unique[0]
    return None


def person_party_map(
    candidates: list[tuple[int, int, int]],
) -> tuple[dict[int, int], list[int]]:
    """person_id → party_id. People on more than one party list are ambiguous."""
    grouped: dict[int, set[int]] = {}
    for person_id, party_id, _list_position in candidates:
        grouped.setdefault(person_id, set()).add(party_id)
    chosen: dict[int, int] = {}
    ambiguous: list[int] = []
    for person_id, party_ids in grouped.items():
        if len(party_ids) != 1:
            ambiguous.append(person_id)
            continue
        chosen[person_id] = next(iter(party_ids))
    return chosen, ambiguous


def plan_official_faction_writes(
    states_by_position: dict[int, MembershipFactionState],
    official_by_position: dict[int, int],
) -> list[FactionWrite]:
    """OData FactionID writes. Always clears the provisional flag."""
    writes: list[FactionWrite] = []
    for position_id, faction_id in official_by_position.items():
        state = states_by_position.get(position_id)
        previous = state.faction_id if state else None
        previous_flag = state.faction_id_provisional if state else False
        if previous == faction_id and not previous_flag:
            continue
        writes.append(
            FactionWrite(
                knesset_position_id=position_id,
                faction_id=faction_id,
                faction_id_provisional=False,
                previous_faction_id=previous,
                previous_provisional=previous_flag,
            )
        )
    return writes


def official_conflicts(writes: list[FactionWrite]) -> list[FactionWrite]:
    """Provisional links that OData replaced with a different faction."""
    return [
        write
        for write in writes
        if write.previous_provisional and write.previous_faction_id != write.faction_id
    ]


def plan_provisional_faction_writes(
    states: list[MembershipFactionState],
    *,
    current_knesset_id: int,
    person_to_party: dict[int, int],
    party_to_faction: dict[int, int],
    official_position_ids: set[int],
) -> list[FactionWrite]:
    """Fill null faction links from election lists. Never touch an official link.

    `official_position_ids` includes every OData row that carried a FactionID,
    even when that id did not match a knesset_factions row. Those stay untouched
    so a fallback cannot replace official data we failed to resolve.
    """
    writes: list[FactionWrite] = []
    for state in states:
        if state.knesset_id != current_knesset_id:
            continue
        if state.knesset_position_id in official_position_ids:
            continue
        if state.faction_id is not None and not state.faction_id_provisional:
            continue
        party_id = person_to_party.get(state.person_id)
        if party_id is None:
            continue
        faction_id = party_to_faction.get(party_id)
        if faction_id is None:
            continue
        if state.faction_id == faction_id and state.faction_id_provisional:
            continue
        writes.append(
            FactionWrite(
                knesset_position_id=state.knesset_position_id,
                faction_id=faction_id,
                faction_id_provisional=True,
                previous_faction_id=state.faction_id,
                previous_provisional=state.faction_id_provisional,
            )
        )
    return writes


@dataclass(frozen=True)
class ConsistencyFacts:
    odata_knesset_lookup_ok: bool
    odata_current_knesset: int | None
    db_active_knesset: int | None
    null_faction_memberships: int
    provisional_faction_memberships: int
    odata_current_committee_ids: frozenset[int] | None
    db_committee_ids_for_current: frozenset[int]
    committees_marked_current_on_knessets: frozenset[int]
    last_committees_sync_knesset: int | None
    provisional_column_ready: bool
    odata_government_lookup_ok: bool
    odata_current_government: int | None
    db_active_government: int | None
    active_government_open_appointments: int | None


def evaluate_consistency(facts: ConsistencyFacts) -> dict:
    """Return ok/issues for the knesset pipeline consistency step."""
    issues: list[dict[str, str]] = []

    def add(code: str, message: str) -> None:
        issues.append({"code": code, "message": message})

    if not facts.provisional_column_ready:
        add(
            "provisional_column_missing",
            "knesset_memberships.faction_id_provisional is missing — apply "
            "schema_knesset_membership_faction_provisional.sql",
        )

    if not facts.odata_knesset_lookup_ok:
        add(
            "odata_current_knesset_unreadable",
            "Could not read the current Knesset from OData IsCurrent",
        )
    elif facts.odata_current_knesset is None:
        add(
            "odata_current_knesset_missing",
            "OData returned no IsCurrent Knesset",
        )
    elif facts.db_active_knesset != facts.odata_current_knesset:
        add(
            "odata_db_knesset_mismatch",
            (
                f"OData current Knesset {facts.odata_current_knesset} != "
                f"DB active knesset {facts.db_active_knesset}"
            ),
        )

    current = facts.odata_current_knesset or facts.db_active_knesset

    if facts.null_faction_memberships > 0:
        add(
            "null_faction_memberships",
            (
                f"{facts.null_faction_memberships} current-Knesset memberships "
                "have null faction_id"
            ),
        )

    if facts.odata_current_committee_ids is None:
        add(
            "odata_committees_unreadable",
            "Could not read current Knesset committees from OData",
        )
    elif current is not None:
        missing = sorted(
            facts.odata_current_committee_ids - facts.db_committee_ids_for_current
        )
        if missing:
            preview = ", ".join(str(item) for item in missing[:20])
            extra = "" if len(missing) <= 20 else f" (+{len(missing) - 20} more)"
            add(
                "missing_current_committees",
                (
                    f"OData has {len(missing)} current committees missing from the DB "
                    f"for Knesset {current}: {preview}{extra}"
                ),
            )

    if current is not None:
        others = sorted(
            number
            for number in facts.committees_marked_current_on_knessets
            if number != current
        )
        if others:
            add(
                "committees_current_on_other_knesset",
                (
                    "Committees are marked current for non-current Knesset(s) "
                    + ", ".join(str(number) for number in others)
                ),
            )
        if (
            facts.last_committees_sync_knesset is not None
            and facts.last_committees_sync_knesset != current
        ):
            add(
                "committees_synced_for_non_current_knesset",
                (
                    f"Last committees sync targeted Knesset "
                    f"{facts.last_committees_sync_knesset}, but the current "
                    f"Knesset is {current}"
                ),
            )

    if not facts.odata_government_lookup_ok:
        add(
            "odata_current_government_unreadable",
            "Could not read the current government from OData GovernmentNum",
        )
    elif facts.odata_current_government is None:
        add(
            "odata_current_government_missing",
            "OData returned no IsCurrent ministerial position with GovernmentNum",
        )
    elif facts.db_active_government != facts.odata_current_government:
        add(
            "odata_db_government_mismatch",
            (
                f"OData current government {facts.odata_current_government} != "
                f"DB active government {facts.db_active_government}"
            ),
        )

    if (
        facts.db_active_government is not None
        and facts.active_government_open_appointments == 0
    ):
        add(
            "active_government_without_ministers",
            (
                f"Active government {facts.db_active_government} has no open "
                "minister appointments"
            ),
        )

    return {
        "ok": not issues,
        "issues": issues,
        "current_knesset": current,
        "odata_current_knesset": facts.odata_current_knesset,
        "db_active_knesset": facts.db_active_knesset,
        "null_faction_memberships": facts.null_faction_memberships,
        "provisional_faction_memberships": facts.provisional_faction_memberships,
        "odata_current_government": facts.odata_current_government,
        "db_active_government": facts.db_active_government,
        "active_government_open_appointments": facts.active_government_open_appointments,
    }

"""Current-Knesset helpers shared by the OData sync, committees loader, and consistency check.

No network or database access. Official Knesset FactionID always wins over the
election-list fallback; callers must not overwrite a non-provisional faction_id.
"""

from __future__ import annotations

import os
import re
import unicodedata
from dataclasses import dataclass
from datetime import date, datetime
from zoneinfo import ZoneInfo

_NIKUD_AND_BIDI = {chr(code) for code in range(0x0591, 0x05C8)} | {
    "\u200e",
    "\u200f",
    "\u202a",
    "\u202b",
    "\u202c",
    "\ufeff",
    "\u2060",
}
_QUOTE_CHARS = set("\"'`״׳„“”«»‘’")
_DASH_CHARS = set("-–—־")
_PUNCT_CHARS = set("!?.,:;•·")
_BOUNDARY_CHARS = set(" -–—־ו")
_FINALS = str.maketrans("ךםןףץ", "כמנפצ")
_LEADERSHIP_MARKERS = (" בראשות ", " בהנהגת ", " לראשות ")
_PARENTHETICAL = re.compile(r"\([^)]*\)")


def _strip_marks(value: str) -> str:
    kept: list[str] = []
    for ch in value:
        if ch in _NIKUD_AND_BIDI or unicodedata.category(ch) in {"Mn", "Cf"}:
            continue
        kept.append(ch)
    return "".join(kept)


def _fold_finals(value: str) -> str:
    return value.translate(_FINALS)


def loose_political_name(value: str | None) -> str:
    """Collapse quotes, dashes, and spacing but keep word boundaries."""
    if not value:
        return ""
    text = _fold_finals(_strip_marks(value)).strip()
    chars: list[str] = []
    for ch in text:
        if ch in _QUOTE_CHARS or ch in _DASH_CHARS or ch in _PUNCT_CHARS:
            chars.append(" ")
        else:
            chars.append(ch)
    return " ".join("".join(chars).split())


def normalize_political_name(value: str | None) -> str:
    """Quote- and space-insensitive key (ש״ס / ש\"ס / שס)."""
    loose = loose_political_name(value)
    return loose.replace(" ", "")


def _leadership_head(text: str) -> str:
    head = text
    for marker in _LEADERSHIP_MARKERS:
        if marker in head:
            head = head.split(marker, 1)[0].strip()
    return head


def _name_variants(value: str | None) -> list[str]:
    loose = loose_political_name(value)
    if not loose:
        return []
    variants = [loose]
    head = _leadership_head(loose)
    if head and head != loose:
        variants.append(head)
    # "הציונות הדתית … וזהות בראשות …" is two lists in one faction title.
    # A bare "ו" without its own leadership phrase stays part of one name.
    search_from = 0
    while True:
        idx = loose.find(" ו", search_from)
        if idx < 0:
            break
        tail = loose[idx + 2 :].strip()
        search_from = idx + 2
        if not any(marker in f" {tail} " for marker in _LEADERSHIP_MARKERS):
            continue
        part = _leadership_head(tail)
        if part:
            variants.append(part)
    return list(dict.fromkeys(variants))


def _shared_leading_words(left: str, right: str, *, minimum: int = 2) -> bool:
    """True when two titles share a leading phrase, then diverge.

    ש"ס is filed as "התאחדות הספרדים שומרי תורה …" on the ballot and
    "התאחדות הספרדים העולמית שומרי תורה" in OData. The first two words
    are the same party; the rest is the legal formula.
    """
    left_words = left.split()
    right_words = right.split()
    if len(left_words) < minimum or len(right_words) < minimum:
        return False
    shared = 0
    for a, b in zip(left_words, right_words):
        if a != b:
            break
        shared += 1
    return shared >= minimum


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
            if _shared_leading_words(a, b):
                return True
    return False


def person_name_key(value: str | None) -> str:
    """Key for "is this the same person" across the election list and OData.

    Drops format characters (a word-joiner was sitting on some list names),
    parenthetical nicknames, quotes, and final-letter spelling. Collapses
    a double yud so עטייה and עטיה meet.
    """
    if not value:
        return ""
    text = _PARENTHETICAL.sub(" ", value)
    text = _fold_finals(_strip_marks(text))
    text = text.replace("יי", "י")
    chars: list[str] = []
    for ch in text:
        if ch in _QUOTE_CHARS:
            continue
        if ch in _DASH_CHARS or ch in _PUNCT_CHARS:
            chars.append(" ")
        else:
            chars.append(ch)
    return " ".join("".join(chars).split())


def _tokens_align(shorter: list[str], longer: list[str]) -> bool:
    """Shorter name is an in-order part of the longer one (middle name added)."""
    if len(shorter) < 2 or len(longer) <= len(shorter):
        return False
    index = 0
    for token in longer:
        if token == shorter[index]:
            index += 1
            if index == len(shorter):
                return True
    return False


def person_names_match(left: str | None, right: str | None) -> bool:
    left_key = person_name_key(left)
    right_key = person_name_key(right)
    if not left_key or not right_key:
        return False
    if left_key == right_key:
        return True
    left_tokens = left_key.split()
    right_tokens = right_key.split()
    return _tokens_align(left_tokens, right_tokens) or _tokens_align(
        right_tokens, left_tokens
    )


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
class PersonName:
    person_id: int
    full_name: str | None = None
    knesset_person_id: int | None = None


@dataclass(frozen=True)
class PersonBridge:
    """Membership person → election-list person, for the provisional lookup only.

    This does not merge `people` rows. A pair whose `knesset_person_id` values
    are both set and different is a different person (two אלי כהן), not a duplicate.
    """

    member_to_candidate: dict[int, int]
    kpid_conflicts: int
    ambiguous: int


def _kpid_compatible(member: PersonName, candidate: PersonName) -> bool:
    if member.knesset_person_id is None or candidate.knesset_person_id is None:
        return True
    return member.knesset_person_id == candidate.knesset_person_id


def bridge_member_people(
    members: list[PersonName],
    candidates: list[PersonName],
) -> PersonBridge:
    """Point a Knesset person at the list row when the normalized name is unique.

    The election import and the OData person sync often created two `people`
    rows for one MK. The list row usually has no `knesset_person_id` yet.
    """
    candidate_ids = {person.person_id for person in candidates}
    matches: dict[int, int] = {}
    claimed: dict[int, list[int]] = {}
    conflicts = 0
    ambiguous = 0
    for member in members:
        if member.person_id in candidate_ids:
            continue
        hits: list[int] = []
        saw_conflict = False
        for candidate in candidates:
            if not person_names_match(member.full_name, candidate.full_name):
                continue
            if not _kpid_compatible(member, candidate):
                saw_conflict = True
                continue
            hits.append(candidate.person_id)
        unique = list(dict.fromkeys(hits))
        if len(unique) != 1:
            if saw_conflict and not unique:
                conflicts += 1
            elif len(unique) > 1:
                ambiguous += 1
            continue
        matches[member.person_id] = unique[0]
        claimed.setdefault(unique[0], []).append(member.person_id)
    kept = {
        member_id: candidate_id
        for member_id, candidate_id in matches.items()
        if len(claimed[candidate_id]) == 1
    }
    ambiguous += sum(1 for ids in claimed.values() if len(ids) > 1)
    return PersonBridge(
        member_to_candidate=kept,
        kpid_conflicts=conflicts,
        ambiguous=ambiguous,
    )


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


# Null faction_id on a brand-new Knesset is a warning until this many days
# after knessets.start_date. Override with NULL_FACTION_GRACE_DAYS.
# NULL_FACTION_WARN_ONLY=true keeps the warning after the grace ends.
NULL_FACTION_GRACE_DAYS = 14
_ISRAEL_TZ = ZoneInfo("Asia/Jerusalem")


def null_faction_grace_days() -> int:
    raw = os.environ.get("NULL_FACTION_GRACE_DAYS", "").strip()
    if not raw:
        return NULL_FACTION_GRACE_DAYS
    try:
        days = int(raw)
    except ValueError:
        return NULL_FACTION_GRACE_DAYS
    if days < 0:
        return NULL_FACTION_GRACE_DAYS
    return days


def null_faction_warn_only() -> bool:
    return os.environ.get("NULL_FACTION_WARN_ONLY", "").strip().lower() in {
        "1",
        "true",
        "yes",
        "on",
    }


def null_factions_are_warning(
    start: date | None,
    *,
    today: date,
    grace_days: int,
    warn_only: bool,
) -> bool:
    """True while a null faction_id should not fail the consistency job.

    The grace is the current Knesset's start date being less than `grace_days`
    ago. A missing start date does not get the grace. warn_only extends it.
    """
    if warn_only:
        return True
    if start is None:
        return False
    return (today - start).days < grace_days


def israel_today(now: datetime | None = None) -> date:
    if now is None:
        now = datetime.now(_ISRAEL_TZ)
    elif now.tzinfo is None:
        now = now.replace(tzinfo=_ISRAEL_TZ)
    else:
        now = now.astimezone(_ISRAEL_TZ)
    return now.date()


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
    current_knesset_start: date | None = None


def evaluate_consistency(
    facts: ConsistencyFacts,
    *,
    today: date | None = None,
    grace_days: int | None = None,
    warn_only: bool | None = None,
) -> dict:
    """Return ok/issues/warnings for the knesset pipeline consistency step.

    `ok` ignores warnings. A null faction_id is a warning during the grace
    window (or while NULL_FACTION_WARN_ONLY is set) and a failure after that.
    Every other check stays a failure.
    """
    issues: list[dict[str, str]] = []
    warnings: list[dict[str, str]] = []
    if today is None:
        today = israel_today()
    if grace_days is None:
        grace_days = null_faction_grace_days()
    if warn_only is None:
        warn_only = null_faction_warn_only()

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
        in_grace = null_factions_are_warning(
            facts.current_knesset_start,
            today=today,
            grace_days=grace_days,
            warn_only=warn_only,
        )
        if facts.current_knesset_start is None:
            when = "start date unknown"
        else:
            age = (today - facts.current_knesset_start).days
            when = (
                f"Knesset started {facts.current_knesset_start.isoformat()} "
                f"({age} days ago; grace {grace_days})"
            )
        if warn_only:
            when = f"{when}; NULL_FACTION_WARN_ONLY"
        message = (
            f"{facts.null_faction_memberships} current-Knesset memberships "
            f"have null faction_id ({when})"
        )
        finding = {"code": "null_faction_memberships", "message": message}
        if in_grace:
            warnings.append(finding)
        else:
            issues.append(finding)

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
        "warnings": warnings,
        "current_knesset": current,
        "odata_current_knesset": facts.odata_current_knesset,
        "db_active_knesset": facts.db_active_knesset,
        "null_faction_memberships": facts.null_faction_memberships,
        "provisional_faction_memberships": facts.provisional_faction_memberships,
        "odata_current_government": facts.odata_current_government,
        "db_active_government": facts.db_active_government,
        "active_government_open_appointments": facts.active_government_open_appointments,
    }

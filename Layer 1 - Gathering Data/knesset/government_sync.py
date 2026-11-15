"""Official government, office, and appointment plans from Knesset OData rows.

There is no KNS_Government entity (confirmed against ParliamentInfo.svc
$metadata). A government is a distinct GovernmentNum on ministerial
KNS_PersonToPosition rows (GovernmentNum and GovMinistryID both set).
KNS_GovMinistry supplies offices.

Curated values already stored on a government — knesset_id, start_date, and
end_date — are never replaced. is_active follows the current GovernmentNum.
A previous active government is closed only by filling a null end_date.
Office display names and minister is_acting are not overwritten.
"""

from __future__ import annotations

from dataclasses import dataclass


def _flag(value: object) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return value == 1
    if isinstance(value, str):
        return value.strip().lower() in {"true", "1", "yes"}
    return False


def _as_int(value: object) -> int | None:
    if value is None or isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        return int(value)
    text = str(value).strip()
    if not text:
        return None
    try:
        return int(float(text))
    except ValueError:
        return None


def _as_date(value: object) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    if len(text) >= 10 and text[4] == "-" and text[7] == "-":
        return text[:10]
    return None


def _text(value: object) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def is_ministerial_position(row: dict) -> bool:
    """Appointment rows: both government number and ministry are set."""
    return (
        _as_int(row.get("GovernmentNum")) is not None
        and _as_int(row.get("GovMinistryID")) is not None
    )


@dataclass(frozen=True)
class GovernmentAggregate:
    government_number: int
    start_date: str | None
    end_date: str | None
    knesset_number: int | None
    is_current: bool


@dataclass(frozen=True)
class GovernmentExisting:
    government_number: int
    knesset_id: int | None
    start_date: str | None
    end_date: str | None
    is_active: bool


@dataclass(frozen=True)
class GovernmentSyncPlan:
    """deactivate_rows must be applied before upsert_rows (one active government)."""

    deactivate_rows: list[dict]
    upsert_rows: list[dict]
    skipped: list[tuple[int, str]]


def aggregate_governments(rows: list[dict]) -> dict[int, GovernmentAggregate]:
    """One aggregate per GovernmentNum on ministerial positions."""
    grouped: dict[int, list[dict]] = {}
    for row in rows:
        if not is_ministerial_position(row):
            continue
        number = _as_int(row.get("GovernmentNum"))
        if number is None:
            continue
        grouped.setdefault(number, []).append(row)

    aggregates: dict[int, GovernmentAggregate] = {}
    for number, items in grouped.items():
        dated: list[tuple[str, int | None]] = []
        finishes: list[str] = []
        knessets: list[int] = []
        any_current = False
        all_finished = True
        for row in items:
            start = _as_date(row.get("StartDate"))
            finish = _as_date(row.get("FinishDate"))
            knesset = _as_int(row.get("KnessetNum"))
            if _flag(row.get("IsCurrent")):
                any_current = True
            if start is not None:
                dated.append((start, knesset))
            if knesset is not None:
                knessets.append(knesset)
            if finish is None:
                all_finished = False
            else:
                finishes.append(finish)

        knesset_number: int | None = None
        if dated:
            earliest = min(start for start, _knesset in dated)
            earliest_knessets = [
                knesset
                for start, knesset in dated
                if start == earliest and knesset is not None
            ]
            if earliest_knessets:
                knesset_number = min(earliest_knessets)
        elif knessets:
            knesset_number = min(knessets)

        end_date = max(finishes) if all_finished and finishes and not any_current else None
        aggregates[number] = GovernmentAggregate(
            government_number=number,
            start_date=min(start for start, _knesset in dated) if dated else None,
            end_date=end_date,
            knesset_number=knesset_number,
            is_current=any_current,
        )
    return aggregates


def current_government_numbers(rows: list[dict]) -> list[int]:
    """GovernmentNum values that still have an IsCurrent ministerial position."""
    return sorted(
        number
        for number, aggregate in aggregate_governments(rows).items()
        if aggregate.is_current
    )


def select_current_government_number(numbers: list[int]) -> int | None:
    if not numbers:
        return None
    return max(numbers)


def _end_on_or_after(end: str | None, start: str | None) -> str | None:
    """governments.end_date has a check that end_date >= start_date."""
    if end is None:
        return None
    if start is not None and end < start:
        return None
    return end


def _close_date(
    aggregate: GovernmentAggregate,
    existing: GovernmentExisting | None,
    *,
    odata_current: int | None,
    successor_start: str | None,
    trust_end: bool = True,
) -> str | None:
    """A date for a null end_date, or None when there is nothing official to write.

    trust_end is false for an incremental position batch: a subset of FinishDate
    values must not close a government, and a touched historical row must not
    either. The previous active row can still close when a newer current number
    is known, using that successor's start date.
    """
    if odata_current is not None and aggregate.government_number == odata_current:
        return None
    if trust_end and not aggregate.is_current and aggregate.end_date is not None:
        return aggregate.end_date
    closing_previous = (
        odata_current is not None
        and aggregate.government_number != odata_current
        and (
            (existing is not None and existing.is_active)
            or (trust_end and aggregate.is_current)
        )
    )
    if closing_previous:
        return successor_start
    return None


# Pass as odata_current to derive the current number from the aggregates.
CURRENT_UNSET: object = object()


def plan_government_sync(
    aggregates: dict[int, GovernmentAggregate],
    existing: dict[int, GovernmentExisting],
    knesset_id_by_number: dict[int, int],
    *,
    odata_current: int | None | object = CURRENT_UNSET,
    trust_end: bool = True,
) -> GovernmentSyncPlan:
    """Insert missing governments and move is_active. Never overwrite curated dates.

    An empty aggregate (failed or empty feed) changes nothing, so a partial
    download cannot retire the sitting government.

    Incremental sync passes the current number from a complete `IsCurrent eq true`
    query and trust_end=False. Absent governments are still deactivated when that
    number replaces the active one. Their end_date comes from the successor's
    start, not from FinishDate values that happened to be in the batch.
    """
    if not aggregates and odata_current is CURRENT_UNSET:
        return GovernmentSyncPlan(deactivate_rows=[], upsert_rows=[], skipped=[])

    current_numbers = sorted(
        number for number, aggregate in aggregates.items() if aggregate.is_current
    )
    if odata_current is CURRENT_UNSET:
        odata_current = select_current_government_number(current_numbers)
    elif odata_current is not None:
        odata_current = int(odata_current)
    successor_start = (
        aggregates[odata_current].start_date if odata_current in aggregates else None
    )

    deactivate_rows: list[dict] = []
    upsert_rows: list[dict] = []
    skipped: list[tuple[int, str]] = []

    def queue(row: dict, *, was_active: bool) -> None:
        if was_active and row.get("is_active") is False:
            deactivate_rows.append(row)
        else:
            upsert_rows.append(row)

    for number, ex in existing.items():
        if number in aggregates or odata_current is None:
            continue
        if not ex.is_active or number == odata_current:
            continue
        payload: dict = {"government_number": number, "is_active": False}
        if ex.end_date is None:
            end = _end_on_or_after(successor_start, ex.start_date)
            if end is not None:
                payload["end_date"] = end
        deactivate_rows.append(payload)

    for number, aggregate in sorted(aggregates.items()):
        ex = existing.get(number)
        knesset_id = (
            knesset_id_by_number.get(aggregate.knesset_number)
            if aggregate.knesset_number is not None
            else None
        )
        desired_active = (
            number == odata_current if odata_current is not None else (bool(ex.is_active) if ex else False)
        )
        start_ref = ex.start_date if ex and ex.start_date else aggregate.start_date
        end = None
        # A government that stays active keeps a null end_date. An end is written
        # only when this number is not the current one, and only into a null.
        if not desired_active and (ex is None or ex.end_date is None):
            end = _end_on_or_after(
                _close_date(
                    aggregate,
                    ex,
                    odata_current=odata_current,
                    successor_start=successor_start,
                    trust_end=trust_end,
                ),
                start_ref,
            )

        if ex is None:
            if knesset_id is None:
                skipped.append((number, "missing knesset_id"))
                continue
            if aggregate.start_date is None:
                skipped.append((number, "missing start_date"))
                continue
            row = {
                "government_number": number,
                "knesset_id": knesset_id,
                "start_date": aggregate.start_date,
                "is_active": desired_active,
            }
            if end is not None:
                row["end_date"] = end
            upsert_rows.append(row)
            continue

        payload = {"government_number": number}
        if ex.knesset_id is None and knesset_id is not None:
            payload["knesset_id"] = knesset_id
        if ex.start_date is None and aggregate.start_date is not None:
            payload["start_date"] = aggregate.start_date
        if end is not None:
            payload["end_date"] = end
        if odata_current is not None and bool(ex.is_active) != desired_active:
            payload["is_active"] = desired_active
        if len(payload) == 1:
            continue
        queue(payload, was_active=bool(ex.is_active))

    return GovernmentSyncPlan(
        deactivate_rows=deactivate_rows,
        upsert_rows=upsert_rows,
        skipped=skipped,
    )


def _office_active(row: dict) -> bool:
    if "IsActive" not in row or row.get("IsActive") is None:
        return True
    return _flag(row.get("IsActive"))


def plan_office_writes(
    api_rows: list[dict],
    existing: dict[int, dict],
    *,
    close_missing: bool = True,
) -> list[dict]:
    """Mirror KNS_GovMinistry. `name` is set on insert only.

    Offices missing from a non-empty feed are closed (is_active false) only when
    close_missing is true (a full refresh). An incremental batch must not retire
    a ministry that simply was not updated. An empty feed closes nothing either
    way. A ministry that is in the batch with IsActive false is still closed.
    info, logo, news feed, is_shown, and name_en are absent from every payload.
    """
    by_id: dict[int, dict] = {}
    for row in api_rows:
        category_id = _as_int(row.get("GovMinistryID"))
        if category_id is None:
            continue
        by_id[category_id] = row

    writes: list[dict] = []
    for category_id, row in by_id.items():
        name = row.get("Name")
        active = _office_active(row)
        current = existing.get(category_id)
        if current is None:
            writes.append(
                {
                    "knesset_category_id": category_id,
                    "knesset_category_name": name,
                    "name": name,
                    "is_active": active,
                }
            )
            continue
        payload: dict = {"knesset_category_id": category_id}
        if _text(current.get("knesset_category_name")) != _text(name):
            payload["knesset_category_name"] = name
        if bool(current.get("is_active")) != active:
            payload["is_active"] = active
        if len(payload) > 1:
            writes.append(payload)

    if by_id and close_missing:
        for category_id, current in existing.items():
            if category_id in by_id:
                continue
            if bool(current.get("is_active")):
                writes.append(
                    {"knesset_category_id": category_id, "is_active": False}
                )
    return writes


def prepare_office_writes(
    rows: list[dict],
    existing_ids: set[int],
) -> tuple[list[dict], list[tuple[int, str]]]:
    """Drop nameless inserts and never send `name` on an existing office.

    `name` is NOT NULL. A partial upsert of an existing ministry (is_active only)
    is still an INSERT ... ON CONFLICT in Postgres, and the missing name fails
    the statement before the conflict is applied.
    """
    prepared: list[dict] = []
    skipped: list[tuple[int, str]] = []
    for row in rows:
        category_id = _as_int(row.get("knesset_category_id"))
        if category_id is None:
            continue
        if category_id in existing_ids:
            prepared.append(
                {key: value for key, value in row.items() if key != "name"}
            )
            continue
        if not _text(row.get("name")):
            skipped.append((category_id, "missing name"))
            continue
        prepared.append(row)
    return prepared, skipped


def appointment_payload(
    row: dict,
    *,
    person_id: int,
    government_id: int,
    office_id: int,
    is_new: bool,
) -> dict:
    """Official appointment fields. is_acting is insert-only (not in OData)."""
    payload = {
        "knesset_position_id": _as_int(row.get("PersonToPositionID")),
        "person_id": person_id,
        "government_id": government_id,
        "office_id": office_id,
        "start_date": _as_date(row.get("StartDate")),
        "end_date": _as_date(row.get("FinishDate")),
        "is_current": _flag(row.get("IsCurrent")),
        "duty_desc": row.get("DutyDesc"),
    }
    if is_new:
        payload["is_acting"] = False
    return payload

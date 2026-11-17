"""Hand edits from /knesset/edit that later syncs must not clobber.

people.manual_fields lists person columns Amir edited. knesset_memberships.
faction_id_manual marks a faction he set. Official OData FactionID still wins
and clears that flag. See schema_knesset_member_edits.sql.
"""

from __future__ import annotations

import logging

from knesset_term import person_image_is_manual

log = logging.getLogger(__name__)

FACTION_MANUAL_COLUMN = "faction_id_manual"
PERSON_MANUAL_COLUMN = "manual_fields"


def column_ready(sb, table: str, column: str) -> bool:
    try:
        sb.table(table).select(column).limit(1).execute()
        return True
    except Exception as exc:
        log.warning("%s.%s is missing (%s)", table, column, exc)
        return False


def load_person_field_locks(sb) -> dict[int, set[str]]:
    """knesset_person_id → locked people columns. Empty when the column is absent."""
    if not column_ready(sb, "people", PERSON_MANUAL_COLUMN):
        return {}

    locks: dict[int, set[str]] = {}
    page_size = 1000
    offset = 0
    while True:
        rows = (
            sb.table("people")
            .select(f"knesset_person_id, {PERSON_MANUAL_COLUMN}")
            .range(offset, offset + page_size - 1)
            .execute()
            .data
            or []
        )
        for row in rows:
            person_key = row.get("knesset_person_id")
            if person_key is None:
                continue
            fields = row.get(PERSON_MANUAL_COLUMN) or []
            if isinstance(fields, list) and fields:
                locks[int(person_key)] = {str(field) for field in fields}
        if len(rows) < page_size:
            break
        offset += page_size
    return locks


def apply_static_mk_image(
    sb,
    full_name: str,
    image_url: str,
    *,
    manual_column_ready: bool,
) -> bool:
    """Point matching people at a static JPEG unless their photo was set by hand."""
    columns = "id, manual_fields" if manual_column_ready else "id"
    rows = (
        sb.table("people").select(columns).eq("full_name", full_name).execute().data
        or []
    )
    updated = False
    for row in rows:
        if manual_column_ready and person_image_is_manual(row.get("manual_fields")):
            continue
        if row.get("id") is None:
            continue
        sb.table("people").update({"image_url": image_url}).eq("id", row["id"]).execute()
        updated = True
    return updated

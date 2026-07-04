#!/usr/bin/env python3
"""Backfill historical Knesset membership faction links.

The /knesset page renders a final-composition snapshot for historical terms:
ref_date = knessets.end_date, or today for the active Knesset. This script uses
the same reference date and fills missing/stale knesset_memberships.faction_id
values from Open Knesset's member-faction history.

Default mode is a dry run:
  python fix_faction_links_all.py

Apply audited changes:
  python fix_faction_links_all.py --apply
"""

from __future__ import annotations

import argparse
import os
from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import date
from typing import Any

import pandas as pd
from dotenv import load_dotenv
from supabase import Client, create_client


OPEN_KNESSET_FACTIONS_CSV = (
    "https://production.oknesset.org/pipelines/data/members/"
    "mk_individual/mk_individual_factions.csv"
)
OPEN_KNESSET_MEMBERS_CSV = (
    "https://production.oknesset.org/pipelines/data/members/"
    "mk_individual/mk_individual.csv"
)
PAGE_SIZE = 1000


@dataclass(frozen=True)
class SourceFaction:
    person_id: int
    knesset_number: int
    faction_id: int
    faction_name: str
    start_date: str


@dataclass(frozen=True)
class PlannedUpdate:
    membership_id: int
    knesset_number: int
    person_name: str
    source_person_id: int
    current_faction_id: int | None
    target_faction_id: int
    source_faction_id: int
    faction_name: str
    membership_start_date: str | None
    membership_end_date: str | None
    reference_date: str


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Backfill knesset_memberships.faction_id from Open Knesset history."
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Write planned updates to Supabase. Omit for dry-run mode.",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Optional cap on writes in --apply mode, useful for spot checks.",
    )
    parser.add_argument(
        "--examples",
        type=int,
        default=20,
        help="Number of planned update examples to print.",
    )
    return parser.parse_args()


def get_supabase() -> Client:
    load_dotenv()
    url = os.environ["SUPABASE_URL"]
    key = os.environ["SUPABASE_SERVICE_KEY"]
    return create_client(url, key)


def fetch_all(
    supabase: Client,
    table: str,
    select: str,
    *,
    page_size: int = PAGE_SIZE,
) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    offset = 0

    while True:
        chunk = (
            supabase.table(table)
            .select(select)
            .range(offset, offset + page_size - 1)
            .execute()
            .data
        )
        if not chunk:
            break

        rows.extend(chunk)
        if len(chunk) < page_size:
            break

        offset += page_size

    return rows


def normalize_int(value: Any) -> int | None:
    if pd.isna(value):
        return None
    return int(value)


def normalize_date(value: Any) -> str | None:
    if pd.isna(value) or value is None:
        return None
    return str(value)[:10]


def reference_date(knesset: dict[str, Any]) -> str:
    return normalize_date(knesset.get("end_date")) or date.today().isoformat()


def is_active_at_snapshot(membership: dict[str, Any], ref_date: str) -> bool:
    start_date = normalize_date(membership.get("start_date"))
    end_date = normalize_date(membership.get("end_date"))

    if not start_date or start_date > ref_date:
        return False

    return end_date is None or end_date >= ref_date


def load_source_factions() -> dict[tuple[int, int], list[SourceFaction]]:
    factions_df = pd.read_csv(OPEN_KNESSET_FACTIONS_CSV)
    members_df = pd.read_csv(OPEN_KNESSET_MEMBERS_CSV)

    merged = factions_df.merge(
        members_df[["mk_individual_id", "PersonID"]],
        on="mk_individual_id",
    ).dropna(subset=["PersonID", "knesset", "faction_id", "start_date"])

    source_by_person_and_knesset: dict[tuple[int, int], list[SourceFaction]] = (
        defaultdict(list)
    )

    for _, row in merged.iterrows():
        person_id = normalize_int(row["PersonID"])
        knesset_number = normalize_int(row["knesset"])
        faction_id = normalize_int(row["faction_id"])
        start_date = normalize_date(row["start_date"])

        if not person_id or not knesset_number or not faction_id or not start_date:
            continue

        source_by_person_and_knesset[(person_id, knesset_number)].append(
            SourceFaction(
                person_id=person_id,
                knesset_number=knesset_number,
                faction_id=faction_id,
                faction_name=str(row.get("faction_name") or ""),
                start_date=start_date,
            )
        )

    for rows in source_by_person_and_knesset.values():
        rows.sort(key=lambda row: row.start_date)

    return source_by_person_and_knesset


def select_source_faction(
    source_rows: list[SourceFaction],
    ref_date: str,
) -> SourceFaction | None:
    active_rows = [row for row in source_rows if row.start_date <= ref_date]
    if not active_rows:
        return None
    return active_rows[-1]


def plan_updates(
    people: list[dict[str, Any]],
    knessets: list[dict[str, Any]],
    factions: list[dict[str, Any]],
    memberships: list[dict[str, Any]],
    source_factions: dict[tuple[int, int], list[SourceFaction]],
) -> tuple[list[PlannedUpdate], Counter[str]]:
    people_by_id = {row["id"]: row for row in people}
    knessets_by_id = {row["id"]: row for row in knessets}
    factions_by_source_id = {
        row["knesset_faction_id"]: row
        for row in factions
        if row.get("knesset_faction_id") is not None
    }

    planned_updates: list[PlannedUpdate] = []
    skipped: Counter[str] = Counter()

    for membership in memberships:
        knesset = knessets_by_id.get(membership.get("knesset_id"))
        if not knesset:
            skipped["missing_knesset"] += 1
            continue

        ref_date = reference_date(knesset)
        if not is_active_at_snapshot(membership, ref_date):
            skipped["not_snapshot_member"] += 1
            continue

        person = people_by_id.get(membership.get("person_id"))
        if not person or person.get("knesset_person_id") is None:
            skipped["missing_person"] += 1
            continue

        source_person_id = int(person["knesset_person_id"])
        knesset_number = int(knesset["knesset_number"])
        source_rows = source_factions.get((source_person_id, knesset_number), [])
        source_faction = select_source_faction(source_rows, ref_date)

        if not source_faction:
            skipped["no_source_faction_at_snapshot"] += 1
            continue

        target_faction = factions_by_source_id.get(source_faction.faction_id)
        if not target_faction:
            skipped["missing_faction_row"] += 1
            continue

        if target_faction.get("knesset_id") != membership.get("knesset_id"):
            skipped["faction_knesset_mismatch"] += 1
            continue

        target_faction_id = int(target_faction["id"])
        current_faction_id = membership.get("faction_id")
        if current_faction_id == target_faction_id:
            skipped["unchanged"] += 1
            continue

        planned_updates.append(
            PlannedUpdate(
                membership_id=int(membership["id"]),
                knesset_number=knesset_number,
                person_name=str(person.get("full_name") or source_person_id),
                source_person_id=source_person_id,
                current_faction_id=(
                    int(current_faction_id) if current_faction_id is not None else None
                ),
                target_faction_id=target_faction_id,
                source_faction_id=source_faction.faction_id,
                faction_name=source_faction.faction_name,
                membership_start_date=normalize_date(membership.get("start_date")),
                membership_end_date=normalize_date(membership.get("end_date")),
                reference_date=ref_date,
            )
        )

    return planned_updates, skipped


def print_report(
    planned_updates: list[PlannedUpdate],
    skipped: Counter[str],
    *,
    apply: bool,
    examples: int,
) -> None:
    mode = "APPLY" if apply else "DRY RUN"
    by_knesset = Counter(update.knesset_number for update in planned_updates)
    null_updates_by_knesset = Counter(
        update.knesset_number
        for update in planned_updates
        if update.current_faction_id is None
    )
    changed_updates_by_knesset = Counter(
        update.knesset_number
        for update in planned_updates
        if update.current_faction_id is not None
    )

    print(f"\nMode: {mode}")
    print(f"Planned updates: {len(planned_updates)}")

    if by_knesset:
        print("\nPlanned updates by Knesset:")
        for knesset_number in sorted(by_knesset):
            print(
                "  Knesset {k}: total={total}, null={null}, changed={changed}".format(
                    k=knesset_number,
                    total=by_knesset[knesset_number],
                    null=null_updates_by_knesset[knesset_number],
                    changed=changed_updates_by_knesset[knesset_number],
                )
            )

    print("\nSkipped rows:")
    for reason, count in skipped.most_common():
        print(f"  {reason}: {count}")

    if planned_updates and examples > 0:
        print(f"\nFirst {min(examples, len(planned_updates))} planned updates:")
        for update in planned_updates[:examples]:
            print(
                "  membership={membership_id} | K{knesset_number} | {person_name} | "
                "{current_faction_id} -> {target_faction_id} "
                "(source {source_faction_id}, {faction_name}, ref {reference_date})".format(
                    **update.__dict__
                )
            )


def apply_updates(
    supabase: Client,
    planned_updates: list[PlannedUpdate],
    *,
    limit: int | None,
) -> int:
    updates = planned_updates[:limit] if limit is not None else planned_updates

    for index, update in enumerate(updates, start=1):
        supabase.table("knesset_memberships").update(
            {"faction_id": update.target_faction_id}
        ).eq("id", update.membership_id).execute()

        if index % 50 == 0:
            print(f"  applied {index}/{len(updates)} updates...")

    return len(updates)


def main() -> None:
    args = parse_args()
    supabase = get_supabase()

    print("Loading Open Knesset faction history...")
    source_factions = load_source_factions()

    print("Loading Supabase lookup tables with pagination...")
    people = fetch_all(supabase, "people", "id,knesset_person_id,full_name")
    knessets = fetch_all(
        supabase,
        "knessets",
        "id,knesset_number,start_date,end_date,is_active",
    )
    factions = fetch_all(
        supabase,
        "knesset_factions",
        "id,knesset_faction_id,knesset_id,name,short_name",
    )
    memberships = fetch_all(
        supabase,
        "knesset_memberships",
        "id,knesset_id,person_id,faction_id,start_date,end_date",
    )

    print(
        "Loaded: people={people}, knessets={knessets}, factions={factions}, "
        "memberships={memberships}, source_keys={source_keys}".format(
            people=len(people),
            knessets=len(knessets),
            factions=len(factions),
            memberships=len(memberships),
            source_keys=len(source_factions),
        )
    )

    planned_updates, skipped = plan_updates(
        people,
        knessets,
        factions,
        memberships,
        source_factions,
    )
    print_report(
        planned_updates,
        skipped,
        apply=args.apply,
        examples=args.examples,
    )

    if not args.apply:
        print("\nDry run only. Re-run with --apply to write these updates.")
        return

    if not planned_updates:
        print("\nNo updates to apply.")
        return

    applied = apply_updates(supabase, planned_updates, limit=args.limit)
    print(f"\nDone. Applied {applied} updates.")


if __name__ == "__main__":
    main()
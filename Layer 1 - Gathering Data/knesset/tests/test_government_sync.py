"""Government, office, and appointment plans from official OData rows."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from government_sync import (  # noqa: E402
    GovernmentExisting,
    aggregate_governments,
    appointment_payload,
    current_government_numbers,
    plan_government_sync,
    plan_office_writes,
    select_current_government_number,
)


def _position(**overrides: object) -> dict:
    row = {
        "PersonToPositionID": 1,
        "GovernmentNum": 37,
        "GovMinistryID": 568,
        "KnessetNum": 25,
        "StartDate": "2022-12-29",
        "FinishDate": None,
        "IsCurrent": True,
        "DutyDesc": "ראש הממשלה",
    }
    row.update(overrides)
    return row


class GovernmentAggregateTests(unittest.TestCase):
    def test_current_number_is_highest_iscurrent_government(self) -> None:
        rows = [
            _position(GovernmentNum=36, IsCurrent=False, FinishDate="2022-12-29"),
            _position(
                PersonToPositionID=2,
                GovernmentNum=37,
                KnessetNum=26,
                StartDate="2026-11-10",
                IsCurrent=True,
            ),
            _position(PersonToPositionID=3, GovernmentNum=None, GovMinistryID=1),
            _position(PersonToPositionID=4, GovernmentNum=38, GovMinistryID=None),
        ]
        self.assertEqual(current_government_numbers(rows), [37])
        self.assertEqual(select_current_government_number([36, 37]), 37)
        self.assertIsNone(select_current_government_number([]))

    def test_formation_knesset_and_start_ignore_later_appointments(self) -> None:
        rows = [
            _position(StartDate="2022-12-29", KnessetNum=25, IsCurrent=False, FinishDate="2026-11-10"),
            _position(
                PersonToPositionID=2,
                StartDate="2026-11-10",
                KnessetNum=26,
                IsCurrent=True,
                FinishDate=None,
            ),
        ]
        aggregate = aggregate_governments(rows)[37]
        self.assertEqual(aggregate.start_date, "2022-12-29")
        self.assertEqual(aggregate.knesset_number, 25)
        self.assertIsNone(aggregate.end_date)
        self.assertTrue(aggregate.is_current)


class GovernmentPlanTests(unittest.TestCase):
    def test_new_government_closes_previous_without_touching_curated_fields(self) -> None:
        existing = {
            37: GovernmentExisting(37, knesset_id=11, start_date="2022-12-29", end_date=None, is_active=True)
        }
        rows = [
            _position(IsCurrent=False, FinishDate="2027-03-01"),
            _position(
                PersonToPositionID=8,
                GovernmentNum=38,
                KnessetNum=26,
                StartDate="2027-03-01",
                FinishDate=None,
                IsCurrent=True,
                GovMinistryID=568,
            ),
        ]
        plan = plan_government_sync(
            aggregate_governments(rows),
            existing,
            {25: 11, 26: 22},
        )
        self.assertEqual(
            plan.deactivate_rows,
            [
                {
                    "government_number": 37,
                    "is_active": False,
                    "end_date": "2027-03-01",
                }
            ],
        )
        self.assertEqual(
            plan.upsert_rows,
            [
                {
                    "government_number": 38,
                    "knesset_id": 22,
                    "start_date": "2027-03-01",
                    "is_active": True,
                }
            ],
        )
        self.assertEqual(plan.skipped, [])

    def test_caretaker_government_is_left_unchanged(self) -> None:
        existing = {
            37: GovernmentExisting(
                37,
                knesset_id=11,
                start_date="2022-12-29",
                end_date=None,
                is_active=True,
            )
        }
        rows = [
            _position(IsCurrent=False, FinishDate="2026-11-10", KnessetNum=25),
            _position(
                PersonToPositionID=2,
                StartDate="2026-11-10",
                KnessetNum=26,
                IsCurrent=True,
            ),
        ]
        plan = plan_government_sync(aggregate_governments(rows), existing, {25: 11, 26: 22})
        self.assertEqual(plan.deactivate_rows, [])
        self.assertEqual(plan.upsert_rows, [])

    def test_curated_dates_and_knesset_are_not_overwritten(self) -> None:
        existing = {
            37: GovernmentExisting(
                37,
                knesset_id=99,
                start_date="2022-12-01",
                end_date="2026-11-09",
                is_active=True,
            )
        }
        rows = [
            _position(IsCurrent=False, FinishDate="2026-11-10", StartDate="2022-12-29"),
            _position(
                PersonToPositionID=2,
                GovernmentNum=38,
                KnessetNum=26,
                StartDate="2026-11-10",
                IsCurrent=True,
            ),
        ]
        plan = plan_government_sync(aggregate_governments(rows), existing, {25: 11, 26: 22})
        self.assertEqual(
            plan.deactivate_rows,
            [{"government_number": 37, "is_active": False}],
        )
        self.assertEqual(plan.upsert_rows[0]["government_number"], 38)
        self.assertNotIn(37, {row["government_number"] for row in plan.upsert_rows})

    def test_null_metadata_is_filled_and_second_plan_is_empty(self) -> None:
        rows = [
            _position(IsCurrent=False, FinishDate="2026-11-10"),
        ]
        # Still current via a second open row so end_date stays null.
        rows.append(_position(PersonToPositionID=2, IsCurrent=True, StartDate="2026-11-10", KnessetNum=26))
        aggregates = aggregate_governments(rows)
        first = plan_government_sync(
            aggregates,
            {
                37: GovernmentExisting(37, None, None, None, True),
            },
            {25: 11, 26: 22},
        )
        self.assertEqual(
            first.upsert_rows,
            [
                {
                    "government_number": 37,
                    "knesset_id": 11,
                    "start_date": "2022-12-29",
                }
            ],
        )
        filled = GovernmentExisting(37, 11, "2022-12-29", None, True)
        second = plan_government_sync(aggregates, {37: filled}, {25: 11, 26: 22})
        self.assertEqual(second.upsert_rows, [])
        self.assertEqual(second.deactivate_rows, [])

    def test_end_date_before_start_is_not_written(self) -> None:
        existing = {
            37: GovernmentExisting(37, 11, "2027-06-01", None, True),
        }
        rows = [
            _position(IsCurrent=False, FinishDate="2027-03-01", StartDate="2022-12-29"),
            _position(
                PersonToPositionID=2,
                GovernmentNum=38,
                KnessetNum=26,
                StartDate="2027-03-01",
                IsCurrent=True,
            ),
        ]
        plan = plan_government_sync(aggregate_governments(rows), existing, {25: 11, 26: 22})
        self.assertEqual(
            plan.deactivate_rows,
            [{"government_number": 37, "is_active": False}],
        )

    def test_missing_knesset_skips_insert(self) -> None:
        rows = [
            _position(
                GovernmentNum=38,
                KnessetNum=26,
                StartDate="2027-03-01",
                IsCurrent=True,
            )
        ]
        plan = plan_government_sync(aggregate_governments(rows), {}, {25: 11})
        self.assertEqual(plan.upsert_rows, [])
        self.assertEqual(plan.skipped, [(38, "missing knesset_id")])

    def test_empty_feed_does_not_retire_the_active_government(self) -> None:
        existing = {37: GovernmentExisting(37, 11, "2022-12-29", None, True)}
        plan = plan_government_sync({}, existing, {25: 11})
        self.assertEqual(plan.deactivate_rows, [])
        self.assertEqual(plan.upsert_rows, [])

    def test_finished_feed_without_a_successor_does_not_close_the_active_row(self) -> None:
        existing = {37: GovernmentExisting(37, 11, "2022-12-29", None, True)}
        rows = [_position(IsCurrent=False, FinishDate="2026-11-10")]
        plan = plan_government_sync(aggregate_governments(rows), existing, {25: 11})
        self.assertEqual(plan.deactivate_rows, [])
        self.assertEqual(plan.upsert_rows, [])

    def test_no_current_signal_keeps_active_flag_and_inserts_history(self) -> None:
        existing = {37: GovernmentExisting(37, 11, "2022-12-29", None, True)}
        rows = [
            _position(
                GovernmentNum=36,
                KnessetNum=24,
                StartDate="2021-06-13",
                FinishDate="2022-12-29",
                IsCurrent=False,
            )
        ]
        plan = plan_government_sync(aggregate_governments(rows), existing, {24: 8})
        self.assertEqual(plan.deactivate_rows, [])
        self.assertEqual(plan.upsert_rows[0]["government_number"], 36)
        self.assertFalse(plan.upsert_rows[0]["is_active"])
        self.assertEqual(plan.upsert_rows[0]["end_date"], "2022-12-29")


class OfficeAndAppointmentTests(unittest.TestCase):
    def test_office_insert_sets_name_and_update_does_not(self) -> None:
        existing = {
            1: {
                "knesset_category_name": "שם ישן",
                "is_active": True,
                "name": "שם שנערך",
            }
        }
        writes = plan_office_writes(
            [
                {"GovMinistryID": 1, "Name": "משרד האוצר", "IsActive": True},
                {"GovMinistryID": 2, "Name": "משרד חדש", "IsActive": False},
            ],
            existing,
        )
        by_id = {row["knesset_category_id"]: row for row in writes}
        self.assertEqual(
            by_id[1],
            {"knesset_category_id": 1, "knesset_category_name": "משרד האוצר"},
        )
        self.assertNotIn("name", by_id[1])
        self.assertEqual(
            by_id[2],
            {
                "knesset_category_id": 2,
                "knesset_category_name": "משרד חדש",
                "name": "משרד חדש",
                "is_active": False,
            },
        )

    def test_missing_office_is_closed_only_when_the_feed_has_rows(self) -> None:
        existing = {5: {"knesset_category_name": "ישן", "is_active": True}}
        closed = plan_office_writes(
            [{"GovMinistryID": 9, "Name": "אחר", "IsActive": True}],
            existing,
        )
        self.assertIn({"knesset_category_id": 5, "is_active": False}, closed)
        self.assertEqual(plan_office_writes([], existing), [])

    def test_inactive_ministry_is_closed_without_renaming(self) -> None:
        writes = plan_office_writes(
            [{"GovMinistryID": 5, "Name": "ישן", "IsActive": False}],
            {5: {"knesset_category_name": "ישן", "is_active": True}},
        )
        self.assertEqual(writes, [{"knesset_category_id": 5, "is_active": False}])

    def test_appointment_close_is_official_and_is_acting_is_insert_only(self) -> None:
        created = appointment_payload(
            _position(FinishDate="2026-11-10", IsCurrent=False),
            person_id=4,
            government_id=7,
            office_id=8,
            is_new=True,
        )
        self.assertEqual(created["end_date"], "2026-11-10")
        self.assertFalse(created["is_current"])
        self.assertFalse(created["is_acting"])

        updated = appointment_payload(
            _position(FinishDate="2026-11-10", IsCurrent=False, DutyDesc="ראש הממשלה"),
            person_id=4,
            government_id=7,
            office_id=8,
            is_new=False,
        )
        self.assertNotIn("is_acting", updated)
        self.assertEqual(updated["duty_desc"], "ראש הממשלה")


if __name__ == "__main__":
    unittest.main()

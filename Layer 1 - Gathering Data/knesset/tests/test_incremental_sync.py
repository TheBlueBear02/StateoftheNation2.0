"""Incremental OData fetch plans, watermarks, and partial-feed closes."""

from __future__ import annotations

import sys
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from government_sync import (  # noqa: E402
    GovernmentExisting,
    aggregate_governments,
    plan_government_sync,
    plan_office_writes,
)
from incremental_sync import (  # noqa: E402
    OVERLAP_BUFFER,
    government_feed,
    is_friday_in_jerusalem,
    normalize_odata_dates,
    plan_entity_fetch,
    resolve_watermarks,
    run_full_reason,
    watermark_after_fetch,
    watermarks_from_run_rows,
)
from odata_client import apply_odata_filter  # noqa: E402


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


class FetchPlanTests(unittest.TestCase):
    def test_missing_watermark_is_a_full_refresh(self) -> None:
        plan = plan_entity_fetch("KNS_PersonToPosition", None, full_reason=None)
        self.assertEqual(plan.mode, "full")
        self.assertEqual(plan.reason, "no-watermark")
        self.assertIsNone(plan.filter_expr)

    def test_watermark_requests_rows_after_the_overlap(self) -> None:
        watermark = datetime(2026, 11, 14, 12, 0, 0)
        plan = plan_entity_fetch("KNS_Person", watermark, full_reason=None)
        self.assertEqual(plan.mode, "incremental")
        self.assertEqual(plan.since, watermark - OVERLAP_BUFFER)
        self.assertEqual(OVERLAP_BUFFER, timedelta(hours=6))
        self.assertEqual(
            plan.filter_expr,
            "LastUpdatedDate gt datetime'2026-11-14T06:00:00'",
        )

    def test_flag_and_friday_force_a_full_refresh(self) -> None:
        watermark = datetime(2026, 11, 14, 12, 0, 0)
        flagged = plan_entity_fetch("KNS_Faction", watermark, full_reason="flag")
        self.assertEqual((flagged.mode, flagged.reason), ("full", "flag"))
        weekly = plan_entity_fetch(
            "KNS_GovMinistry", watermark, full_reason="weekly-friday"
        )
        self.assertEqual(weekly.mode, "full")
        self.assertIsNone(weekly.filter_expr)

    def test_knesset_dates_stay_full(self) -> None:
        plan = plan_entity_fetch(
            "KNS_KnessetDates",
            datetime(2026, 11, 14, 12, 0, 0),
            full_reason=None,
        )
        self.assertEqual(plan.reason, "not-incremental")
        self.assertIsNone(plan.resource)

    def test_friday_follows_jerusalem(self) -> None:
        # November is IST (UTC+2): Friday 23:00 Israel is 21:00 UTC.
        friday_evening = datetime(2026, 11, 13, 21, 0, tzinfo=timezone.utc)
        thursday_evening = datetime(2026, 11, 12, 21, 0, tzinfo=timezone.utc)
        self.assertTrue(is_friday_in_jerusalem(friday_evening))
        self.assertFalse(is_friday_in_jerusalem(thursday_evening))
        self.assertEqual(run_full_reason(False, friday_evening), "weekly-friday")
        self.assertIsNone(run_full_reason(False, thursday_evening))
        # Summer midnight Israel is 21:00 UTC the previous calendar day.
        friday_midnight_idt = datetime(2026, 8, 6, 21, 0, tzinfo=timezone.utc)
        self.assertTrue(is_friday_in_jerusalem(friday_midnight_idt))
        self.assertEqual(run_full_reason(True, thursday_evening), "flag")


class WatermarkTests(unittest.TestCase):
    def test_dates_keep_last_updated_time(self) -> None:
        rows = normalize_odata_dates(
            [
                {
                    "FinishDate": "2026-11-10T00:00:00",
                    "LastUpdatedDate": "2026-11-11T14:34:30.607",
                }
            ]
        )
        self.assertEqual(rows[0]["FinishDate"], "2026-11-10")
        self.assertEqual(rows[0]["LastUpdatedDate"], "2026-11-11T14:34:30.607")

    def test_live_max_advances_and_hasadna_does_not(self) -> None:
        previous = datetime(2026, 11, 1, 0, 0, 0)
        rows = [
            {"LastUpdatedDate": "2026-11-11T14:34:30.607"},
            {"LastUpdatedDate": None},
        ]
        self.assertEqual(
            watermark_after_fetch(previous, rows, source="odata"),
            datetime(2026, 11, 11, 14, 34, 30, 607000),
        )
        self.assertEqual(
            watermark_after_fetch(previous, rows, source="hasadna"),
            previous,
        )
        self.assertIsNone(watermark_after_fetch(None, rows, source="hasadna"))
        self.assertEqual(
            watermark_after_fetch(previous, [], source="odata"),
            previous,
        )

    def test_a_success_without_odata_watermarks_is_not_a_watermark(self) -> None:
        found = watermarks_from_run_rows(
            [
                {
                    "action": "sync-full",
                    "status": "success",
                    "summary": {"elapsed_seconds": 400},
                },
                {
                    "action": "consistency-check",
                    "status": "success",
                    "summary": {
                        "odata_watermarks": {
                            "person": "2026-11-01T00:00:00+00:00",
                        }
                    },
                },
            ]
        )
        self.assertEqual(found, {})

    def test_newest_watermark_wins_and_failures_are_ignored(self) -> None:
        found = resolve_watermarks(
            [
                {
                    "resource": "person",
                    "watermark": "2026-11-14T10:00:00+00:00",
                }
            ],
            [
                {
                    "status": "success",
                    "action": "sync-incremental",
                    "summary": {
                        "odata_watermarks": {
                            "person": "2020-01-01T00:00:00+00:00",
                            "faction": "2026-11-10T08:00:00+00:00",
                        }
                    },
                },
                {
                    "status": "error",
                    "action": "sync-incremental",
                    "summary": {
                        "odata_watermarks": {
                            "person_to_position": "2099-01-01T00:00:00+00:00",
                        }
                    },
                },
            ],
        )
        self.assertEqual(found["person"], datetime(2026, 11, 14, 10, 0, 0))
        self.assertEqual(found["faction"], datetime(2026, 11, 10, 8, 0, 0))
        self.assertNotIn("person_to_position", found)

    def test_hasadna_gt_filter_keeps_only_newer_rows(self) -> None:
        rows = [
            {"PersonID": 1, "LastUpdatedDate": "2026-11-10T12:00:00"},
            {"PersonID": 2, "LastUpdatedDate": "2026-11-14T12:00:00.5"},
            {"PersonID": 3, "LastUpdatedDate": None},
        ]
        filtered = apply_odata_filter(
            rows,
            "LastUpdatedDate gt datetime'2026-11-11T00:00:00'",
        )
        self.assertEqual([row["PersonID"] for row in filtered], [2])


class PartialFetchCloseTests(unittest.TestCase):
    def test_incremental_office_batch_closes_only_rows_it_contains(self) -> None:
        existing = {
            5: {"knesset_category_name": "ישן", "is_active": True},
            9: {"knesset_category_name": "אחר", "is_active": True},
        }
        writes = plan_office_writes(
            [{"GovMinistryID": 9, "Name": "אחר", "IsActive": False}],
            existing,
            close_missing=False,
        )
        self.assertEqual(writes, [{"knesset_category_id": 9, "is_active": False}])

    def test_incremental_batch_does_not_retire_the_sitting_government(self) -> None:
        batch = [
            _position(
                PersonToPositionID=9,
                IsCurrent=False,
                FinishDate="2026-11-14",
            )
        ]
        untouched = list(batch)
        current = [
            _position(PersonToPositionID=2, IsCurrent=True, GovernmentNum=37)
        ]
        feed = government_feed(batch, incremental=True, current_rows=current)
        self.assertEqual(batch, untouched)
        self.assertEqual(feed.odata_current, 37)
        self.assertFalse(feed.trust_end)
        plan = plan_government_sync(
            aggregate_governments(feed.rows),
            {37: GovernmentExisting(37, 11, "2022-12-29", None, True)},
            {25: 11},
            odata_current=feed.odata_current,
            trust_end=feed.trust_end,
        )
        self.assertEqual(plan.deactivate_rows, [])
        self.assertTrue(all("end_date" not in row for row in plan.upsert_rows))

    def test_a_new_current_government_still_closes_the_previous_one(self) -> None:
        batch = [
            _position(
                PersonToPositionID=3,
                GovernmentNum=38,
                KnessetNum=26,
                StartDate="2026-11-14",
                FinishDate=None,
                IsCurrent=True,
            )
        ]
        current = list(batch)
        feed = government_feed(batch, incremental=True, current_rows=current)
        plan = plan_government_sync(
            aggregate_governments(feed.rows),
            {37: GovernmentExisting(37, 11, "2022-12-29", None, True)},
            {25: 11, 26: 12},
            odata_current=feed.odata_current,
            trust_end=feed.trust_end,
        )
        self.assertEqual(
            plan.deactivate_rows,
            [
                {
                    "government_number": 37,
                    "is_active": False,
                    "end_date": "2026-11-14",
                }
            ],
        )

    def test_partial_finish_dates_do_not_fill_an_end_date(self) -> None:
        rows = [
            _position(
                PersonToPositionID=4,
                GovernmentNum=36,
                KnessetNum=24,
                StartDate="2021-06-13",
                FinishDate="2022-01-01",
                IsCurrent=False,
            )
        ]
        existing = {36: GovernmentExisting(36, 8, "2021-06-13", None, False)}
        full = plan_government_sync(
            aggregate_governments(rows),
            existing,
            {24: 8},
        )
        self.assertEqual(full.upsert_rows[0]["end_date"], "2022-01-01")
        partial = plan_government_sync(
            aggregate_governments(rows),
            existing,
            {24: 8},
            odata_current=37,
            trust_end=False,
        )
        self.assertTrue(all("end_date" not in row for row in partial.upsert_rows))
        self.assertEqual(partial.deactivate_rows, [])


if __name__ == "__main__":
    unittest.main()

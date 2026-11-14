"""Current-Knesset committee fetch plans and resume checkpoints."""

from __future__ import annotations

import sys
import unittest
from datetime import datetime, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from committee_incremental import (  # noqa: E402
    SESSION_RESOURCE,
    advance_session_watermark,
    ids_missing,
    session_odata_filter,
    session_query_since,
    sessions_missing_attendance,
)
from incremental_sync import (  # noqa: E402
    OVERLAP_BUFFER,
    resolve_watermarks,
    watermark_after_fetch,
)


class SessionFilterTests(unittest.TestCase):
    def test_filter_is_only_the_given_knesset(self) -> None:
        clause = session_odata_filter(26, None)
        self.assertEqual(clause, "KnessetNum eq 26")
        self.assertNotIn("25", clause)
        self.assertNotIn("LastUpdatedDate", clause)

    def test_watermark_adds_overlap_bound(self) -> None:
        watermark = datetime(2026, 11, 11, 14, 34, 30)
        since = session_query_since(watermark, backfill=False)
        self.assertEqual(since, watermark - OVERLAP_BUFFER)
        clause = session_odata_filter(26, since)
        self.assertIn("KnessetNum eq 26", clause)
        self.assertIn("LastUpdatedDate gt datetime'2026-11-11T08:34:30'", clause)

    def test_backfill_and_missing_watermark_omit_the_date(self) -> None:
        watermark = datetime(2026, 11, 11, 14, 34, 30)
        self.assertIsNone(session_query_since(watermark, backfill=True))
        self.assertIsNone(session_query_since(None, backfill=False))
        self.assertEqual(
            session_odata_filter(26, None),
            "KnessetNum eq 26",
        )


class SkipExistingTests(unittest.TestCase):
    def test_ids_missing_keeps_order_and_drops_existing(self) -> None:
        self.assertEqual(ids_missing([4, 1, 4, 2, 3], {1, 3}), [4, 2])

    def test_attendance_gap_is_the_set_difference(self) -> None:
        self.assertEqual(
            sessions_missing_attendance({10, 11, 12}, {11}),
            {10, 12},
        )


class CheckpointTests(unittest.TestCase):
    def test_watermark_moves_forward_and_ignores_empty_or_dump(self) -> None:
        previous = datetime(2026, 11, 1, 0, 0, 0)
        newer = datetime(2026, 11, 11, 14, 34, 30, 607000)
        rows = [{"LastUpdatedDate": "2026-11-11T14:34:30.607"}]
        self.assertEqual(advance_session_watermark(previous, rows), newer)
        self.assertEqual(advance_session_watermark(newer, []), newer)
        self.assertEqual(
            watermark_after_fetch(previous, rows, source="hasadna"),
            previous,
        )
        self.assertIsNone(advance_session_watermark(None, []))

    def test_success_row_without_watermark_is_not_a_checkpoint(self) -> None:
        found = resolve_watermarks(
            None,
            [
                {
                    "action": "sync",
                    "status": "success",
                    "summary": {"steps": {"sessions": {"upserted": 8}}},
                },
                {
                    "action": "sync",
                    "status": "success",
                    "summary": {
                        "odata_watermarks": {
                            "person": "2026-11-11T14:30:19",
                            SESSION_RESOURCE: "2026-11-11T12:00:00",
                        }
                    },
                },
            ],
            allowed={SESSION_RESOURCE},
        )
        self.assertEqual(
            found,
            {SESSION_RESOURCE: datetime(2026, 11, 11, 12, 0, 0)},
        )
        self.assertNotIn("person", found)

    def test_overlap_is_six_hours(self) -> None:
        self.assertEqual(OVERLAP_BUFFER, timedelta(hours=6))


if __name__ == "__main__":
    unittest.main()

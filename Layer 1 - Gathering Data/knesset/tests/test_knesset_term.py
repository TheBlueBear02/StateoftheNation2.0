"""Unit tests for current-Knesset selection and provisional faction links."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from knesset_term import (  # noqa: E402
    ConsistencyFacts,
    FactionRef,
    MembershipFactionState,
    PartyRef,
    active_flags_for_knesset_rows,
    current_knesset_numbers,
    evaluate_consistency,
    knesset_image_folder_candidates,
    knesset_numbers_to_deactivate,
    match_party_to_faction,
    names_refer_to_same_party,
    official_conflicts,
    person_party_map,
    plan_official_faction_writes,
    plan_provisional_faction_writes,
    select_current_knesset_number,
)
from odata_client import apply_odata_filter  # noqa: E402


class CurrentKnessetTests(unittest.TestCase):
    def test_is_current_rows_only(self) -> None:
        rows = [
            {"KnessetNum": 25, "IsCurrent": False},
            {"KnessetNum": 25, "IsCurrent": "false"},
            {"KnessetNum": 26, "IsCurrent": True},
            {"KnessetNum": 26, "IsCurrent": 1},
            {"KnessetNum": None, "IsCurrent": True},
        ]
        self.assertEqual(current_knesset_numbers(rows), [26])
        self.assertEqual(select_current_knesset_number([25, 26]), 26)
        self.assertIsNone(select_current_knesset_number([]))

    def test_active_flag_follows_odata_and_deactivates_previous(self) -> None:
        flags = active_flags_for_knesset_rows(
            [24, 25, 26],
            odata_current=26,
            existing_active={25: True},
        )
        self.assertEqual(flags, {24: False, 25: False, 26: True})
        self.assertEqual(knesset_numbers_to_deactivate([25], 26), [25])

    def test_missing_odata_current_preserves_db_flag(self) -> None:
        flags = active_flags_for_knesset_rows(
            [25, 26],
            odata_current=None,
            existing_active={25: True},
        )
        self.assertEqual(flags, {25: True, 26: False})
        self.assertEqual(knesset_numbers_to_deactivate([25], None), [])

    def test_image_folder_uses_the_given_number(self) -> None:
        self.assertEqual(
            knesset_image_folder_candidates(26),
            ["הכנסת ה26", "הכנסת ה-26"],
        )


class NameMatchTests(unittest.TestCase):
    def test_quote_variants_and_leadership_suffix(self) -> None:
        self.assertTrue(names_refer_to_same_party('ש"ס', "ש״ס"))
        self.assertTrue(
            names_refer_to_same_party("הליכוד", "הליכוד בראשות בנימין נתניהו")
        )
        self.assertTrue(
            names_refer_to_same_party(
                "הציונות הדתית", "הציונות הדתית ועוצמה יהודית"
            )
        )
        self.assertFalse(names_refer_to_same_party("ישר", "ישראל ביתנו"))

    def test_linked_current_faction_wins_over_name(self) -> None:
        factions = [
            FactionRef(id=1, name="הליכוד"),
            FactionRef(id=2, name="יש עתיד"),
        ]
        party = PartyRef(
            id=10,
            name="יש עתיד",
            short_name="יש עתיד",
            linked_faction_id=1,
        )
        self.assertEqual(match_party_to_faction(party, factions), 1)

    def test_stale_link_falls_through_to_current_name(self) -> None:
        factions = [FactionRef(id=8, name="הליכוד")]
        party = PartyRef(
            id=10,
            name="הליכוד בראשות בנימין נתניהו",
            short_name="הליכוד",
            linked_faction_id=99,
        )
        self.assertEqual(match_party_to_faction(party, factions), 8)

    def test_ambiguous_name_is_not_guessed(self) -> None:
        factions = [
            FactionRef(id=1, name="יש עתיד"),
            FactionRef(id=2, name="יש עתיד בראשות יאיר לפיד"),
        ]
        party = PartyRef(id=3, name="יש עתיד", short_name="יש עתיד")
        self.assertIsNone(match_party_to_faction(party, factions))


class FactionPlanTests(unittest.TestCase):
    def test_official_overwrites_provisional_and_logs_conflict(self) -> None:
        state = MembershipFactionState(
            knesset_position_id=7,
            person_id=1,
            knesset_id=26,
            faction_id=3,
            faction_id_provisional=True,
        )
        writes = plan_official_faction_writes({7: state}, {7: 9})
        self.assertEqual(len(writes), 1)
        self.assertFalse(writes[0].faction_id_provisional)
        self.assertEqual(writes[0].faction_id, 9)
        self.assertEqual(len(official_conflicts(writes)), 1)

        same = plan_official_faction_writes({7: state}, {7: 3})
        self.assertEqual(same[0].faction_id, 3)
        self.assertFalse(same[0].faction_id_provisional)
        self.assertEqual(official_conflicts(same), [])

    def test_official_unchanged_row_is_skipped(self) -> None:
        state = MembershipFactionState(
            knesset_position_id=7,
            person_id=1,
            knesset_id=26,
            faction_id=9,
            faction_id_provisional=False,
        )
        self.assertEqual(plan_official_faction_writes({7: state}, {7: 9}), [])

    def test_fallback_fills_null_and_refreshes_provisional_only(self) -> None:
        states = [
            MembershipFactionState(1, 10, 5, None, False),
            MembershipFactionState(2, 11, 5, 4, True),
            MembershipFactionState(3, 12, 5, 8, False),
            MembershipFactionState(4, 13, 5, None, False),
            MembershipFactionState(5, 14, 4, None, False),
            MembershipFactionState(6, 15, 5, None, False),
        ]
        writes = plan_provisional_faction_writes(
            states,
            current_knesset_id=5,
            person_to_party={10: 100, 11: 100, 12: 100, 13: 100, 14: 100, 15: 999},
            party_to_faction={100: 4},
            official_position_ids={4},
        )
        by_position = {write.knesset_position_id: write for write in writes}
        self.assertEqual(set(by_position), {1})
        self.assertTrue(by_position[1].faction_id_provisional)
        self.assertEqual(by_position[1].faction_id, 4)
        # position 2 already provisional with the same faction — no write
        # position 3 official — never overwritten
        # position 4 had an OData FactionID (even if unmapped) — skipped
        # position 5 is another knesset
        # position 6 has no party→faction match

    def test_person_on_two_lists_is_ambiguous(self) -> None:
        chosen, ambiguous = person_party_map([(1, 10, 1), (1, 11, 4), (2, 10, 2)])
        self.assertEqual(chosen, {2: 10})
        self.assertEqual(ambiguous, [1])


class ConsistencyTests(unittest.TestCase):
    def _facts(self, **overrides: object) -> ConsistencyFacts:
        base = dict(
            odata_knesset_lookup_ok=True,
            odata_current_knesset=26,
            db_active_knesset=26,
            null_faction_memberships=0,
            provisional_faction_memberships=120,
            odata_current_committee_ids=frozenset({1, 2, 3}),
            db_committee_ids_for_current=frozenset({1, 2, 3}),
            committees_marked_current_on_knessets=frozenset({26}),
            last_committees_sync_knesset=26,
            provisional_column_ready=True,
        )
        base.update(overrides)
        return ConsistencyFacts(**base)  # type: ignore[arg-type]

    def test_clean_report_allows_provisional_links(self) -> None:
        report = evaluate_consistency(self._facts())
        self.assertTrue(report["ok"])
        self.assertEqual(report["issues"], [])
        self.assertEqual(report["provisional_faction_memberships"], 120)

    def test_each_failure_mode(self) -> None:
        mismatch = evaluate_consistency(self._facts(db_active_knesset=25))
        self.assertFalse(mismatch["ok"])
        self.assertEqual(mismatch["issues"][0]["code"], "odata_db_knesset_mismatch")

        nulls = evaluate_consistency(self._facts(null_faction_memberships=120))
        self.assertEqual(nulls["issues"][0]["code"], "null_faction_memberships")

        missing = evaluate_consistency(
            self._facts(db_committee_ids_for_current=frozenset({1}))
        )
        self.assertEqual(missing["issues"][0]["code"], "missing_current_committees")

        wrong_term = evaluate_consistency(
            self._facts(
                committees_marked_current_on_knessets=frozenset({25}),
                last_committees_sync_knesset=25,
            )
        )
        codes = {issue["code"] for issue in wrong_term["issues"]}
        self.assertIn("committees_current_on_other_knesset", codes)
        self.assertIn("committees_synced_for_non_current_knesset", codes)

    def test_boolean_odata_filter(self) -> None:
        rows = [
            {"KnessetNum": 26, "IsCurrent": True},
            {"KnessetNum": 25, "IsCurrent": False},
        ]
        filtered = apply_odata_filter(rows, "IsCurrent eq true")
        self.assertEqual(filtered, [rows[0]])
        both = apply_odata_filter(rows, "KnessetNum eq 26 and IsCurrent eq true")
        self.assertEqual(both, [rows[0]])


if __name__ == "__main__":
    unittest.main()

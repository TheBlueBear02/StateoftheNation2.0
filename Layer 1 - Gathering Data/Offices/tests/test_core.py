from datetime import date, datetime, timedelta, timezone

import pytest

from models import Candidate, Observation
from periods import next_period, parse_site_label, release_window, to_site
from planner import CheckState, plan
from registry import Entry, load_registry
from validate import validate


def entry(**kw) -> Entry:
    base = dict(
        key=1, name="x", office="o", frequency="yearly", tier="A", adapter="obudget",
        params={}, label_rule="yearly_jan1", release={"window": "03-01..07-31", "check_every_days": 7},
    )
    base.update(kw)
    return Entry(**base)


MONTHLY = dict(frequency="monthly", label_rule="month_start",
               release={"min_lag_days": 5, "max_lag_days": 30, "check_every_days": 2})


# ── periods ──────────────────────────────────────────────────────────────────


def test_next_period_wraps_years():
    assert next_period(date(2025, 12, 1), "monthly") == date(2026, 1, 1)
    assert next_period(date(2025, 1, 1), "monthly", -1) == date(2024, 12, 1)
    assert next_period(date(2025, 1, 1), "yearly", -3) == date(2022, 1, 1)


def test_site_labels_match_existing_conventions():
    assert to_site(date(2024, 1, 1), "yearly_jan1") == (date(2024, 1, 1), "2024")
    assert to_site(date(2025, 6, 1), "month_start") == (date(2025, 6, 1), "01.06.2025")
    assert to_site(date(2024, 2, 1), "month_end") == (date(2024, 2, 29), "29.02.2024")
    assert parse_site_label("31.08.2025") == date(2025, 8, 31)
    assert parse_site_label("2019") == date(2019, 1, 1)


def test_release_windows():
    assert release_window(date(2025, 7, 1), "monthly", {"min_lag_days": 3, "max_lag_days": 30}) == (
        date(2025, 8, 3), date(2025, 8, 30))
    assert release_window(date(2025, 1, 1), "yearly", {"window": "03-01..07-31"}) == (
        date(2026, 3, 1), date(2026, 7, 31))
    # wrapping window: Gini for 2024 → Nov 2025 .. Feb 2026
    assert release_window(date(2024, 1, 1), "yearly", {"window": "11-15..02-28"}) == (
        date(2025, 11, 15), date(2026, 2, 28))


# ── registry ─────────────────────────────────────────────────────────────────


def test_registry_loads_all_48():
    entries = load_registry()
    assert len(entries) == 48
    assert len({e.key for e in entries}) == 48
    assert {e.office for e in entries} >= {"משרד החינוך", "משרד האוצר"}


# ── planner ──────────────────────────────────────────────────────────────────


def _plan_one(e, latest, today, state=None, implemented=("obudget", "cbs_price")):
    states = {(e.key, state.target_period): state} if state else {}
    return plan([e], {e.key: latest}, states, today, set(implemented))[0]


def test_planner_not_yet_then_in_window():
    e = entry()
    # latest point is 2024 → hunting 2025, whose window is Mar–Jul 2026
    it = _plan_one(e, date(2024, 1, 1), date(2026, 3, 1))
    assert (it.action, it.reason, it.target) == ("check", "in_window", date(2025, 1, 1))
    assert _plan_one(e, date(2024, 1, 1), date(2026, 2, 15)).reason == "not_yet"


def test_planner_respects_check_every_days():
    e = entry()
    target = date(2025, 1, 1)                                     # window Mar–Jul 2026
    checked = CheckState(target, datetime(2026, 4, 1, tzinfo=timezone.utc), attempts=3)
    assert _plan_one(e, date(2024, 1, 1), date(2026, 4, 3), checked).reason == "checked_recently"
    assert _plan_one(e, date(2024, 1, 1), date(2026, 4, 8), checked).reason == "in_window"


def test_planner_overdue_rechecks_weekly():
    e = entry()
    it = _plan_one(e, date(2023, 1, 1), date(2026, 3, 10))       # hunting 2024, window ended Jul 2025
    assert it.overdue and it.due and it.reason == "overdue"
    recent = CheckState(date(2024, 1, 1), datetime(2026, 3, 8, tzinfo=timezone.utc))
    assert _plan_one(e, date(2023, 1, 1), date(2026, 3, 10), recent).reason == "overdue_checked_recently"


def test_planner_no_adapter_and_revision_sweep():
    assert _plan_one(entry(adapter="document:police_yearbook"), date(2025, 1, 1),
                     date(2026, 5, 1)).reason == "no_adapter"
    # 1st of month, before the window → API sources still get a revision sweep
    assert _plan_one(entry(), date(2025, 1, 1), date(2026, 2, 1)).reason == "revision_sweep"


def test_planner_monthly_window():
    e = entry(**MONTHLY)
    assert _plan_one(e, date(2025, 6, 1), date(2025, 8, 4)).reason == "not_yet"      # July opens Aug 5
    assert _plan_one(e, date(2025, 6, 1), date(2025, 8, 5)).reason == "in_window"


def test_year_simulation_checks_each_period_in_its_window():
    """Nothing is ever found: every day the planner must check inside the window,
    never before it, and never more often than check_every_days."""
    e = entry(**MONTHLY)
    latest = date(2025, 6, 1)
    state = None
    checks = []
    day = date(2025, 7, 1)
    while day <= date(2025, 9, 30):
        it = _plan_one(e, latest, day, state)
        if it.due:
            checks.append((day, it.reason))
            state = CheckState(it.target, datetime(day.year, day.month, day.day, tzinfo=timezone.utc))
        day += timedelta(days=1)
    in_window = [d for d, r in checks if r == "in_window"]
    assert in_window[0] == date(2025, 8, 5)
    assert all((b - a).days >= 2 for a, b in zip(in_window, in_window[1:]))
    assert all(d <= date(2025, 8, 30) for d in in_window)
    overdue = [d for d, r in checks if r == "overdue"]
    assert overdue and all((b - a).days >= 7 for a, b in zip(overdue, overdue[1:]))


# ── validation ───────────────────────────────────────────────────────────────


def _cand(value, period=date(2025, 1, 1), kind="new", prev=None, method="api", **obs_kw):
    obs = Observation(key=1, period=period, value=value, source_url="u", method=method, **obs_kw)
    return Candidate(obs=obs, index_id=10, recorded_at=period, label=str(period.year), kind=kind,
                     previous_value=prev)


HIST = [(date(y, 1, 1), 100.0 + y - 2015) for y in range(2015, 2025)]


def test_clean_api_value_autopublishes():
    c = validate(_cand(110.0), entry(), HIST, date(2026, 5, 1))
    assert c.auto_publish and not c.flags and c.status == "published"


def test_jump_goes_to_review():
    c = validate(_cand(200.0), entry(), HIST, date(2026, 5, 1))
    assert not c.auto_publish and c.flags[0].startswith("jump_")


def test_future_period_rejected():
    c = validate(_cand(110.0, period=date(2027, 1, 1)), entry(), HIST, date(2026, 5, 1))
    assert c.rejected


def test_small_revision_auto_large_revision_review():
    small = validate(_cand(109.1, period=date(2024, 1, 1), kind="revision", prev=109.0), entry(), HIST, date(2026, 5, 1))
    assert small.auto_publish
    big = validate(_cand(115.0, period=date(2024, 1, 1), kind="revision", prev=109.0), entry(), HIST, date(2026, 5, 1))
    assert not big.auto_publish and any(f.startswith("revision_") for f in big.flags)


def test_llm_value_needs_quote_and_never_autopublishes():
    bad = validate(_cand(110.0, method="llm", raw_value="110", evidence={"quote": "סה\"כ 111"}),
                   entry(), HIST, date(2026, 5, 1))
    assert bad.rejected
    good = validate(_cand(110.0, method="llm", raw_value="110", evidence={"quote": "סה\"כ 110 תיקים"}),
                    entry(), HIST, date(2026, 5, 1))
    assert not good.rejected and not good.auto_publish


@pytest.mark.parametrize("v", [float("nan"), float("inf")])
def test_non_finite_rejected(v):
    assert validate(_cand(v), entry(), HIST, date(2026, 5, 1)).rejected


def test_year_offset_zero_for_same_year_releases():
    assert release_window(date(2026, 1, 1), "yearly", {"window": "01-01..02-15", "year_offset": 0}) == (
        date(2026, 1, 1), date(2026, 2, 15))

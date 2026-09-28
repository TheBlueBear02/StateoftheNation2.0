"""Replays real API responses captured on 2026-09-29 (tests/fixtures) and checks that
the adapters reproduce the dashboard's existing, hand-curated history.

This is the gate for trusting an adapter: if a source can't reproduce the past,
its new values shouldn't be published automatically.
"""

from collections import Counter
from datetime import date

import pytest

from registry import load_registry
from replay import ReplayCbs, ReplayObudget
from run_office_kpi_pipeline import run
from store import OfflineStore

ENTRIES = load_registry()
ADAPTERS = {"cbs_price": ReplayCbs(), "obudget": ReplayObudget()}


@pytest.fixture(scope="module")
def backtest():
    result = run(OfflineStore(), ENTRIES, date(2026, 9, 29), backtest=True, adapters=ADAPTERS)
    by_key: dict[int, Counter] = {}
    for c in result.candidates:
        by_key.setdefault(c.obs.key, Counter())[c.kind] += 1
    return by_key


@pytest.mark.parametrize("key", [22, 24, 25, 27, 33, 37, 50])
def test_ministry_budgets_match_history_exactly(backtest, key):
    assert backtest[key]["same"] >= 9
    assert backtest[key]["revision"] == 0


def test_housing_index_matches_history(backtest):
    k = backtest[56]
    assert k["same"] / (k["same"] + k["revision"]) > 0.97


def test_inflation_mostly_matches(backtest):
    # 2017 / 2019 differ from CBS in the hand-entered data; those go to review.
    k = backtest[53]
    assert k["same"] >= 13 and k["revision"] <= 2


def test_nightly_run_on_real_data_publishes_backlog():
    result = run(OfflineStore(), ENTRIES, date(2026, 9, 29), adapters=ADAPTERS)
    published = {(c.obs.key, c.label) for c in result.candidates if c.auto_publish}
    assert (25, "2025") in published                 # education budget 2025
    assert (56, "01.06.2026") in published           # housing index, a year past the site
    assert (53, "2025") in published                 # inflation 2025
    assert not any(c.rejected for c in result.candidates)

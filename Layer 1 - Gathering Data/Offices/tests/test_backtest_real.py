"""Replays real API responses captured on 2026-09-29 (tests/fixtures) and checks that
the adapters reproduce the dashboard's existing, hand-curated history.

This is the gate for trusting an adapter: if a source can't reproduce the past,
its new values shouldn't be published automatically.
"""

from collections import Counter
from datetime import date

import pytest

from adapters.curated import CuratedAdapter
from registry import load_registry
from replay import ReplayCbs, ReplayCbsSeries, ReplayDatagov, ReplayObudget, ReplayWorldbank
from run_office_kpi_pipeline import run
from store import OfflineStore

ENTRIES = load_registry()
ADAPTERS = {
    "cbs_price": ReplayCbs(),
    "cbs_series": ReplayCbsSeries(),
    "obudget": ReplayObudget(),
    "worldbank": ReplayWorldbank(),
    "datagov": ReplayDatagov(),
    "curated": CuratedAdapter(),
}


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


def test_growth_mostly_matches(backtest):
    # National accounts revise often; overlap should still be dense.
    k = backtest[54]
    assert k["same"] + k["revision"] >= 12
    assert k["same"] >= 4


def test_avg_wage_mostly_matches(backtest):
    # Series starts 2011; hand-entered NIS values differ by 1–4 ₪ → tiny revisions.
    k = backtest[58]
    assert k["same"] + k["revision"] >= 12
    assert k["revision"] >= 10


def test_unemployment_mostly_matches(backtest):
    # Series starts 2012; 2009–2011 stay unmatched. 2023–2024 site figures lag CBS.
    k = backtest[60]
    assert k["same"] >= 8
    assert k["same"] + k["revision"] >= 12


def test_gdp_per_capita_mostly_matches(backtest):
    # World Bank floats vs rounded site dollars → dense tiny revisions.
    k = backtest[61]
    assert k["same"] + k["revision"] >= 14


def test_ev_share_mostly_matches(backtest):
    # Registry-based new-registration share ≈ site within a few tenths of a point.
    k = backtest[29]
    assert k["same"] + k["revision"] >= 3


def test_debt_gdp_curated_matches_history(backtest):
    k = backtest[52]
    assert k["same"] >= 14


def test_government_debt_curated_matches_history(backtest):
    k = backtest[55]
    assert k["same"] >= 12


def test_nightly_run_on_real_data_publishes_backlog():
    result = run(OfflineStore(), ENTRIES, date(2026, 9, 29), adapters=ADAPTERS)
    published = {(c.obs.key, c.label) for c in result.candidates if c.auto_publish}
    pending = {(c.obs.key, c.label) for c in result.candidates if c.status == "pending"}
    assert (25, "2025") in published                 # education budget 2025
    assert (56, "01.06.2026") in published           # housing index, a year past the site
    assert (53, "2025") in published                 # inflation 2025
    assert (58, "2024") in published or (58, "2025") in published
    assert (60, "2025") in published                 # LFS unemployment 2025
    assert (61, "2025") in published or (61, "2025") in pending  # WB GDP/capita
    assert (29, "2024") in published or (29, "2024") in pending  # EV share (complete years only)
    assert (29, "2026") not in published and (29, "2026") not in pending
    # GDP growth 2025 swings hard vs 2024 → review, not auto
    assert (54, "2025") in published or (54, "2025") in pending
    assert not any(c.rejected for c in result.candidates)

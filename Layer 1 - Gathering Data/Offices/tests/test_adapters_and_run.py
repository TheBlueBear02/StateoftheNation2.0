from datetime import date

import pytest

from adapters.base import AdapterError, FetchTask
from adapters.cbs_price import parse_points
from adapters.cbs_price import to_observations as cbs_obs
from adapters.obudget import build_query
from adapters.obudget import to_observations as obudget_obs
from models import Observation
from registry import load_registry
from run_office_kpi_pipeline import run
from store import OfflineStore

ENTRIES = {e.key: e for e in load_registry()}


# ── CBS price ────────────────────────────────────────────────────────────────


def test_cbs_housing_parses_and_skips_other_base(fixture_json):
    points = parse_points(fixture_json("cbs_price_40010.json"))
    obs = cbs_obs(FetchTask(ENTRIES[56], since=date(2025, 1, 1)), points)
    assert [(o.period, o.value) for o in sorted(obs, key=lambda o: o.period)] == [
        (date(2026, 4, 1), 593.0), (date(2026, 5, 1), 593.6), (date(2026, 6, 1), 594.8)]
    # the 2025-03 point is on another base → skipped, quarterly block ignored


def test_cbs_inflation_uses_december_yoy():
    pts = [{"year": 2025, "month": 12, "percentYear": 2.6, "value": 103.1, "base": "2024 ממוצע"},
           {"year": 2026, "month": 8, "percentYear": 1.5, "value": 105.8, "base": "2024 ממוצע"}]
    obs = cbs_obs(FetchTask(ENTRIES[53], since=date(2020, 1, 1)), pts)
    assert [(o.period, o.value) for o in obs] == [(date(2025, 1, 1), 2.6)]


# ── obudget ──────────────────────────────────────────────────────────────────


def test_obudget_skips_unfinished_year(fixture_json):
    rows = fixture_json("obudget_0010.json")["rows"]
    obs = obudget_obs(FetchTask(ENTRIES[22], since=date(2024, 1, 1)), rows, "q")
    assert [(o.period.year, o.value) for o in obs] == [(2024, 53166755.0), (2025, 54664990.0)]


def test_obudget_query_is_injection_safe():
    assert "raw_budget" in build_query(["0020"], "net_executed", 2020)
    with pytest.raises(AdapterError):
        build_query(["0020'; drop table x;--"], "net_executed", 2020)
    with pytest.raises(AdapterError):
        build_query(["0020"], "anything", 2020)


# ── end-to-end against the repo snapshot, with a fake adapter ────────────────


class FakeCbs:
    family = "cbs_price"
    method = "api"

    def __init__(self, observations):
        self.observations = observations
        self.calls = 0

    def fetch(self, tasks, today):
        self.calls += 1
        return [o for o in self.observations if any(t.entry.key == o.key and o.period >= t.since for t in tasks)]


def _obs(key, period, value):
    return Observation(key=key, period=period, value=value, source_url="fake", method="api")


def test_offline_run_classifies_new_same_revision():
    store = OfflineStore()
    hist = dict(store.history([56])[56])
    last_day = max(hist)                                     # 2025-06-01 in the snapshot
    last_val = hist[last_day]
    fake = FakeCbs([
        _obs(56, last_day, last_val),                        # same as history
        _obs(56, date(2025, 5, 1), hist[date(2025, 5, 1)] * 1.001),   # tiny revision → auto
        _obs(56, date(2025, 7, 1), last_val + 1.0),          # new month → auto
        _obs(56, date(2025, 8, 1), last_val * 3),            # absurd jump → review
    ])
    result = run(store, list(ENTRIES.values()), date(2025, 9, 1), only_keys={56},
                 adapters={"cbs_price": fake})

    assert fake.calls == 1
    by_period = {c.obs.period: c for c in result.candidates}
    assert by_period[last_day].kind == "same"
    assert by_period[date(2025, 5, 1)].kind == "revision" and by_period[date(2025, 5, 1)].auto_publish
    assert by_period[date(2025, 7, 1)].status == "published"
    assert by_period[date(2025, 7, 1)].label == "01.07.2025"
    assert by_period[date(2025, 8, 1)].status == "pending"
    assert result.found_keys == {56}
    assert result.state_rows[0]["status"] == "found"


def test_failing_adapter_is_isolated():
    class Boom:
        family = "obudget"
        method = "api"

        def fetch(self, tasks, today):
            raise RuntimeError("site down")

    result = run(OfflineStore(), list(ENTRIES.values()), date(2026, 4, 1), force=True,
                 adapters={"obudget": Boom(), "cbs_price": FakeCbs([])})
    assert "obudget" in result.errors
    assert {r["status"] for r in result.state_rows if r["index_id"] == 22} == {"error"}
    assert {r["status"] for r in result.state_rows if r["index_id"] == 56} <= {"checking", "overdue"}


def test_plan_only_offline_covers_all_entries():
    result = run(OfflineStore(), list(ENTRIES.values()), date(2026, 9, 29), plan_only=True)
    assert len(result.items) == 48 and not result.unresolved
    assert all(it.reason == "no_adapter" for it in result.items
               if it.entry.adapter_family not in {"cbs_price", "obudget"})

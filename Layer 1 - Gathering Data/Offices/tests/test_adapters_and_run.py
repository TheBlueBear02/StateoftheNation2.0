from datetime import date

import csv
import io
from pathlib import Path

import pytest

from adapters.base import AdapterError, FetchTask
from adapters.boi_sdmx import collapse_yearly, rolling_deficit_gdp_points
from adapters.curated import CuratedAdapter
from adapters.cbs_price import parse_points
from adapters.cbs_price import to_observations as cbs_obs
from adapters.cbs_series import parse_obs
from adapters.cbs_series import to_observations as cbs_series_obs
from adapters.datagov import last_complete_year
from adapters.datagov import to_observations as datagov_obs
from adapters.obudget import build_query
from adapters.obudget import to_observations as obudget_obs
from adapters.worldbank import parse_rows
from adapters.worldbank import to_observations as worldbank_obs
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


# ── CBS series ───────────────────────────────────────────────────────────────


def test_cbs_series_growth_yearly_stamp(fixture_json):
    ser, points = parse_obs(fixture_json("cbs_series_history.json")["64092"])
    obs = cbs_series_obs(
        FetchTask(ENTRIES[54], since=date(2012, 1, 1)), ser, points, today=date(2026, 9, 29)
    )
    by_year = {o.period.year: o.value for o in obs}
    assert by_year[2012] == 2.4
    assert by_year[2020] == -1.9
    assert all(o.period.month == 1 and o.period.day == 1 for o in obs)


def test_cbs_series_wage_levels(fixture_json):
    ser, points = parse_obs(fixture_json("cbs_series_history.json")["615908"])
    obs = cbs_series_obs(
        FetchTask(ENTRIES[58], since=date(2019, 1, 1)), ser, points, today=date(2026, 9, 29)
    )
    by_year = {o.period.year: o.value for o in obs}
    assert by_year[2019] == 10482.0
    assert by_year[2023] == 12499.0


def test_cbs_series_yearly_sum_rail():
    from adapters.cbs_series import yearly_periods

    points = []
    for year, total in ((2022, 54718.3), (2023, 62503.0)):
        # Spread evenly across 12 months so sum reconstructs the yearly total.
        monthly = total / 12
        for m in range(1, 13):
            points.append({"time_period": f"{year}-{m:02d}", "value": monthly})
    # Incomplete 2025 → skipped
    for m in range(1, 10):
        points.append({"time_period": f"2025-{m:02d}", "value": 100.0})
    rows = yearly_periods(points, mode="yearly_sum", today=date(2026, 9, 29))
    by_year = {p.year: v for p, v, _ in rows}
    assert by_year[2022] == pytest.approx(54718.3)
    assert by_year[2023] == pytest.approx(62503.0)
    assert 2025 not in by_year


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


# ── worldbank ────────────────────────────────────────────────────────────────


def test_worldbank_gdp_pcap_years(fixture_json):
    rows = fixture_json("worldbank_gdp_pcap_il.json")[1]
    points = parse_rows(rows)
    by_year = {p.year: v for p, v, _ in points}
    assert round(by_year[2024], 0) == 54217
    obs = worldbank_obs(FetchTask(ENTRIES[61], since=date(2020, 1, 1)), rows, source_url="x")
    assert {o.period.year for o in obs} >= {2020, 2021, 2022, 2023, 2024}


# ── datagov ──────────────────────────────────────────────────────────────────


def test_datagov_ev_share_close_to_site(fixture_json):
    hist = fixture_json("datagov_ev_share_history.json")["053cea08-09bc-40ec-8f7a-156f0677aff3"]
    points = [
        (date(int(y), 1, 1), float(row["share"]), row)
        for y, row in sorted(hist.items())
    ]
    obs = datagov_obs(FetchTask(ENTRIES[29], since=date(2020, 1, 1)), points, source_url="x")
    by_year = {o.period.year: o.value for o in obs}
    # Site: 0.7, 3.9, 10.7, 18.0 — registry-based shares stay within ~0.3pp
    assert abs(by_year[2020] - 0.7) < 0.05
    assert abs(by_year[2021] - 3.9) < 0.25
    assert abs(by_year[2022] - 10.7) < 0.6
    assert abs(by_year[2023] - 18.0) < 0.3
    assert all(round(v, 1) == v for v in by_year.values())


def test_datagov_last_complete_year_excludes_current():
    assert last_complete_year(date(2026, 9, 29)) == 2025
    assert last_complete_year(date(2026, 1, 5)) == 2025
    assert last_complete_year(date(2025, 12, 31)) == 2024


# ── boi_sdmx ─────────────────────────────────────────────────────────────────


def test_boi_sdmx_annual_collapse():
    text = (Path(__file__).parent / "fixtures" / "boi_sdmx_demo_debt_gdp.csv").read_text(encoding="utf-8")
    rows = list(csv.DictReader(io.StringIO(text)))
    points = collapse_yearly(rows, pick="annual", unit_mult_override=None, scale=1.0)
    assert [(p.year, v) for p, v, _ in points][-1] == (2024, 69.0)


def test_boi_sdmx_rolling_deficit_gdp():
    deficit = {f"2024-{m:02d}": 1.0 for m in range(1, 13)}
    deficit.update({f"2025-{m:02d}": 2.0 for m in range(1, 7)})
    gdp_q = {
        "2024-Q1": 100.0,
        "2024-Q2": 100.0,
        "2024-Q3": 100.0,
        "2024-Q4": 100.0,
        "2025-Q1": 100.0,
        "2025-Q2": 100.0,
    }
    # Dec 2024: 12m deficit = 12, 4Q GDP = 400 → 3.0%
    pts = rolling_deficit_gdp_points(
        deficit, gdp_q, since=date(2024, 12, 1), until=date(2024, 12, 1), decimals=1
    )
    assert pts == [(date(2024, 12, 1), 3.0, pts[0][2])]
    # Jun 2025: last 12m = 6*2 + 6*1 = 18 → 4.5%
    pts2 = rolling_deficit_gdp_points(
        deficit, gdp_q, since=date(2025, 6, 1), until=date(2025, 6, 1), decimals=1
    )
    assert pts2[0][1] == 4.5


def test_curated_debt_series():
    from adapters.base import FetchTask

    adapter = CuratedAdapter()
    tasks = [
        FetchTask(entry=ENTRIES[52], since=date(2024, 1, 1)),
        FetchTask(entry=ENTRIES[55], since=date(2024, 1, 1)),
    ]
    obs = adapter.fetch(tasks, today=date(2026, 9, 29))
    by_key: dict[int, list[tuple[int, float]]] = {}
    for o in obs:
        by_key.setdefault(o.key, []).append((o.period.year, o.value))
    assert (2024, 69.0) in by_key[52] and (2025, 68.6) in by_key[52]
    assert (2024, 1329300000000.0) in by_key[55] and (2025, 1416000000000.0) in by_key[55]


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
    live = {"cbs_price", "cbs_series", "obudget", "worldbank", "boi_sdmx", "datagov", "curated"}
    assert all(it.reason == "no_adapter" for it in result.items
               if it.entry.adapter_family not in live)

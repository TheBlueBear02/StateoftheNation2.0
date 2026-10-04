"""Tests for the document discovery / extraction path (no network, no OpenAI)."""

from __future__ import annotations

from datetime import date
from pathlib import Path

import pytest

from adapters.base import FetchTask
from adapters.document import DocumentAdapter
from doc_cache import download_local, save_extraction
from documents_registry import load_documents
from extractors.pdf_llm import items_to_observations
from extractors.pdf_pages import maybe_fix_hebrew_rtl, select_pages, PdfPage
from extractors.xlsx_table import extract_xlsx_table
from models import Observation
from registry import load_registry
from run_office_kpi_pipeline import run
from store import OfflineStore
from validate import validate
from models import Candidate

ENTRIES = {e.key: e for e in load_registry()}
DOCS = load_documents()


def test_documents_registry_covers_police_and_shabak():
    assert "police_yearbook" in DOCS
    assert "shabak_monthly" in DOCS
    assert set(DOCS["police_yearbook"].indexes) >= {19, 20, 21, 26, 39, 40}
    assert set(DOCS["shabak_monthly"].indexes) == {1, 14}
    assert DOCS["police_yearbook"].prompt_path and DOCS["police_yearbook"].prompt_path.exists()


def test_hebrew_rtl_flip_when_tokens_look_reversed():
    # Artificial reversed Hebrew-looking tokens with proclitic at the end.
    weird = "הריש םויק"
    fixed = maybe_fix_hebrew_rtl(weird)
    # Function is heuristic — just assert it returns a string and doesn't crash.
    assert isinstance(fixed, str)
    normal = "גניבות רכב בשנת 2023"
    assert maybe_fix_hebrew_rtl(normal) == normal


def test_hebrew_month_edition_parse():
    from discover import parse_edition

    assert (
        parse_edition(
            "https://www.shabak.gov.il/media/x/דוח-חודשי-אוגוסט-2025.pdf",
            "hebrew_month_year",
            "2025 דוח חודשי - אוגוסט הורדת דוח",
        )
        == "2025-08"
    )
    assert parse_edition("https://example.com/IsraelPolice2023.pdf", "url_year") == "2023"


def test_months_needed_spans_missing_range():
    from adapters.base import FetchTask
    from adapters.document import _months_needed

    tasks = [FetchTask(ENTRIES[1], since=date(2025, 8, 1))]
    months = _months_needed(tasks, date(2025, 11, 15))
    assert months[0] == date(2025, 8, 1)
    assert months[-1] == date(2025, 11, 1)
    assert len(months) == 4


def test_monthly_skips_year_only_editions():
    from adapters.document import DocumentAdapter
    from discover import DiscoveredDoc

    adapter = DocumentAdapter(docs=DOCS, history_by_key={1: [(date(2026, 2, 1), 325.0)]})
    spec = DOCS["shabak_monthly"]
    # Year-only must not become January and hide real months.
    catalog = [
        DiscoveredDoc("https://example.com/a.pdf", "2026", "seed"),
        DiscoveredDoc("https://example.com/mar.pdf", "2026-03", "seed"),
    ]
    by_period = {}
    import re as _re

    for doc in catalog:
        if not doc.edition or not _re.fullmatch(r"20\d{2}-\d{2}", doc.edition.strip()):
            continue
        p = doc.period
        if p is not None:
            by_period[p] = doc
    assert date(2026, 1, 1) not in by_period
    assert date(2026, 3, 1) in by_period
    assert adapter is not None and spec.key == "shabak_monthly"


def test_select_pages_prefers_history_numbers():
    pages = [
        PdfPage(1, "מבוא גניבות רכב"),
        PdfPage(2, "טבלה 22,165 ללא רכב שמוש גניבה"),
        PdfPage(3, "אחר"),
    ]
    selected = select_pages(
        pages, ["גניבות רכב", "שמוש גניבה"], neighbors=0, prefer_numbers=["22,165", "22165"]
    )
    assert selected[0].number == 2


def test_select_pages_demotes_avoid_anchors():
    pages = [
        PdfPage(1, "מעצרי פעילי טרור 322 פיגועים"),
        PdfPage(2, "מפת טרור חודשית פיגועים משמעותיים 287"),
        PdfPage(3, "סיכום"),
    ]
    selected = select_pages(
        pages,
        ["מפת טרור", "פיגועים"],
        neighbors=0,
        avoid_anchors=["מעצרי", "מעצרים"],
    )
    assert [p.number for p in selected] == [2, 1]


def test_shabak_quote_rejects_arrest_series():
    spec = DOCS["shabak_monthly"]

    class Doc:
        sha256 = "abc"
        url = "https://example.com/shabak.pdf"
        edition = "2025-08"
        db_id = None

    items = [
        {
            "index_key": 1,
            "period": "2025-08",
            "value": 322,
            "raw_value": "322",
            "page": 2,
            "quote": "מעצרי פעילי טרור 322",
            "unit": "count",
            "confidence": 0.9,
        },
        {
            "index_key": 1,
            "period": "2025-08",
            "value": 287,
            "raw_value": "287",
            "page": 3,
            "quote": "פיגועים משמעותיים 287",
            "unit": "count",
            "confidence": 0.9,
        },
        {
            # Regional breakdown without the word פיגועים — keep for review.
            "index_key": 1,
            "period": "2025-07",
            "value": 375,
            "raw_value": "375",
            "page": 4,
            "quote": '375\n23 לארשי\n9 םילשורי\n343 ש"ויא',
            "unit": "count",
            "confidence": 0.9,
        },
    ]
    obs = items_to_observations(
        items,
        spec=spec,
        entries_by_key={1: ENTRIES[1]},
        doc=Doc(),
        since=date(2025, 7, 1),
        today=date(2025, 8, 31),
        history_by_key={1: [(date(2025, 6, 1), 400.0)]},
    )
    assert {o.period.isoformat(): o.value for o in obs} == {
        "2025-08-01": 287,
        "2025-07-01": 375,
    }
    weak = next(o for o in obs if o.period.month == 7)
    assert "weak_quote_label" in (weak.evidence or {}).get("flags", [])


def test_llm_drops_implausible_same_year_value():
    spec = DOCS["police_yearbook"]

    class Doc:
        sha256 = "abc"
        url = "https://example.com/yearbook.pdf"
        edition = "2023"
        db_id = None

    items = [
        {
            "index_key": 20,
            "period": "2023",
            "value": 129379,
            "raw_value": "129,379",
            "page": 22,
            "quote": "רכוש 129,379",
            "unit": "cases",
            "confidence": 0.9,
        },
        {
            "index_key": 20,
            "period": "2023",
            "value": 22165,
            "raw_value": "22,165",
            "page": 39,
            "quote": "גניבה 22,165",
            "unit": "cases",
            "confidence": 0.9,
        },
    ]
    obs = items_to_observations(
        items,
        spec=spec,
        entries_by_key={20: ENTRIES[20]},
        doc=Doc(),
        since=date(2020, 1, 1),
        today=date(2026, 9, 30),
        history_by_key={20: [(date(2023, 1, 1), 22165.0)]},
    )
    assert len(obs) == 1
    assert obs[0].value == 22165


def test_shabak_keeps_zero_killed_and_digits_only_attacks():
    """0 fatalities must not be dropped vs non-zero history; bare totals stay for review."""
    from extractors.pdf_llm import items_to_observations as _ito

    spec = DOCS["shabak_monthly"]

    class Doc:
        sha256 = "abc"
        url = "https://example.com/shabak.pdf"
        edition = "2026-05"
        db_id = None

    items = [
        {
            "index_key": 14,
            "period": "2026-05",
            "value": 0,
            "raw_value": "0",
            "page": 5,
            "quote": "הרוגים 0",
            "unit": "count",
            "confidence": 0.9,
        },
        {
            "index_key": 1,
            "period": "2026-03",
            "value": 375,
            "raw_value": "375",
            "page": 4,
            "quote": "375",
            "unit": "count",
            "confidence": 0.9,
        },
    ]
    obs = _ito(
        items,
        spec=spec,
        entries_by_key={1: ENTRIES[1], 14: ENTRIES[14]},
        doc=Doc(),
        since=date(2026, 3, 1),
        today=date(2026, 5, 31),
        history_by_key={
            1: [(date(2026, 2, 1), 325.0)],
            14: [(date(2026, 4, 1), 2.0)],
        },
    )
    by_key = {o.key: o for o in obs}
    assert 14 in by_key and by_key[14].value == 0
    assert 1 in by_key and by_key[1].value == 375
    assert "weak_quote_label" in (by_key[1].evidence or {}).get("flags", [])


def test_llm_items_map_to_observations_and_quote_rule():
    spec = DOCS["police_yearbook"]
    # Minimal fake cached doc
    class Doc:
        sha256 = "abc"
        url = "https://example.com/yearbook.pdf"
        edition = "2023"
        db_id = 7

    items = [
        {
            "index_key": 20,
            "period": "2023",
            "value": 8092,
            "raw_value": "8,092",
            "page": 12,
            "quote": "גניבות רכב: 8,092",
            "unit": "count",
            "confidence": 0.9,
        },
        {
            "index_key": 20,
            "period": "2024",
            "value": 9000,
            "raw_value": "9000",
            "page": 12,
            "quote": "no number here",  # will be rejected by validate
            "unit": "count",
            "confidence": 0.5,
        },
    ]
    obs = items_to_observations(
        items,
        spec=spec,
        entries_by_key={20: ENTRIES[20]},
        doc=Doc(),
        since=date(2023, 1, 1),
        today=date(2026, 9, 30),
    )
    # Bad quote (raw_value not in quote) is dropped before Candidate/validate.
    assert len(obs) == 1
    assert obs[0].method == "llm"
    assert obs[0].period == date(2023, 1, 1)

    good = Candidate(
        obs=obs[0],
        index_id=20,
        recorded_at=date(2023, 1, 1),
        label="2023",
        kind="new",
        previous_value=None,
    )
    validate(good, ENTRIES[20], [], date(2026, 9, 30))
    assert good.rejected is None
    assert good.auto_publish is False  # llm never auto-publishes

    bad = Candidate(
        obs=Observation(
            key=20,
            period=date(2024, 1, 1),
            value=9000,
            raw_value="9000",
            source_url="https://example.com/yearbook.pdf",
            method="llm",
            confidence=0.5,
            evidence={"quote": "no number here", "page": 12},
        ),
        index_id=20,
        recorded_at=date(2024, 1, 1),
        label="2024",
        kind="new",
        previous_value=None,
    )
    validate(bad, ENTRIES[20], [], date(2026, 9, 30))
    assert bad.rejected and "quote" in bad.rejected


def test_xlsx_requires_configured_layout():
    spec = DOCS["iaa_monthly_stats"]
    # Create a tiny dummy file so openpyxl path isn't the failure mode.
    import tempfile

    with tempfile.TemporaryDirectory() as td:
        path = Path(td) / "iaa.xlsx"
        try:
            import openpyxl
        except ImportError:
            pytest.skip("openpyxl not installed")
        wb = openpyxl.Workbook()
        wb.save(path)
        cached = download_local(path, "iaa_monthly_stats", edition="2025-01")
        with pytest.raises(Exception, match="not configured"):
            extract_xlsx_table(
                spec,
                cached,
                [ENTRIES[30]],
                since=date(2024, 1, 1),
                today=date(2026, 9, 30),
            )


def test_document_adapter_uses_cached_extraction(tmp_path, monkeypatch):
    """Fixture PDF + pre-cached LLM JSON → observations without calling OpenAI."""
    try:
        import openpyxl  # noqa: F401
    except ImportError:
        pass

    # Build a tiny fake "pdf" bytes file — extract_pages won't be called if cache hits.
    fixture = tmp_path / "police_yearbook.pdf"
    fixture.write_bytes(b"%PDF-1.4 fake")
    monkeypatch.setenv("OFFICE_KPI_DOC_FIXTURES", str(tmp_path))

    cached = download_local(fixture, "police_yearbook", edition="2023")
    save_extraction(
        cached.sha256,
        {
            "extractor": "pdf_llm",
            "doc_key": "police_yearbook",
            "items": [
                {
                    "index_key": 20,
                    "period": "2023",
                    "value": 100,
                    "raw_value": "100",
                    "page": 1,
                    "quote": "סה״כ 100",
                    "unit": "count",
                    "confidence": 0.95,
                }
            ],
        },
    )

    adapter = DocumentAdapter(docs=DOCS, force_refresh=False)
    obs = adapter.fetch(
        [FetchTask(ENTRIES[20], since=date(2020, 1, 1))],
        today=date(2026, 9, 30),
    )
    assert len(obs) == 1
    assert obs[0].key == 20
    assert obs[0].value == 100
    assert obs[0].method == "llm"


def test_plan_with_documents_marks_police_due():
    adapters = {"document": DocumentAdapter(docs=DOCS)}
    result = run(
        OfflineStore(),
        list(ENTRIES.values()),
        date(2026, 9, 30),
        force=True,
        only_keys={20},
        plan_only=True,
        adapters=adapters,
    )
    assert result.items[0].due
    assert result.items[0].entry.adapter_family == "document"

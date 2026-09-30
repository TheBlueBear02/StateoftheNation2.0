"""Document adapter — discover → download (sha256 dedupe) → extract.

Enabled when OFFICE_KPI_DOCUMENTS=true (or --documents on the CLI). Until then the
planner keeps document indexes as no_adapter so the nightly API run stays unchanged.

params on each kpi_sources entry stay small (anchor/field); per-document discovery
and prompts live in documents.yaml.

Yearly docs (police yearbook): one PDF holds the year → download newest edition once.
Monthly one-period-per-file docs (Shabak): each PDF is only that month → discover all
month links, then download+extract each missing month separately.
"""

from __future__ import annotations

import logging
import os
import re
from collections import defaultdict
from datetime import date
from pathlib import Path
from typing import Any

from adapters.base import AdapterError, FetchTask
from doc_cache import download, download_local, persist_to_store
from discover import DiscoveredDoc, discover, discover_all
from documents_registry import DocSpec, load_documents
from extractors.pdf_llm import extract_pdf_llm
from extractors.xlsx_table import extract_xlsx_table
from models import Observation
from periods import next_period, period_end

log = logging.getLogger(__name__)

FIXTURE_ENV = "OFFICE_KPI_DOC_FIXTURES"  # dir with {doc_key}.pdf / .xlsx overrides
# Cap LLM cost when backfilling many Shabak months in one night.
MAX_MONTHLY_DOCS = int(os.environ.get("MAX_MONTHLY_DOCS_PER_NIGHT", "6"))


def documents_enabled(flag: bool | None = None) -> bool:
    if flag is not None:
        return flag
    return os.environ.get("OFFICE_KPI_DOCUMENTS", "").strip().lower() in {"1", "true", "yes"}


def _fixture_for(doc_key: str) -> Path | None:
    root = os.environ.get(FIXTURE_ENV, "").strip()
    if not root:
        return None
    base = Path(root)
    for ext in (".pdf", ".xlsx", ".xls", ".csv"):
        p = base / f"{doc_key}{ext}"
        if p.exists():
            return p
    return None


def _months_needed(tasks: list[FetchTask], today: date) -> list[date]:
    """Monthly periods to hunt: from earliest task.since through today (month starts)."""
    since = min(t.since for t in tasks)
    start = date(since.year, since.month, 1)
    end = date(today.year, today.month, 1)
    out: list[date] = []
    cur = start
    while cur <= end:
        out.append(cur)
        cur = next_period(cur, "monthly", 1)
    return out


class DocumentAdapter:
    family = "document"
    method = "llm"  # default; individual observations set table/llm

    def __init__(
        self,
        *,
        store: Any | None = None,
        docs: dict[str, DocSpec] | None = None,
        history_by_key: dict[int, list[tuple[date, float]]] | None = None,
        filled_months_by_key: dict[int, set[date]] | None = None,
        force_refresh: bool = False,
    ) -> None:
        self.store = store
        self.docs = docs if docs is not None else load_documents()
        self.history_by_key = history_by_key or {}
        self.filled_months_by_key = filled_months_by_key or {}
        self.force_refresh = force_refresh

    def fetch(self, tasks: list[FetchTask], today: date) -> list[Observation]:
        by_doc: dict[str, list[FetchTask]] = defaultdict(list)
        for t in tasks:
            doc_key = t.entry.doc_key
            if not doc_key:
                raise AdapterError(f"document adapter got entry without doc_key: {t.entry.adapter}")
            by_doc[doc_key].append(t)

        out: list[Observation] = []
        errors: list[str] = []
        for doc_key, group in by_doc.items():
            try:
                out.extend(self._fetch_doc(doc_key, group, today))
            except Exception as exc:  # isolate one doc_key; others still run
                log.exception("document[%s] failed", doc_key)
                errors.append(f"{doc_key}: {type(exc).__name__}: {exc}")
        if errors and not out:
            raise AdapterError("; ".join(errors))
        if errors:
            log.warning("document adapter partial failure: %s", "; ".join(errors))
        return out

    def _fetch_doc(self, doc_key: str, tasks: list[FetchTask], today: date) -> list[Observation]:
        spec = self.docs.get(doc_key)
        if spec is None:
            raise AdapterError(f"unknown doc_key {doc_key!r} — add it to documents.yaml")

        entries = [t.entry for t in tasks if t.entry.key in spec.indexes]
        if not entries:
            log.info("document[%s]: no overlapping indexes for tonight's tasks", doc_key)
            return []

        fixture = _fixture_for(doc_key)
        if fixture is not None:
            log.info("document[%s]: using fixture %s", doc_key, fixture)
            cached = download_local(fixture, doc_key, edition=None)
            if self.store is not None:
                cached = persist_to_store(self.store, cached)
            since = min(t.since for t in tasks)
            return self._extract(spec, cached, entries, since=since, today=today)

        if spec.frequency == "monthly":
            return self._fetch_monthly_editions(spec, tasks, entries, today)
        return self._fetch_single_edition(spec, tasks, entries, today)

    def _fetch_single_edition(
        self,
        spec: DocSpec,
        tasks: list[FetchTask],
        entries: list,
        today: date,
    ) -> list[Observation]:
        found = discover(spec, today)
        cached = download(found, spec.key)
        if self.store is not None:
            cached = persist_to_store(self.store, cached)
        since = min(t.since for t in tasks)
        return self._extract(spec, cached, entries, since=since, today=today)

    def _fetch_monthly_editions(
        self,
        spec: DocSpec,
        tasks: list[FetchTask],
        entries: list,
        today: date,
    ) -> list[Observation]:
        """One Shabak-style PDF per month — download each missing month’s file."""
        needed = _months_needed(tasks, today)
        catalog = discover_all(spec, today)
        by_period: dict[date, DiscoveredDoc] = {}
        for doc in catalog:
            # Monthly one-PDF-per-month sources need YYYY-MM. A year-only edition
            # would otherwise collapse to January and hide the real month.
            if not doc.edition or not re.fullmatch(r"20\d{2}-\d{2}", doc.edition.strip()):
                continue
            p = doc.period
            if p is None:
                continue
            # Prefer richer discovery method over seed when both exist for a month.
            prev = by_period.get(p)
            if prev is None or (prev.method == "seed" and doc.method != "seed"):
                by_period[p] = doc
            elif prev.method == doc.method:
                by_period[p] = doc

        missing_pdfs = [m for m in needed if m not in by_period]
        if missing_pdfs:
            log.warning(
                "document[%s]: no PDF discovered for %d needed month(s): %s",
                spec.key,
                len(missing_pdfs),
                ", ".join(m.isoformat()[:7] for m in missing_pdfs),
            )

        selected: list[tuple[date, DiscoveredDoc]] = []
        for month in needed:
            doc = by_period.get(month)
            if doc is not None:
                selected.append((month, doc))

        if not selected:
            available = ", ".join(sorted({d.edition or "?" for d in catalog})) or "(none)"
            raise AdapterError(
                f"document[{spec.key}]: no PDF matched needed months "
                f"{needed[0]}..{needed[-1]} (found editions: {available})"
            )

        # Prefer months not yet complete for every index this doc feeds.
        # (e.g. May may be pending for פיגועים but still missing for נרצחים.)
        entry_keys = [e.key for e in entries]

        def _month_complete(month: date) -> bool:
            for key in entry_keys:
                hist = {
                    date(d.year, d.month, 1)
                    for d, _ in self.history_by_key.get(key) or []
                }
                filled = {
                    date(d.year, d.month, 1)
                    for d in self.filled_months_by_key.get(key) or ()
                }
                if month not in hist and month not in filled:
                    return False
            return True

        missing = [(m, d) for m, d in selected if not _month_complete(m)]
        queue = missing if missing else selected[-MAX_MONTHLY_DOCS:]
        queue = queue[:MAX_MONTHLY_DOCS]

        log.info(
            "document[%s]: extracting %d monthly PDF(s): %s",
            spec.key,
            len(queue),
            ", ".join(d.edition or "?" for _, d in queue),
        )

        out: list[Observation] = []
        for month, found in queue:
            try:
                cached = download(found, spec.key)
                if self.store is not None:
                    cached = persist_to_store(self.store, cached)
                month_end = period_end(month, "monthly")
                obs = self._extract(
                    spec,
                    cached,
                    entries,
                    since=month,
                    today=min(today, month_end),
                )
                obs = [o for o in obs if o.period == month]
                out.extend(obs)
            except Exception as exc:  # noqa: BLE001
                log.exception("document[%s] month %s failed: %s", spec.key, month, exc)
        return out

    def _extract(
        self,
        spec: DocSpec,
        cached,
        entries: list,
        *,
        since: date,
        today: date,
    ) -> list[Observation]:
        if spec.extractor == "pdf_llm":
            return extract_pdf_llm(
                spec,
                cached,
                entries,
                since=since,
                today=today,
                history_by_key=self.history_by_key,
                force_refresh=self.force_refresh,
            )
        if spec.extractor == "xlsx_table":
            return extract_xlsx_table(spec, cached, entries, since=since, today=today)
        raise AdapterError(f"document[{spec.key}]: unsupported extractor {spec.extractor!r}")

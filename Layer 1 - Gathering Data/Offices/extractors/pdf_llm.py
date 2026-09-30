"""PDF → LLM structured extraction with quote evidence.

One call per document for the group of indexes that share the doc_key.
LLM values are never auto-published (method='llm'); validate.py enforces
that `raw_value` appears literally inside `evidence.quote`.
"""

from __future__ import annotations

import json
import logging
import os
import re
from datetime import date
from typing import Any

from adapters.base import AdapterError
from doc_cache import CachedDocument, load_extraction, save_extraction
from documents_registry import DocSpec
from extractors.pdf_pages import (
    _history_number_anchors,
    extract_pages,
    pages_as_prompt_blocks,
    select_pages,
)
from models import Observation
from registry import Entry

log = logging.getLogger(__name__)

DEFAULT_MODEL = os.environ.get("OFFICE_KPI_LLM_MODEL", "gpt-4.1-mini")
MAX_LLM_CALLS = int(os.environ.get("MAX_LLM_CALLS_PER_NIGHT", "20"))
_LLM_CALLS_TONIGHT = 0


EXTRACTION_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "items": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "properties": {
                    "index_key": {"type": "integer"},
                    "period": {
                        "type": "string",
                        "description": "YYYY for yearly, YYYY-MM for monthly",
                    },
                    "value": {"type": "number"},
                    "raw_value": {
                        "type": "string",
                        "description": "Value exactly as printed in the document",
                    },
                    "page": {"type": "integer"},
                    "quote": {
                        "type": "string",
                        "description": "Short verbatim snippet that contains raw_value",
                    },
                    "unit": {"type": "string"},
                    "confidence": {"type": "number"},
                },
                "required": [
                    "index_key",
                    "period",
                    "value",
                    "raw_value",
                    "page",
                    "quote",
                    "unit",
                    "confidence",
                ],
            },
        }
    },
    "required": ["items"],
}


def reset_llm_budget() -> None:
    global _LLM_CALLS_TONIGHT
    _LLM_CALLS_TONIGHT = 0


def llm_calls_used() -> int:
    return _LLM_CALLS_TONIGHT


def _parse_period(raw: str, frequency: str) -> date | None:
    s = (raw or "").strip()
    m = re.fullmatch(r"(20\d{2})(?:[-/.](\d{1,2}))?", s)
    if not m:
        return None
    year = int(m.group(1))
    month = int(m.group(2) or 1)
    if frequency == "yearly":
        return date(year, 1, 1)
    if not 1 <= month <= 12:
        return None
    return date(year, month, 1)


def _load_prompt(spec: DocSpec) -> str:
    if not spec.prompt_path or not spec.prompt_path.exists():
        return (
            "Extract the requested KPI values from the document text. "
            "Return only values you can quote verbatim."
        )
    return spec.prompt_path.read_text(encoding="utf-8")


def _history_hints(entries: list[Entry], history_by_key: dict[int, list[tuple[date, float]]]) -> str:
    lines: list[str] = []
    for e in entries:
        pts = history_by_key.get(e.key) or []
        last3 = pts[-3:]
        shown = ", ".join(f"{d.year}={v:g}" for d, v in last3) or "(none)"
        if last3:
            lo = min(v for _, v in last3) * 0.5
            hi = max(v for _, v in last3) * 2.0
            band = f" — reject candidates outside ~{lo:,.0f}…{hi:,.0f} unless clearly labeled"
        else:
            band = ""
        lines.append(f"- key {e.key} «{e.name}» ({e.frequency}): last points {shown}{band}")
    return "\n".join(lines)


def _index_instructions(spec: DocSpec, entries: list[Entry]) -> str:
    lines = []
    for e in entries:
        meta = spec.indexes.get(e.key) or {}
        definition = meta.get("definition") or e.notes or e.name
        field = meta.get("field") or e.params.get("field") or e.params.get("anchor") or ""
        lines.append(
            f"- index_key={e.key} name={e.name!r} field={field!r} "
            f"frequency={e.frequency} definition={definition!r}"
        )
    return "\n".join(lines)


def build_user_message(
    spec: DocSpec,
    entries: list[Entry],
    page_text: str,
    history_by_key: dict[int, list[tuple[date, float]]],
    edition: str | None,
) -> str:
    return "\n\n".join(
        [
            _load_prompt(spec),
            f"Document key: {spec.key}",
            f"Edition hint: {edition or 'unknown'}",
            "Indexes to extract:",
            _index_instructions(spec, entries),
            "Recent known values (for series disambiguation only — do not copy blindly):",
            _history_hints(entries, history_by_key),
            "Document text (selected pages):",
            page_text,
        ]
    )


def call_llm(user_message: str, *, model: str = DEFAULT_MODEL) -> list[dict[str, Any]]:
    global _LLM_CALLS_TONIGHT
    if _LLM_CALLS_TONIGHT >= MAX_LLM_CALLS:
        raise AdapterError(f"MAX_LLM_CALLS_PER_NIGHT={MAX_LLM_CALLS} exhausted")
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        raise AdapterError("OPENAI_API_KEY is required for PDF LLM extraction")

    from openai import OpenAI

    client = OpenAI(api_key=api_key)
    _LLM_CALLS_TONIGHT += 1
    log.info("LLM extract call #%d model=%s", _LLM_CALLS_TONIGHT, model)
    response = client.chat.completions.create(
        model=model,
        temperature=0,
        response_format={
            "type": "json_schema",
            "json_schema": {
                "name": "kpi_extraction",
                "strict": True,
                "schema": EXTRACTION_SCHEMA,
            },
        },
        messages=[
            {
                "role": "system",
                "content": (
                    "You extract numeric KPIs from Hebrew government PDFs. "
                    "Only report values you can support with a verbatim quote that contains raw_value. "
                    "If unsure, omit the item."
                ),
            },
            {"role": "user", "content": user_message},
        ],
    )
    content = response.choices[0].message.content or "{}"
    payload = json.loads(content)
    items = payload.get("items") or []
    if not isinstance(items, list):
        raise AdapterError("LLM response missing items[]")
    return items


def _plausible_vs_history(
    value: float,
    period: date,
    history: list[tuple[date, float]],
    *,
    frequency: str,
) -> bool:
    """Drop obvious wrong-series picks (e.g. property-crime totals for car theft).

    Zero is always allowed for non-negative series (Shabak killed counts are often 0).
    """
    if not history:
        return True
    if value == 0:
        return True
    if frequency == "monthly":
        same = [v for d, v in history if d.year == period.year and d.month == period.month]
    else:
        same = [v for d, v in history if d.year == period.year]
    if same:
        prev = same[-1]
        if prev == 0:
            return value >= 0 and value <= 50
        return abs(value - prev) / abs(prev) <= 0.15  # same period must nearly match
    last = history[-1][1]
    if last == 0:
        # Previous month was 0 — allow small non-negative counts for monthly fatalities etc.
        return value >= 0 and value <= 50
    ratio = abs(value) / abs(last)
    return 0.5 <= ratio <= 2.0


def _quote_allowed(quote: str, meta: dict[str, Any]) -> tuple[str | None, list[str]]:
    """Hard-reject forbidden series wording; soft-flag missing include tokens.

    Digits-only quotes are soft-flagged (kept for review) when no forbidden token is
    present — Shabak map slides often yield a bare headline total from the LLM.
    """
    q = quote or ""
    flags: list[str] = []
    forbid = meta.get("quote_must_not_include") or []
    hit = [tok for tok in forbid if tok in q]
    if hit:
        return f"quote contains forbidden token {hit!r}", flags
    must = meta.get("quote_must_include") or []
    if must and not any(tok in q for tok in must):
        flags.append("weak_quote_label")
    return None, flags


def items_to_observations(
    items: list[dict[str, Any]],
    *,
    spec: DocSpec,
    entries_by_key: dict[int, Entry],
    doc: CachedDocument,
    since: date,
    today: date,
    history_by_key: dict[int, list[tuple[date, float]]] | None = None,
) -> list[Observation]:
    history_by_key = history_by_key or {}
    wanted = set(entries_by_key) & set(spec.indexes)
    out: list[Observation] = []
    for item in items:
        try:
            key = int(item["index_key"])
        except (KeyError, TypeError, ValueError):
            continue
        if key not in wanted:
            continue
        entry = entries_by_key[key]
        period = _parse_period(str(item.get("period") or ""), entry.frequency)
        if period is None or period < since or period > today:
            continue
        try:
            value = float(item["value"])
        except (KeyError, TypeError, ValueError):
            continue
        hist = history_by_key.get(key) or []
        if not _plausible_vs_history(value, period, hist, frequency=entry.frequency):
            log.warning(
                "pdf_llm: drop key=%s period=%s value=%g — implausible vs history",
                key,
                period,
                value,
            )
            continue
        raw_value = str(item.get("raw_value") or "")
        quote = str(item.get("quote") or "")
        if raw_value and raw_value not in quote:
            log.warning(
                "pdf_llm: drop key=%s period=%s value=%g — raw_value %r not in quote %r",
                key,
                period,
                value,
                raw_value,
                quote[:80],
            )
            continue
        meta = spec.indexes.get(key) or {}
        bad_quote, quote_flags = _quote_allowed(quote, meta)
        if bad_quote:
            log.warning(
                "pdf_llm: drop key=%s period=%s value=%g — %s (quote=%r)",
                key,
                period,
                value,
                bad_quote,
                quote[:80],
            )
            continue
        page = item.get("page")
        conf = float(item.get("confidence") or 0.7)
        if "weak_quote_label" in quote_flags:
            log.info(
                "pdf_llm: key=%s period=%s value=%g — weak quote label (kept for review)",
                key,
                period,
                value,
            )
            conf = min(conf, 0.55)
        out.append(
            Observation(
                key=key,
                period=period,
                value=value,
                raw_value=raw_value,
                source_url=doc.url,
                method="llm",
                confidence=max(0.0, min(conf, 1.0)),
                evidence={
                    "doc_key": spec.key,
                    "document_sha256": doc.sha256,
                    "document_id": doc.db_id,
                    "edition": doc.edition,
                    "page": page,
                    "quote": quote,
                    "unit": item.get("unit"),
                    "extractor": "pdf_llm",
                    **({"flags": quote_flags} if quote_flags else {}),
                },
            )
        )
    return out


def extract_pdf_llm(
    spec: DocSpec,
    doc: CachedDocument,
    entries: list[Entry],
    *,
    since: date,
    today: date,
    history_by_key: dict[int, list[tuple[date, float]]] | None = None,
    force_refresh: bool = False,
) -> list[Observation]:
    """Extract observations from a cached PDF, reusing prior LLM output when possible."""
    history_by_key = history_by_key or {}
    entries_by_key = {e.key: e for e in entries}

    cached = None if force_refresh else load_extraction(doc.sha256)
    if cached and cached.get("extractor") == "pdf_llm":
        log.info("reusing cached extraction for %s", doc.sha256[:12])
        items = cached.get("items") or []
        return items_to_observations(
            items,
            spec=spec,
            entries_by_key=entries_by_key,
            doc=doc,
            since=since,
            today=today,
            history_by_key=history_by_key,
        )

    pages = extract_pages(doc.path)
    prefer_nums: list[str] = []
    for e in entries:
        pts = history_by_key.get(e.key) or []
        prefer_nums.extend(_history_number_anchors([v for _, v in pts[-3:]]))

    selected = select_pages(
        pages,
        spec.anchors,
        neighbors=1,
        prefer_numbers=prefer_nums,
        avoid_anchors=spec.avoid_anchors,
    )
    page_text = pages_as_prompt_blocks(selected)
    if not page_text.strip():
        raise AdapterError(f"pdf_llm[{spec.key}]: no text extracted from {doc.path.name}")

    user_msg = build_user_message(spec, entries, page_text, history_by_key, doc.edition)
    items = call_llm(user_msg)
    save_extraction(
        doc.sha256,
        {
            "extractor": "pdf_llm",
            "doc_key": spec.key,
            "url": doc.url,
            "edition": doc.edition,
            "model": DEFAULT_MODEL,
            "items": items,
        },
    )
    return items_to_observations(
        items,
        spec=spec,
        entries_by_key=entries_by_key,
        doc=doc,
        since=since,
        today=today,
        history_by_key=history_by_key,
    )

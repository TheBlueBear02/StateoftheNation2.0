#!/usr/bin/env python3
"""Stage 2 — Parse Wikipedia wikitable segments into raw_poll_rows."""

from __future__ import annotations

import hashlib
import json
import logging
import re
from datetime import date

from bs4 import BeautifulSoup, Tag
from supabase import Client

import fetch_wikipedia
from db import MAIN_WIKI_PAGE, WIKI_PAGES, get_supabase

log = logging.getLogger(__name__)

SKIP_SECTION_PATTERNS = re.compile(
    r"(?i)(arab voter|preferred prime minister|coalition poll|other question|"
    r"voting intention|pollsters and publishers|graphical summary|guide to the table|"
    r"notes|references|external links|percentage)",
)

# Matches "29 Jul" and Wikipedia ranges like "29–30 Jul" / "29– 30 Jul".
EVENT_ROW_PATTERN = re.compile(
    r"^\d{1,2}(?:\s*[–—\-]\s*\d{1,2})?\s+"
    r"(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)",
    re.I,
)

BELOW_THRESHOLD = re.compile(r"^\(([\d.]+)%\)$")
SEATS_INT = re.compile(r"^\d+$")
DASH = re.compile(r"^[–—\-]$")

META_COLUMNS = {
    "date", "fieldwork date", "fieldwork", "polling firm", "pollster",
    "polling firm/pollster", "publisher", "sample size", "sample",
    "margin of error", "moe", "mode", "lead", "ref.", "ref", "reference",
    "total", "right bloc", "left bloc", "gov.", "gov", "government",
    "others", "other parties", "other jewish parties", "other",
}

SKIP_PARTY_LABELS = re.compile(
    r"(?i)^(others?|other parties|other jewish parties|total|gov\.?|right bloc|left bloc)$",
)

FOOTNOTE = re.compile(r"\s*\[[^\]]*\]\s*")


def _strip_footnotes(text: str) -> str:
    """Remove Wikipedia footnote markers like [20] / [ 21 ] and collapse whitespace."""
    return re.sub(r"\s+", " ", FOOTNOTE.sub(" ", text or "")).strip()


def _content_hash(payload: dict) -> str:
    canonical = json.dumps(payload, sort_keys=True, ensure_ascii=False)
    return hashlib.sha256(canonical.encode()).hexdigest()


def _natural_key(fieldwork_raw: str, pollster: str, publisher: str, section: str) -> str:
    # Footnote renumbering between wiki revisions must not create a new poll identity.
    # Scenario sections keep their path; regular seat tables share one bucket so heading
    # renames do not duplicate the same poll.
    section_key = (
        section
        if "scenario" in (section or "").lower()
        else "seat_projections"
    )
    raw = "|".join(
        [
            _strip_footnotes(fieldwork_raw),
            _strip_footnotes(pollster),
            _strip_footnotes(publisher),
            section_key,
        ]
    )
    return hashlib.sha256(raw.encode()).hexdigest()


def _parse_cell(value: str) -> dict | None:
    value = value.strip()
    if not value or value.lower() in ("n/a", "tba", "na"):
        return None
    if DASH.match(value):
        return None
    m = BELOW_THRESHOLD.match(value)
    if m:
        return {"seats": None, "vote_share": float(m.group(1)), "below_threshold": True}
    if SEATS_INT.match(value):
        return {"seats": int(value), "vote_share": None, "below_threshold": None}
    return None


def _normalize_header(text: str) -> str:
    return re.sub(r"\s+", " ", text.strip().lower())


def _clean_party_label(text: str) -> str:
    text = FOOTNOTE.sub("", text)
    return re.sub(r"\s+", " ", text.strip())


def _is_party_column(label: str) -> bool:
    cleaned = _clean_party_label(label)
    if not cleaned:
        return False
    norm = _normalize_header(cleaned)
    if norm in META_COLUMNS:
        return False
    if SKIP_PARTY_LABELS.match(cleaned):
        return False
    if re.match(r"^(right|left|gov)", norm):
        return False
    return True


GROUP_HEADERS = frozenset({
    "joint list",
    "labor–meretz",
    "labor-meretz",
    "national unity–yesh atid",
    "yesh atid–national unity",
})


def _is_data_row(tr: Tag) -> bool:
    cells = tr.find_all("td")
    if not cells:
        return False
    first_text = cells[0].get_text(" ", strip=True)
    return bool(EVENT_ROW_PATTERN.match(first_text))


def _header_rows_for(table: Tag) -> list[Tag]:
    tbody = table.find("tbody") or table
    rows: list[Tag] = []
    for tr in tbody.find_all("tr"):
        if _is_data_row(tr):
            break
        if tr.find(["th", "td"]):
            rows.append(tr)
    return rows


def _place_header_row(
    grid: list[list[str]],
    tr: Tag,
    row_idx: int,
    rowspan_remaining: dict[int, tuple[str, int]],
) -> None:
    while len(grid) <= row_idx:
        grid.append([])

    col = 0
    for cell in tr.find_all(["th", "td"]):
        while col in rowspan_remaining:
            label, remaining = rowspan_remaining[col]
            while len(grid[row_idx]) <= col:
                grid[row_idx].append("")
            if not grid[row_idx][col]:
                grid[row_idx][col] = label
            remaining -= 1
            if remaining <= 0:
                del rowspan_remaining[col]
            else:
                rowspan_remaining[col] = (label, remaining)
            col += 1

        text = _clean_party_label(cell.get_text(" ", strip=True))
        colspan = int(cell.get("colspan", 1))
        rowspan = int(cell.get("rowspan", 1))

        for c in range(colspan):
            while len(grid[row_idx]) <= col + c:
                grid[row_idx].append("")
            if text:
                grid[row_idx][col + c] = text
            if rowspan > 1:
                rowspan_remaining[col + c] = (text, rowspan - 1)

        col += colspan


def _finalize_column_label(column_labels: list[str]) -> str:
    parts = [label for label in column_labels if label]
    if not parts:
        return ""

    if len(parts) == 1:
        return parts[0]

    deepest = parts[-1]
    if _normalize_header(deepest) in GROUP_HEADERS:
        return deepest

    for part in reversed(parts):
        if _normalize_header(part) not in GROUP_HEADERS:
            return part

    return deepest


def _build_header_map(table: Tag) -> list[str]:
    """Build per-column labels accounting for rowspan/colspan in multi-row headers."""
    header_rows = _header_rows_for(table)
    if not header_rows:
        return []

    grid: list[list[str]] = []
    rowspan_remaining: dict[int, tuple[str, int]] = {}

    for row_idx, tr in enumerate(header_rows):
        _place_header_row(grid, tr, row_idx, rowspan_remaining)

    if not grid:
        return []

    max_cols = max(len(row) for row in grid)
    for row in grid:
        while len(row) < max_cols:
            row.append("")

    return [
        _finalize_column_label([row[col_i] for row in grid])
        for col_i in range(max_cols)
    ]


def _expand_row_cells(tr: Tag) -> list[tuple[str, bool]]:
    """Expand a table row to one slot per column; mark colspan continuations."""
    expanded: list[tuple[str, bool]] = []
    for cell in tr.find_all(["td", "th"]):
        text = cell.get_text(" ", strip=True)
        colspan = int(cell.get("colspan", 1))
        expanded.append((text, False))
        for _ in range(colspan - 1):
            expanded.append((text, True))
    return expanded


def _is_event_row(cells: list[str]) -> bool:
    if len(cells) < 2:
        return False
    non_empty = [c for c in cells if c.strip()]
    if len(non_empty) == 1:
        return bool(EVENT_ROW_PATTERN.match(non_empty[0]))
    first = cells[0].strip()
    rest = "".join(cells[1:]).strip()
    if EVENT_ROW_PATTERN.match(first) and not rest.replace("–", "").replace("—", "").strip():
        return True
    if len(non_empty) <= 2 and EVENT_ROW_PATTERN.match(first):
        return True
    return False


def _extract_meta_indices(headers: list[str]) -> dict[str, int | None]:
    indices: dict[str, int | None] = {
        "fieldwork": None, "pollster": None, "publisher": None,
        "sample": None, "margin": None, "source": None,
    }
    for i, h in enumerate(headers):
        norm = _normalize_header(h)
        if "fieldwork" in norm or norm == "date":
            indices["fieldwork"] = i
        elif "pollster" in norm or "polling firm" in norm:
            indices["pollster"] = i
        elif "publisher" in norm:
            indices["publisher"] = i
        elif "sample" in norm:
            indices["sample"] = i
        elif "margin" in norm:
            indices["margin"] = i
        elif norm in ("ref.", "ref", "reference"):
            indices["source"] = i
    return indices


def _section_should_skip(section_path: str) -> bool:
    return bool(SKIP_SECTION_PATTERNS.search(section_path))


def _section_is_scenario(section_path: str) -> bool:
    return "scenario" in section_path.lower()


def _walk_sections(
    soup: BeautifulSoup,
    *,
    latest_only: bool = False,
) -> list[tuple[str, Tag]]:
    """Return (section_path, table) pairs for in-scope wikitables.

    latest_only=True keeps only the first Seat projections table (newest polls)
    and skips scenario / archived continuation tables.
    """
    results: list[tuple[str, Tag]] = []
    section_stack: list[str] = []
    heading_tags = {"h2", "h3", "h4", "h5"}

    for element in soup.find_all(["h2", "h3", "h4", "h5", "table"]):
        if element.name in heading_tags:
            level = int(element.name[1])
            title = element.get_text(" ", strip=True)
            # Trim edit links
            title = re.sub(r"\[edit\]", "", title, flags=re.I).strip()
            while len(section_stack) >= level - 1:
                section_stack.pop()
            section_stack.append(title)
            continue

        if element.name == "table" and "wikitable" in (element.get("class") or []):
            path = " > ".join(section_stack)
            if _section_should_skip(path):
                continue
            if latest_only:
                if "seat projection" not in path.lower() or _section_is_scenario(path):
                    continue
                results.append((path, element))
                break
            if "seat projection" not in path.lower() and not _section_is_scenario(path):
                continue
            results.append((path, element))

    return results


def _parse_table(
    section_path: str,
    table: Tag,
    *,
    source_page: str,
    revid: int,
    page_year_hint: int,
) -> list[dict]:
    headers = _build_header_map(table)
    if not headers:
        return rows_from_fallback(table, section_path, source_page, revid, page_year_hint)
    meta = _extract_meta_indices(headers)
    party_columns = {
        i: _clean_party_label(headers[i])
        for i, h in enumerate(headers)
        if h and _is_party_column(h)
        and meta.get("fieldwork") != i
        and meta.get("pollster") != i
        and meta.get("publisher") != i
        and meta.get("sample") != i
        and meta.get("margin") != i
        and meta.get("source") != i
    }

    is_scenario = _section_is_scenario(section_path)
    rows_out: list[dict] = []
    tbody = table.find("tbody") or table
    row_index = 0

    for tr in tbody.find_all("tr"):
        expanded = _expand_row_cells(tr)
        cells = [text for text, _ in expanded]
        if not cells or all(not c for c in cells):
            continue
        if tr.find("th") and not tr.find("td"):
            continue
        if _is_event_row(cells):
            continue
        if not _is_data_row(tr):
            continue

        fieldwork_raw = _strip_footnotes(
            cells[meta["fieldwork"]]
            if meta["fieldwork"] is not None and meta["fieldwork"] < len(cells)
            else cells[0]
        )
        pollster = _strip_footnotes(
            cells[meta["pollster"]]
            if meta["pollster"] is not None and meta["pollster"] < len(cells)
            else ""
        )
        publisher = _strip_footnotes(
            cells[meta["publisher"]]
            if meta["publisher"] is not None and meta["publisher"] < len(cells)
            else ""
        )
        sample_raw = cells[meta["sample"]] if meta["sample"] is not None and meta["sample"] < len(cells) else ""
        margin_raw = cells[meta["margin"]] if meta["margin"] is not None and meta["margin"] < len(cells) else ""

        if not pollster and not publisher:
            continue
        if not re.search(r"\d", fieldwork_raw):
            continue

        results: dict[str, dict] = {}
        for col_i, label in party_columns.items():
            if col_i >= len(expanded):
                continue
            cell_text, is_span_continuation = expanded[col_i]
            if is_span_continuation:
                continue
            parsed = _parse_cell(cell_text)
            if parsed:
                results[label] = parsed

        if not results:
            # Event / annotation rows often start with a date but have no seat cells.
            continue

        payload = {
            "fieldwork_raw": fieldwork_raw,
            "pollster": pollster,
            "publisher": publisher,
            "sample_raw": sample_raw,
            "margin_raw": margin_raw,
            "page_year_hint": page_year_hint,
            "header_map": {str(k): v for k, v in party_columns.items()},
            "party_results": results,
            "is_scenario": is_scenario,
            "scenario_desc": section_path if is_scenario else None,
        }

        nk = _natural_key(fieldwork_raw, pollster, publisher, section_path)
        ch = _content_hash(payload)
        rows_out.append({
            "source_page": source_page,
            "revid": revid,
            "section": section_path,
            "row_index": row_index,
            "payload": payload,
            "content_hash": ch,
            "natural_key": nk,
            "status": "pending",
        })
        row_index += 1

    return rows_out


def rows_from_fallback(table, section_path, source_page, revid, page_year_hint):
    """Minimal fallback if header detection fails."""
    return []


def _page_year_hint(source_page: str) -> int:
    if "2024" in source_page:
        return 2024
    if "2025" in source_page:
        return 2025
    if "2022" in source_page or "2023" in source_page:
        return 2023
    return 2026


def parse_html(
    source_page: str,
    revid: int,
    html: str,
    *,
    latest_only: bool = False,
) -> list[dict]:
    soup = BeautifulSoup(html, "html.parser")
    year_hint = _page_year_hint(source_page)
    all_rows: list[dict] = []

    tables = _walk_sections(soup, latest_only=latest_only)
    if latest_only:
        log.info("  latest-only mode: %d seat-projection table(s)", len(tables))

    for section_path, table in tables:
        rows = _parse_table(
            section_path, table,
            source_page=source_page,
            revid=revid,
            page_year_hint=year_hint,
        )
        all_rows.extend(rows)
        log.info("  %s: %d rows", section_path[:60], len(rows))
        if not rows:
            tbody = table.find("tbody") or table
            tr_count = len(tbody.find_all("tr"))
            log.warning(
                "  %s: parsed 0 poll rows from table with %d <tr> "
                "(check header detection / date-range rows)",
                section_path[:60],
                tr_count,
            )

    return all_rows


def _existing_row_keys(sb: Client, rows: list[dict]) -> set[tuple[str, str]]:
    """Return {(natural_key, content_hash)} already in staging."""
    keys = list({r["natural_key"] for r in rows})
    found: set[tuple[str, str]] = set()
    for i in range(0, len(keys), 50):
        chunk = keys[i : i + 50]
        data = (
            sb.table("raw_poll_rows")
            .select("natural_key, content_hash")
            .in_("natural_key", chunk)
            .execute()
            .data
        ) or []
        for row in data:
            found.add((row["natural_key"], row["content_hash"]))
    return found


def run(
    sb: Client,
    *,
    backfill: bool = False,
    force: bool = False,
    dry_run: bool = False,
) -> int:
    pages = WIKI_PAGES if backfill else [MAIN_WIKI_PAGE]
    latest_only = not backfill
    inserted = 0
    skipped = 0

    for page in pages:
        cached = fetch_wikipedia.load_cached(page)
        if not cached:
            cached_list = fetch_wikipedia.run(sb, backfill=backfill, force=force, dry_run=dry_run, pages=[page])
            if cached_list:
                cached = cached_list[0]["parse"]
            else:
                log.warning("No cached data for %s — run stage 1 first", page)
                continue

        revid = cached["revid"]
        html = cached["text"]
        rows = parse_html(page, revid, html, latest_only=latest_only)
        log.info(
            "Parsed %d rows from %s (%s)",
            len(rows),
            page,
            "latest table only" if latest_only else "full page",
        )

        if dry_run or not rows:
            continue

        existing = _existing_row_keys(sb, rows)
        for row in rows:
            key = (row["natural_key"], row["content_hash"])
            if key in existing:
                skipped += 1
                continue
            try:
                sb.table("raw_poll_rows").insert(row).execute()
                inserted += 1
                existing.add(key)
            except Exception as exc:
                log.warning("Insert failed for %s: %s", row["natural_key"][:16], exc)

    log.info("Stage 2 done: %d new rows, %d unchanged skipped", inserted, skipped)
    return inserted


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s  %(levelname)-8s  %(message)s")
    run(get_supabase(), backfill=True)

"""Find document edition URL(s) for a document key.

Order of attempts (per OfficeKpiPipeline.md §4.7):
  1. BlobFolder / URL templates with year substituted
  2. Plain requests against a listing page + link_regex
  3. Playwright (optional) when the page is JS-rendered / bot-blocked

Yearly docs (police yearbook): ``discover()`` returns the newest edition.
Monthly one-period-per-file docs (Shabak): ``discover_all()`` returns every
month PDF found; the adapter downloads each missing month separately.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from datetime import date
from typing import Any
from urllib.parse import unquote, urljoin, urlparse

import requests

from documents_registry import DocSpec

log = logging.getLogger(__name__)

USER_AGENT = "StateOfTheNationKpiBot/1.0 (+https://www.stateofthenation.co.il)"


class DiscoverError(RuntimeError):
    """Raised when no document URL can be found."""


# Keep the name AdapterError so callers that catch adapter failures still work.
AdapterError = DiscoverError

SESSION = requests.Session()
SESSION.headers.update(
    {
        "User-Agent": USER_AGENT,
        "Accept": "text/html,application/xhtml+xml,application/pdf,*/*;q=0.8",
        "Accept-Language": "he,en;q=0.8",
    }
)

HEBREW_MONTHS: dict[str, int] = {
    "ינואר": 1,
    "פברואר": 2,
    "מרץ": 3,
    "אפריל": 4,
    "מאי": 5,
    "יוני": 6,
    "יולי": 7,
    "אוגוסט": 8,
    "ספטמבר": 9,
    "אוקטובר": 10,
    "נובמבר": 11,
    "דצמבר": 12,
}


@dataclass(frozen=True)
class DiscoveredDoc:
    url: str
    edition: str | None
    method: str  # blob_template | page_scrape | playwright | seed

    @property
    def period(self) -> date | None:
        """Canonical period start if edition is YYYY or YYYY-MM."""
        if not self.edition:
            return None
        m = re.fullmatch(r"(20\d{2})(?:-(\d{1,2}))?", self.edition.strip())
        if not m:
            return None
        year = int(m.group(1))
        month = int(m.group(2) or 1)
        if not 1 <= month <= 12:
            return None
        return date(year, month, 1)

    @property
    def rank(self) -> int:
        p = self.period
        if not p:
            return 0
        return p.year * 12 + p.month


def _years(today: date, years_back: int) -> list[int]:
    return list(range(today.year, today.year - years_back - 1, -1))


def parse_edition(url: str, how: str, link_text: str = "") -> str | None:
    """Normalize an edition label: yearly ``YYYY`` or monthly ``YYYY-MM``."""
    blob = " ".join(x for x in (link_text, unquote(url)) if x)
    if how in ("link_text", "hebrew_month", "hebrew_month_year"):
        year_m = re.search(r"(20\d{2})", blob)
        # Longest match wins (avoids rare substring collisions across month names).
        month_hits = [(name, num) for name, num in HEBREW_MONTHS.items() if name in blob]
        month = max(month_hits, key=lambda t: len(t[0]))[1] if month_hits else None
        if year_m and month:
            return f"{year_m.group(1)}-{month:02d}"
        # Filename sometimes uses Latin month fragments or YYYY-MM
        m2 = re.search(r"(20\d{2})[-_./](\d{1,2})", blob)
        if m2 and 1 <= int(m2.group(2)) <= 12:
            return f"{m2.group(1)}-{int(m2.group(2)):02d}"
        if year_m:
            return year_m.group(1)
        return None
    if how == "url_year":
        path = urlparse(url).path
        name = unquote(path.rsplit("/", 1)[-1])
        m = re.search(r"(20\d{2})", name) or re.search(r"(20\d{2})", unquote(path))
        return m.group(1) if m else None
    if how == "page_date":
        return None
    # default: try monthly hebrew then year
    return parse_edition(url, "hebrew_month_year", link_text) or parse_edition(
        url, "url_year", link_text
    )


# Back-compat alias used elsewhere
def _edition_from_url(url: str, how: str, link_text: str = "") -> str | None:
    return parse_edition(url, how, link_text)


def _looks_like_file(url: str) -> bool:
    path = urlparse(url).path.lower()
    return path.endswith((".pdf", ".xlsx", ".xls", ".csv", ".pptx"))


def _probe_url(url: str, timeout: int = 20) -> bool:
    try:
        r = SESSION.head(url, timeout=timeout, allow_redirects=True)
        if r.status_code < 400:
            ctype = (r.headers.get("Content-Type") or "").lower()
            # gov.il sometimes returns HTML 200 shells; prefer real files.
            if "text/html" in ctype and not _looks_like_file(url):
                pass
            else:
                return True
        # Some gov hosts reject HEAD; try a tiny GET range.
        r = SESSION.get(url, timeout=timeout, stream=True, headers={"Range": "bytes=0-0"})
        ok = r.status_code < 400
        r.close()
        return ok
    except requests.RequestException:
        return False


def _seed_candidate(url: str, edition_from: str) -> DiscoveredDoc:
    """Always keep known seed URLs — probe can be blocked even when GET works."""
    ed = _edition_from_url(url, edition_from)
    return DiscoveredDoc(url=url, edition=ed, method="seed")


def _find_pdfs_in_folder(folder_url: str, link_regex: re.Pattern[str]) -> list[tuple[str, str]]:
    """List PDF hrefs under a BlobFolder / directory-style page."""
    try:
        r = SESSION.get(folder_url, timeout=30)
        r.raise_for_status()
    except requests.RequestException as exc:
        log.debug("folder list failed %s: %s", folder_url, exc)
        return []
    hrefs = re.findall(r'href=["\']([^"\']+)["\']', r.text, flags=re.I)
    out: list[tuple[str, str]] = []
    for href in hrefs:
        abs_url = urljoin(folder_url, href)
        text = href
        if link_regex.search(abs_url) or link_regex.search(text):
            if _looks_like_file(abs_url) or abs_url.lower().endswith(".pdf"):
                out.append((abs_url, text))
    return out


def _scrape_page(page_url: str, link_regex: re.Pattern[str], prefer: re.Pattern[str] | None) -> list[tuple[str, str]]:
    try:
        r = SESSION.get(page_url, timeout=30)
        r.raise_for_status()
        html = r.text
    except requests.RequestException as exc:
        log.warning("page scrape failed %s: %s", page_url, exc)
        return []
    # Bot / empty shell / Cloudflare challenge detection
    if (
        len(html) < 400
        or "Bot detected" in html
        or "Just a moment" in html
        or "cf-browser-verification" in html
        or "Performing security verification" in html
    ):
        log.info("page scrape looks blocked/empty: %s", page_url)
        return []
    hrefs = re.findall(r'href=["\']([^"\']+)["\']', html, flags=re.I)
    texts = re.findall(r'<a[^>]+href=["\']([^"\']+)["\'][^>]*>(.*?)</a>', html, flags=re.I | re.S)
    by_url: dict[str, str] = {}
    for href in hrefs:
        abs_url = urljoin(page_url, href)
        if link_regex.search(abs_url) or link_regex.search(href):
            by_url.setdefault(abs_url, href)
    for href, inner in texts:
        abs_url = urljoin(page_url, href)
        clean = re.sub(r"<[^>]+>", " ", inner)
        clean = re.sub(r"\s+", " ", clean).strip()
        if link_regex.search(abs_url) or link_regex.search(clean) or link_regex.search(href):
            by_url[abs_url] = clean or href
    items = list(by_url.items())
    if prefer:
        preferred = [(u, t) for u, t in items if prefer.search(u) or prefer.search(t)]
        if preferred:
            items = preferred
    return items


def _playwright_links(page_url: str, link_regex: re.Pattern[str]) -> list[tuple[str, str]]:
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        log.info("playwright not installed — skipping JS discovery for %s", page_url)
        return []
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            page = browser.new_page(user_agent=USER_AGENT)
            page.goto(page_url, wait_until="domcontentloaded", timeout=90_000)
            # Cloudflare / SPA: wait until PDF links appear (or timeout).
            try:
                page.wait_for_selector("a[href*='.pdf']", timeout=45_000)
            except Exception:
                page.wait_for_timeout(5_000)
            hrefs = page.eval_on_selector_all(
                "a[href]",
                "els => els.map(e => [e.href, (e.innerText || '').trim()])",
            )
            browser.close()
    except Exception as exc:  # noqa: BLE001 — discovery must not crash the night
        log.warning("playwright discovery failed for %s: %s", page_url, exc)
        return []
    out: list[tuple[str, str]] = []
    for href, text in hrefs or []:
        if link_regex.search(href or "") or link_regex.search(text or ""):
            out.append((href, text or href))
    return out


def _collect_candidates(spec: DocSpec, today: date) -> list[DiscoveredDoc]:
    """Gather every matching edition URL (deduped by URL, best edition wins)."""
    cfg = spec.discover
    link_re = re.compile(str(cfg.get("link_regex") or r"\.pdf$"), re.I)
    prefer_re = re.compile(str(cfg["prefer_regex"]), re.I) if cfg.get("prefer_regex") else None
    edition_from = str(cfg.get("edition_from") or "url_year")
    years_back = int(cfg.get("years_back") or 3)
    found: list[DiscoveredDoc] = []

    # 1) BlobFolder / URL templates by year
    for year in _years(today, years_back):
        for tmpl in cfg.get("blob_templates") or []:
            folder = str(tmpl).format(year=year)
            if not folder.endswith("/"):
                if _probe_url(folder):
                    found.append(
                        DiscoveredDoc(
                            url=folder,
                            edition=_edition_from_url(folder, edition_from) or str(year),
                            method="blob_template",
                        )
                    )
                continue
            for url, text in _find_pdfs_in_folder(folder, link_re):
                found.append(
                    DiscoveredDoc(
                        url=url,
                        edition=_edition_from_url(url, edition_from, text) or str(year),
                        method="blob_template",
                    )
                )

    # 2) Listing page scrape (templates + fixed page)
    pages: list[str] = []
    if cfg.get("page"):
        pages.append(str(cfg["page"]))
    for tmpl in cfg.get("page_templates") or []:
        for year in _years(today, years_back):
            pages.append(str(tmpl).format(year=year))
    seen_pages: set[str] = set()
    for page_url in pages:
        if page_url in seen_pages:
            continue
        seen_pages.add(page_url)
        links = _scrape_page(page_url, link_re, prefer_re)
        method = "page_scrape"
        if not links:
            links = _playwright_links(page_url, link_re)
            method = "playwright"
        for url, text in links:
            if not _looks_like_file(url) and not url.lower().endswith(".pdf"):
                continue
            found.append(
                DiscoveredDoc(
                    url=url,
                    edition=_edition_from_url(url, edition_from, text),
                    method=method,
                )
            )

    # 3) Seed URLs
    for seed in cfg.get("seed_urls") or []:
        url = str(seed)
        found.append(_seed_candidate(url, edition_from))

    # Dedupe by URL; keep highest-rank edition metadata if duplicates.
    by_url: dict[str, DiscoveredDoc] = {}
    for doc in found:
        prev = by_url.get(doc.url)
        if prev is None or doc.rank >= prev.rank:
            by_url[doc.url] = doc
    return list(by_url.values())


def discover_all(spec: DocSpec, today: date) -> list[DiscoveredDoc]:
    """All matching editions, newest first. Used for monthly one-PDF-per-month sources."""
    docs = _collect_candidates(spec, today)
    if not docs:
        raise AdapterError(f"discover[{spec.key}]: no document URL found")
    docs.sort(key=lambda d: (d.rank, d.url), reverse=True)
    log.info("discover_all[%s] → %d edition(s)", spec.key, len(docs))
    return docs


def discover(spec: DocSpec, today: date) -> DiscoveredDoc:
    """Return the newest matching document URL for this doc_key (yearly sources)."""
    docs = discover_all(spec, today)
    best = docs[0]
    log.info(
        "discover[%s] → %s (edition=%s, via %s)",
        spec.key,
        best.url,
        best.edition,
        best.method,
    )
    return best


def discover_from_config(discover_cfg: dict[str, Any], today: date, *, doc_key: str = "?") -> DiscoveredDoc:
    """Test helper: run discovery against a raw discover block."""
    spec = DocSpec(
        key=doc_key,
        title=doc_key,
        extractor="pdf_llm",
        frequency="yearly",
        discover=discover_cfg,
        indexes={},
    )
    return discover(spec, today)

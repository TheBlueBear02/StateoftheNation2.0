"""PDF page text helpers: pdfplumber extract, Hebrew RTL repair, anchor windowing."""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass

log = logging.getLogger(__name__)

HEBREW_RE = re.compile(r"[\u0590-\u05FF]")


@dataclass
class PdfPage:
    number: int  # 1-based
    text: str


def _hebrew_ratio(text: str) -> float:
    letters = [c for c in text if c.isalpha() or HEBREW_RE.match(c)]
    if not letters:
        return 0.0
    heb = sum(1 for c in letters if HEBREW_RE.match(c))
    return heb / len(letters)


# Common yearbook words as emitted by pdfplumber when the whole token is reversed.
_REVERSED_MARKERS = (
    "תוריבע",  # עבירות
    "שוכר",  # רכוש
    "הבינג",  # גניבה
    "בכר",  # רכב
    "םיקית",  # תיקים
    "ןותנשה",  # השנתון
    "תרטשמ",  # משטרת
)


def _token_looks_reversed(token: str) -> bool:
    """Heuristic: Hebrew word that is more plausible when reversed."""
    if len(token) < 3 or not HEBREW_RE.search(token):
        return False
    bare = re.sub(r"[^\u0590-\u05FF]", "", token)
    if bare in _REVERSED_MARKERS:
        return True
    # Short words like רכב↔בכר are too ambiguous for the proclitic test.
    if len(bare) < 4:
        return False
    flipped = bare[::-1]
    return bool(flipped) and flipped[0] in "ובכלמש" and bare[0] not in "ובכלמש"


def maybe_fix_hebrew_rtl(text: str) -> str:
    """If a large share of Hebrew tokens look reversed, flip each Hebrew run."""
    if _hebrew_ratio(text) < 0.15:
        return text
    tokens = re.findall(r"\S+|\s+", text)
    hebrew_tokens = [t for t in tokens if HEBREW_RE.search(t) and t.strip()]
    if not hebrew_tokens:
        return text
    reversed_share = sum(1 for t in hebrew_tokens if _token_looks_reversed(t)) / len(hebrew_tokens)
    # Also trigger when several known reversed markers appear (table-heavy pages).
    marker_hits = sum(1 for m in _REVERSED_MARKERS if m in text)
    if reversed_share < 0.25 and marker_hits < 3:
        return text
    out: list[str] = []
    for t in tokens:
        if HEBREW_RE.search(t) and t.strip():
            # Flip contiguous Hebrew letters inside the token; keep digits/punct.
            out.append(re.sub(r"[\u0590-\u05FF]+", lambda m: m.group(0)[::-1], t))
        else:
            out.append(t)
    return "".join(out)


def extract_pages(path) -> list[PdfPage]:
    try:
        import pdfplumber
    except ImportError as exc:
        raise RuntimeError(
            "pdfplumber is required for PDF extraction — pip install pdfplumber"
        ) from exc

    pages: list[PdfPage] = []
    with pdfplumber.open(str(path)) as pdf:
        for i, page in enumerate(pdf.pages, start=1):
            raw = page.extract_text() or ""
            # Also pull simple tables as TSV so numbers survive better.
            table_bits: list[str] = []
            try:
                for table in page.extract_tables() or []:
                    for row in table:
                        cells = [str(c).strip() if c is not None else "" for c in row]
                        if any(cells):
                            table_bits.append("\t".join(cells))
            except Exception:  # noqa: BLE001
                pass
            text = raw
            if table_bits:
                text = (raw + "\n" + "\n".join(table_bits)).strip()
            text = maybe_fix_hebrew_rtl(text)
            pages.append(PdfPage(number=i, text=text))
    if not any(p.text.strip() for p in pages):
        log.warning("PDF %s has no extractable text layer (OCR not enabled in v1)", path)
    return pages


def _anchor_variants(anchor: str) -> list[str]:
    """Match both readable Hebrew and pdfplumber-reversed tokens."""
    if not anchor:
        return []
    variants = [anchor]
    # Reverse contiguous Hebrew runs (mirror of maybe_fix_hebrew_rtl).
    flipped = re.sub(r"[\u0590-\u05FF]+", lambda m: m.group(0)[::-1], anchor)
    if flipped != anchor:
        variants.append(flipped)
    # Also whole-string reverse (some extractors reverse the full phrase).
    whole = anchor[::-1]
    if whole not in variants:
        variants.append(whole)
    return variants


def _history_number_anchors(values: list[float]) -> list[str]:
    out: list[str] = []
    for v in values:
        if abs(v - round(v)) < 1e-9:
            n = int(round(v))
            out.append(str(n))
            out.append(f"{n:,}")
        else:
            out.append(f"{v:g}")
    return out


def select_pages(
    pages: list[PdfPage],
    anchors: list[str],
    *,
    neighbors: int = 1,
    prefer_numbers: list[str] | None = None,
    avoid_anchors: list[str] | None = None,
) -> list[PdfPage]:
    """Keep pages that contain any anchor, plus ±neighbors. Fall back to all pages if none hit.

    ``prefer_numbers`` (e.g. recent history values like ``22,165``) boost pages that also
    contain those digits so the LLM sees the table row that matches our series.
    ``avoid_anchors`` demote pages that match look-alike wrong series (e.g. מעצרים vs פיגועים).
    """
    if not pages:
        return []
    variants: list[str] = []
    for a in anchors:
        variants.extend(_anchor_variants(a))
    prefer_numbers = [n for n in (prefer_numbers or []) if n]
    avoid_variants: list[str] = []
    for a in avoid_anchors or []:
        avoid_variants.extend(_anchor_variants(a))

    if not variants and not prefer_numbers:
        return pages

    hits: set[int] = set()
    preferred: set[int] = set()
    avoided: set[int] = set()
    for p in pages:
        text = p.text
        text_hit = any(a in text for a in variants)
        num_hit = any(n in text for n in prefer_numbers)
        avoid_hit = bool(avoid_variants) and any(a in text for a in avoid_variants)
        if text_hit or num_hit:
            hits.add(p.number)
        if avoid_hit and p.number in hits:
            # Only demote if the page also lacks a strong prefer signal.
            if not (text_hit and num_hit):
                avoided.add(p.number)
        if text_hit and num_hit:
            preferred.add(p.number)
        elif num_hit and prefer_numbers:
            preferred.add(p.number)

    if not hits:
        log.info("no anchor hits — sending all %d pages (truncated later by budget)", len(pages))
        return pages

    keep: set[int] = set()
    seed = preferred or hits
    for n in seed:
        for i in range(n - neighbors, n + neighbors + 1):
            if 1 <= i <= pages[-1].number:
                keep.add(i)
    # Always keep plain text hits too (with neighbors), even if prefer_numbers matched elsewhere.
    for n in hits:
        for i in range(n - neighbors, n + neighbors + 1):
            if 1 <= i <= pages[-1].number:
                keep.add(i)

    selected = [p for p in pages if p.number in keep]

    def _rank(p: PdfPage) -> tuple[int, int, int]:
        # 0 = preferred, 1 = normal hit, 2 = avoided look-alike
        if p.number in preferred:
            tier = 0
        elif p.number in avoided:
            tier = 2
        else:
            tier = 1
        return (tier, p.number)

    selected.sort(key=_rank)
    if preferred or avoided:
        log.info(
            "select_pages: %d pages (preferred=%s avoided=%s)",
            len(selected),
            sorted(preferred),
            sorted(avoided),
        )
    return selected


def pages_as_prompt_blocks(pages: list[PdfPage], *, max_chars: int = 60_000) -> str:
    """Serialize selected pages for the LLM, truncating if needed."""
    blocks: list[str] = []
    used = 0
    for p in pages:
        header = f"\n--- page {p.number} ---\n"
        body = p.text.strip()
        if not body:
            continue
        piece = header + body
        if used + len(piece) > max_chars and blocks:
            blocks.append(f"\n--- truncated after page {p.number - 1} (budget {max_chars} chars) ---")
            break
        blocks.append(piece)
        used += len(piece)
    return "".join(blocks).strip()

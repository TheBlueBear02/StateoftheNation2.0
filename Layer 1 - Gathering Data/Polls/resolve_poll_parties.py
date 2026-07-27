#!/usr/bin/env python3
"""Stage 3 — Resolve Wikipedia party labels via poll_party_aliases."""

from __future__ import annotations

import json
import logging
import re
from datetime import date
from pathlib import Path

from supabase import Client

from db import get_supabase

log = logging.getLogger(__name__)

REVIEW_FILE = Path(__file__).parent / "review_queue.json"
FOOTNOTE = re.compile(r"\s*\[[^\]]*\]\s*")
SKIP_LABELS = re.compile(
    r"(?i)^(others?|other parties|other jewish parties|total|gov\.?)$",
)


def _normalize_label(label: str) -> str:
    label = FOOTNOTE.sub("", label)
    label = re.sub(r"\s+", " ", label.strip())
    # Normalize dash variants to en-dash for alias lookup
    label = label.replace("–", "–").replace("—", "–").replace("-", "–")
    return label


def _load_aliases(sb: Client) -> list[dict]:
    return sb.table("poll_party_aliases").select("*").execute().data or []


def _resolve_label(
    raw_label: str,
    fieldwork_end: date | None,
    aliases: list[dict],
) -> int | None:
    candidates = [raw_label, raw_label.replace("–", "-"), raw_label.replace("-", "–")]
    for candidate in candidates:
        matches = [a for a in aliases if a["raw_label"] == candidate]
        if not matches:
            matches = [
                a for a in aliases
                if candidate.startswith(a["raw_label"]) or a["raw_label"] in candidate
            ]
        if not matches:
            continue

        if fieldwork_end:
            for a in matches:
                vf = a.get("valid_from")
                vt = a.get("valid_to")
                if vf and fieldwork_end < date.fromisoformat(vf[:10]):
                    continue
                if vt and fieldwork_end > date.fromisoformat(vt[:10]):
                    continue
                return a["party_id"]

        return matches[0]["party_id"]

    return None


def _parse_fieldwork_end(payload: dict) -> date | None:
    """Best-effort date for alias window lookup before full normalization."""
    raw = payload.get("fieldwork_raw", "")
    import re
    m = re.search(r"(\d{4})", raw)
    if m:
        return date(int(m.group(1)), 6, 15)
    hint = payload.get("page_year_hint", 2026)
    return date(hint, 6, 15)


def _append_review(entry: dict, review: list[dict]) -> None:
    key = (entry["raw_label"], entry.get("section", ""))
    for existing in review:
        if (existing["raw_label"], existing.get("section", "")) == key:
            existing["seen_count"] = existing.get("seen_count", 1) + 1
            return
    entry["seen_count"] = 1
    review.append(entry)


def run(sb: Client, dry_run: bool = False) -> tuple[int, int]:
    aliases = _load_aliases(sb)
    pending = (
        sb.table("raw_poll_rows")
        .select("*")
        .eq("status", "pending")
        .execute()
        .data
    ) or []

    review: list[dict] = []
    if REVIEW_FILE.exists():
        try:
            review = json.loads(REVIEW_FILE.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            review = []

    resolved = 0
    rejected = 0

    for row in pending:
        payload = row["payload"]
        party_results = payload.get("party_results", {})
        fieldwork_end = _parse_fieldwork_end(payload)
        resolved_parties: dict[str, int] = {}
        unmapped: list[str] = []

        for label in party_results:
            if SKIP_LABELS.match(_normalize_label(label)):
                continue
            norm_label = _normalize_label(label)
            party_id = _resolve_label(norm_label, fieldwork_end, aliases)
            if not party_id and norm_label != label:
                party_id = _resolve_label(label, fieldwork_end, aliases)
            if party_id:
                resolved_parties[label] = party_id
            else:
                unmapped.append(label)

        if not party_results or not resolved_parties:
            if not dry_run:
                sb.table("raw_poll_rows").update({
                    "status": "rejected",
                    "error": "No mappable party results",
                }).eq("id", row["id"]).execute()
            rejected += 1
            continue

        if unmapped:
            for label in unmapped:
                _append_review({
                    "raw_label": label,
                    "section": row.get("section"),
                    "fieldwork_raw": payload.get("fieldwork_raw"),
                    "pollster": payload.get("pollster"),
                    "publisher": payload.get("publisher"),
                }, review)
            if not dry_run:
                sb.table("raw_poll_rows").update({
                    "status": "rejected",
                    "error": f"Unmapped labels: {', '.join(unmapped)}",
                }).eq("id", row["id"]).execute()
            rejected += 1
            continue

        payload["resolved_parties"] = resolved_parties
        if not dry_run:
            sb.table("raw_poll_rows").update({"payload": payload}).eq("id", row["id"]).execute()
        resolved += 1

    if not dry_run:
        REVIEW_FILE.write_text(json.dumps(review, ensure_ascii=False, indent=2), encoding="utf-8")

    log.info("Resolved %d rows, rejected %d, review queue: %d entries", resolved, rejected, len(review))
    return resolved, rejected


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s  %(levelname)-8s  %(message)s")
    run(get_supabase())

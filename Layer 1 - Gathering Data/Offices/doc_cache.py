"""Download + sha256 dedupe for KPI source documents.

Local cache (always used, including dry-run / offline):
  .kpi_cache/documents/{sha256}{ext}
  .kpi_cache/documents/{sha256}.meta.json
  .kpi_cache/extractions/{sha256}.json

Supabase: optional upsert into kpi_documents + Storage bucket `kpi-sources`
when a writable store with those methods is available.
"""

from __future__ import annotations

import hashlib
import json
import logging
import re
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import requests

from adapters.base import USER_AGENT, AdapterError
from discover import DiscoveredDoc

log = logging.getLogger(__name__)

CACHE_ROOT = Path(__file__).resolve().parent / ".kpi_cache"
DOC_DIR = CACHE_ROOT / "documents"
EXTRACT_DIR = CACHE_ROOT / "extractions"


@dataclass
class CachedDocument:
    sha256: str
    url: str
    path: Path
    edition: str | None
    doc_key: str
    content_type: str | None
    fetched_at: str
    discover_method: str
    db_id: int | None = None

    @property
    def suffix(self) -> str:
        return self.path.suffix.lower()


def _ext_from_url(url: str, content_type: str | None) -> str:
    path = urlparse(url).path.lower()
    for ext in (".pdf", ".xlsx", ".xls", ".csv", ".pptx"):
        if path.endswith(ext):
            return ext
    ct = (content_type or "").lower()
    if "pdf" in ct:
        return ".pdf"
    if "sheet" in ct or "excel" in ct:
        return ".xlsx"
    if "csv" in ct:
        return ".csv"
    return ".bin"


def ensure_cache_dirs() -> None:
    DOC_DIR.mkdir(parents=True, exist_ok=True)
    EXTRACT_DIR.mkdir(parents=True, exist_ok=True)


def meta_path(sha: str) -> Path:
    return DOC_DIR / f"{sha}.meta.json"


def extraction_path(sha: str) -> Path:
    return EXTRACT_DIR / f"{sha}.json"


def load_meta(sha: str) -> dict[str, Any] | None:
    p = meta_path(sha)
    if not p.exists():
        return None
    return json.loads(p.read_text(encoding="utf-8"))


def save_extraction(sha: str, payload: dict[str, Any]) -> Path:
    ensure_cache_dirs()
    p = extraction_path(sha)
    p.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    return p


def load_extraction(sha: str) -> dict[str, Any] | None:
    p = extraction_path(sha)
    if not p.exists():
        return None
    return json.loads(p.read_text(encoding="utf-8"))


def download(discovered: DiscoveredDoc, doc_key: str, *, timeout: int = 120) -> CachedDocument:
    """Fetch URL (or reuse identical sha256 already on disk)."""
    ensure_cache_dirs()
    try:
        r = requests.get(
            discovered.url,
            timeout=timeout,
            headers={"User-Agent": USER_AGENT},
            stream=True,
        )
        r.raise_for_status()
    except requests.RequestException as exc:
        raise AdapterError(f"download failed for {discovered.url}: {exc}") from exc

    content_type = r.headers.get("Content-Type")
    hasher = hashlib.sha256()
    chunks: list[bytes] = []
    for chunk in r.iter_content(chunk_size=1024 * 256):
        if not chunk:
            continue
        hasher.update(chunk)
        chunks.append(chunk)
    data = b"".join(chunks)
    if not data:
        raise AdapterError(f"download empty: {discovered.url}")
    sha = hasher.hexdigest()
    ext = _ext_from_url(discovered.url, content_type)
    path = DOC_DIR / f"{sha}{ext}"
    if not path.exists():
        path.write_bytes(data)
        log.info("cached document %s (%d bytes) → %s", sha[:12], len(data), path.name)
    else:
        log.info("document %s already cached", sha[:12])

    meta = {
        "sha256": sha,
        "url": discovered.url,
        "path": str(path),
        "edition": discovered.edition,
        "doc_key": doc_key,
        "content_type": content_type,
        "fetched_at": datetime.now(timezone.utc).isoformat(),
        "discover_method": discovered.method,
        "bytes": len(data),
    }
    meta_path(sha).write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
    return CachedDocument(
        sha256=sha,
        url=discovered.url,
        path=path,
        edition=discovered.edition,
        doc_key=doc_key,
        content_type=content_type,
        fetched_at=meta["fetched_at"],
        discover_method=discovered.method,
    )


def download_local(path: Path, doc_key: str, *, url: str | None = None, edition: str | None = None) -> CachedDocument:
    """Register an already-local file (fixtures / manual drop-ins)."""
    ensure_cache_dirs()
    data = path.read_bytes()
    sha = hashlib.sha256(data).hexdigest()
    ext = path.suffix.lower() or ".bin"
    dest = DOC_DIR / f"{sha}{ext}"
    if not dest.exists():
        dest.write_bytes(data)
    meta = {
        "sha256": sha,
        "url": url or path.as_uri(),
        "path": str(dest),
        "edition": edition,
        "doc_key": doc_key,
        "content_type": None,
        "fetched_at": datetime.now(timezone.utc).isoformat(),
        "discover_method": "local",
        "bytes": len(data),
    }
    meta_path(sha).write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
    return CachedDocument(
        sha256=sha,
        url=meta["url"],
        path=dest,
        edition=edition,
        doc_key=doc_key,
        content_type=None,
        fetched_at=meta["fetched_at"],
        discover_method="local",
    )


def persist_to_store(store: Any, doc: CachedDocument) -> CachedDocument:
    """Upsert kpi_documents (+ optional Storage) when the store supports it."""
    save = getattr(store, "save_document", None)
    if not callable(save):
        return doc
    try:
        db_id = save(doc)
        doc.db_id = db_id
    except Exception as exc:  # noqa: BLE001
        log.warning("kpi_documents upsert failed: %s", exc)
    return doc


def as_public_dict(doc: CachedDocument) -> dict[str, Any]:
    d = asdict(doc)
    d["path"] = str(doc.path)
    return d


_SAFE = re.compile(r"[^a-zA-Z0-9._-]+")


def storage_object_name(doc: CachedDocument) -> str:
    edition = _SAFE.sub("_", doc.edition or "unknown")
    return f"{doc.doc_key}/{edition}/{doc.sha256}{doc.suffix}"

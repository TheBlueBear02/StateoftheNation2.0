"""Load and validate documents.yaml (one entry per doc_key)."""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import yaml

DOCUMENTS_PATH = Path(__file__).resolve().parent / "documents.yaml"
EXTRACTORS = ("pdf_llm", "xlsx_table")


class DocumentsRegistryError(ValueError):
    pass


@dataclass(frozen=True)
class DocSpec:
    key: str
    title: str
    extractor: str
    frequency: str
    discover: dict[str, Any]
    indexes: dict[int, dict[str, Any]]
    anchors: list[str] = field(default_factory=list)
    avoid_anchors: list[str] = field(default_factory=list)
    prompt: str | None = None
    table: dict[str, Any] = field(default_factory=dict)
    raw: dict[str, Any] = field(default_factory=dict, compare=False, repr=False)

    @property
    def prompt_path(self) -> Path | None:
        if not self.prompt:
            return None
        return Path(__file__).resolve().parent / self.prompt


def load_documents(path: Path = DOCUMENTS_PATH) -> dict[str, DocSpec]:
    data = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    if not isinstance(data, dict):
        raise DocumentsRegistryError("documents.yaml must be a mapping of doc_key → spec")
    out: dict[str, DocSpec] = {}
    for key, row in data.items():
        if not isinstance(row, dict):
            raise DocumentsRegistryError(f"documents.yaml[{key!r}] must be a mapping")
        extractor = str(row.get("extractor") or "")
        if extractor not in EXTRACTORS:
            raise DocumentsRegistryError(f"documents.yaml[{key!r}]: bad extractor {extractor!r}")
        indexes_raw = row.get("indexes") or {}
        indexes = {int(k): dict(v) for k, v in indexes_raw.items()}
        out[str(key)] = DocSpec(
            key=str(key),
            title=str(row.get("title") or key),
            extractor=extractor,
            frequency=str(row.get("frequency") or "yearly"),
            discover=dict(row.get("discover") or {}),
            indexes=indexes,
            anchors=[str(a) for a in (row.get("anchors") or [])],
            avoid_anchors=[str(a) for a in (row.get("avoid_anchors") or [])],
            prompt=str(row["prompt"]) if row.get("prompt") else None,
            table=dict(row.get("table") or {}),
            raw=row,
        )
    return out

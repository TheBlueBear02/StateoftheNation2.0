"""Shared data contract between adapters, validation and publishing."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from typing import Any, Literal

Method = Literal["api", "api_unofficial", "table", "llm", "manual"]


@dataclass
class Observation:
    """One value for one index and one period, as returned by an adapter."""

    key: int                      # registry key
    period: date                  # canonical period start (see periods.py)
    value: float
    source_url: str
    method: Method
    confidence: float = 1.0
    raw_value: str | None = None
    evidence: dict[str, Any] | None = None


@dataclass
class Candidate:
    """An observation after normalization, comparison and validation."""

    obs: Observation
    index_id: int                 # resolved Supabase index id
    recorded_at: date
    label: str
    kind: Literal["new", "revision", "same"]
    previous_value: float | None
    flags: list[str] = field(default_factory=list)
    rejected: str | None = None   # hard failure reason → never staged
    auto_publish: bool = False

    @property
    def status(self) -> str:
        if self.rejected:
            return "rejected"
        if self.kind == "same":
            return "unchanged"
        return "published" if self.auto_publish else "pending"

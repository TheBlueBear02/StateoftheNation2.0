"""Validation rules and the auto-publish policy.

Hard failures reject a value (it is never staged). Soft flags stage it for review.
"""

from __future__ import annotations

import math
import statistics
from datetime import date

from models import Candidate
from registry import Entry

DEFAULT_YEARLY_MAX_JUMP = 0.40        # ±40% vs previous point
DEFAULT_MONTHLY_MAX_JUMP = 0.50
MONTHLY_SIGMA = 4.0                   # or a change > 4σ away from the recent typical change
MONTHLY_SIGMA_WINDOW = 36             # periods of history used for that σ
AUTO_REVISION_MAX_PCT = 0.02          # API revisions under 2% apply automatically
AUTO_METHODS = {"api", "api_unofficial"}


def _rel(a: float, b: float) -> float:
    if b == 0:
        return math.inf if a != 0 else 0.0
    return abs(a - b) / abs(b)


def validate(
    cand: Candidate,
    entry: Entry,
    history: list[tuple[date, float]],   # sorted (recorded_at, value), existing published points
    today: date,
) -> Candidate:
    obs = cand.obs
    v = obs.value

    # ── hard failures ──
    if v is None or not isinstance(v, (int, float)) or not math.isfinite(v):
        cand.rejected = f"not a finite number: {v!r}"
        return cand
    if obs.period > today:
        cand.rejected = f"period {obs.period} is in the future"
        return cand
    if entry.bounds and not (entry.bounds[0] <= v <= entry.bounds[1]):
        cand.rejected = f"value {v} outside bounds {entry.bounds}"
        return cand
    if obs.method == "llm":
        quote = (obs.evidence or {}).get("quote", "")
        if not obs.raw_value or obs.raw_value not in quote:
            cand.rejected = "llm evidence quote does not contain raw_value"
            return cand

    # ── soft flags ──
    prev = [(d, x) for d, x in history if d < cand.recorded_at]
    if prev:
        last = prev[-1][1]
        if entry.frequency == "monthly" and len(prev) >= 12:
            recent = prev[-(MONTHLY_SIGMA_WINDOW + 1):]
            diffs = [b[1] - a[1] for a, b in zip(recent, recent[1:])]
            mean, sd = statistics.fmean(diffs), statistics.pstdev(diffs)
            z = abs((v - last) - mean) / sd if sd > 0 else 0.0
            if z > MONTHLY_SIGMA:
                cand.flags.append(f"jump_{z:.1f}sd")
        else:
            limit = entry.max_jump_pct or (
                DEFAULT_YEARLY_MAX_JUMP if entry.frequency == "yearly" else DEFAULT_MONTHLY_MAX_JUMP
            )
            if _rel(v, last) > limit:
                cand.flags.append(f"jump_{_rel(v, last):.0%}")
    if cand.kind == "revision" and cand.previous_value is not None:
        pct = _rel(v, cand.previous_value)
        if pct >= AUTO_REVISION_MAX_PCT:
            cand.flags.append(f"revision_{pct:.1%}")
    if obs.confidence < 0.9:
        cand.flags.append(f"low_confidence_{obs.confidence:.2f}")

    cand.auto_publish = (
        cand.kind != "same" and obs.method in AUTO_METHODS and not cand.flags
    )
    return cand

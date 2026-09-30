"""Period arithmetic, site label conventions and release windows.

A *period* is always represented by its first day:
  yearly  → date(Y, 1, 1)
  monthly → date(Y, M, 1)

The site stores each point as (recorded_at, label). Which day and label format an
index uses is its ``label_rule`` (see kpi_sources.yaml). Adapters only produce
periods; this module is the single place that turns them into site values.
"""

from __future__ import annotations

import re
from calendar import monthrange
from datetime import date, timedelta

FREQUENCIES = ("monthly", "yearly")
LABEL_RULES = ("yearly_jan1", "month_start", "month_end")


def period_of(d: date, freq: str) -> date:
    """Canonical period start containing ``d``."""
    if freq == "yearly":
        return date(d.year, 1, 1)
    if freq == "monthly":
        return date(d.year, d.month, 1)
    raise ValueError(f"unknown frequency {freq!r}")


def next_period(p: date, freq: str, n: int = 1) -> date:
    if freq == "yearly":
        return date(p.year + n, 1, 1)
    months = p.year * 12 + (p.month - 1) + n
    return date(months // 12, months % 12 + 1, 1)


def period_end(p: date, freq: str) -> date:
    if freq == "yearly":
        return date(p.year, 12, 31)
    return date(p.year, p.month, monthrange(p.year, p.month)[1])


def periods_between(start: date, end: date, freq: str) -> int:
    """Number of whole periods from start to end (end exclusive, can be negative)."""
    if freq == "yearly":
        return end.year - start.year
    return (end.year - start.year) * 12 + (end.month - start.month)


# ── Site labels ──────────────────────────────────────────────────────────────


def to_site(period: date, label_rule: str) -> tuple[date, str]:
    """Period → (recorded_at, label) exactly as the dashboard stores them."""
    if label_rule == "yearly_jan1":
        return date(period.year, 1, 1), f"{period.year}"
    if label_rule == "month_start":
        d = date(period.year, period.month, 1)
        return d, d.strftime("%d.%m.%Y")
    if label_rule == "month_end":
        d = period_end(period, "monthly")
        return d, d.strftime("%d.%m.%Y")
    raise ValueError(f"unknown label_rule {label_rule!r}")


def parse_site_label(label: str) -> date | None:
    """Old-style label (YYYY / DD.MM.YYYY) → date. Mirrors seed_office_dashboard.py."""
    text = (label or "").strip()
    if re.fullmatch(r"\d{4}", text):
        return date(int(text), 1, 1)
    m = re.fullmatch(r"(\d{1,2})\.(\d{1,2})\.(\d{4})", text)
    if m:
        day, month, year = int(m[1]), int(m[2]), int(m[3])
        return date(year, month, min(day, monthrange(year, month)[1]))
    return None


# ── Release windows ──────────────────────────────────────────────────────────


def _mmdd(year: int, text: str) -> date:
    month, day = (int(x) for x in text.split("-"))
    return date(year, month, min(day, monthrange(year, month)[1]))


def release_window(target: date, freq: str, release: dict) -> tuple[date, date]:
    """When data for ``target`` is expected to appear.

    monthly: [end + min_lag_days, end + max_lag_days]
    yearly : "MM-DD..MM-DD" in the year after the period (``year_offset``, default 1;
             use 0 for figures published during the period's own year, e.g. a January
             price). If the end is before the start (e.g. "11-15..02-28") the window
             wraps into the following year.
    """
    if freq == "monthly":
        end = period_end(target, "monthly")
        return (
            end + timedelta(days=int(release.get("min_lag_days", 5))),
            end + timedelta(days=int(release.get("max_lag_days", 45))),
        )
    window = release.get("window", "03-01..12-31")
    start_s, end_s = (s.strip() for s in window.split(".."))
    year = target.year + int(release.get("year_offset", 1))
    start = _mmdd(year, start_s)
    end = _mmdd(year, end_s)
    if end < start:
        # A wrapping window that starts late in the year (e.g. "11-15..02-28")
        # still starts in year+1 and ends in year+2.
        end = _mmdd(year + 1, end_s)
    return start, end

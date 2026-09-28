"""Nightly planner — decides which indexes are worth checking tonight.

For each index:
  latest  = newest known period (published in index_data, or already staged)
  target  = latest + 1 period            ← the period we are hunting
  window  = release window of target      (registry `release`)

  before window                → skip   "not_yet"
  inside window                → check  every `check_every_days`
  after window                 → check  weekly, marked overdue (alert)
  adapter not built yet        → skip   "no_adapter" (listed in the report)
  --force / --index            → check  regardless of windows
  1st of month, API adapters   → check  "revision_sweep" (catch revised figures)
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime

from periods import next_period, release_window
from registry import Entry

OVERDUE_RECHECK_DAYS = 7
REVISION_SWEEP_FAMILIES = {"cbs_price", "cbs_series", "obudget", "worldbank", "boi_sdmx", "datagov"}


@dataclass
class CheckState:
    target_period: date
    last_checked_at: datetime | None
    attempts: int = 0
    status: str = "waiting"


@dataclass
class PlanItem:
    entry: Entry
    latest: date | None
    target: date | None
    window: tuple[date, date] | None
    action: str                   # "check" | "skip"
    reason: str                   # not_yet | in_window | checked_recently | overdue | ...
    overdue: bool = False
    attempts: int = 0

    @property
    def due(self) -> bool:
        return self.action == "check"


def _days_since(ts: datetime | None, today: date) -> int | None:
    if ts is None:
        return None
    return (today - ts.date()).days


def plan(
    entries: list[Entry],
    latest_by_key: dict[int, date | None],
    states: dict[tuple[int, date], CheckState],
    today: date,
    implemented: set[str],
    *,
    force: bool = False,
    only_keys: set[int] | None = None,
) -> list[PlanItem]:
    items: list[PlanItem] = []
    for e in entries:
        if only_keys is not None and e.key not in only_keys:
            continue

        latest = latest_by_key.get(e.key)
        if latest is None:
            items.append(PlanItem(e, None, None, None, "skip", "no_history_or_unresolved"))
            continue

        target = next_period(latest, e.frequency)
        window = release_window(target, e.frequency, e.release)
        state = states.get((e.key, target))
        since = _days_since(state.last_checked_at if state else None, today)
        attempts = state.attempts if state else 0

        def item(action: str, reason: str, overdue: bool = False) -> PlanItem:
            return PlanItem(e, latest, target, window, action, reason, overdue, attempts)

        has_adapter = e.adapter_family in implemented
        overdue = today > window[1]

        if not has_adapter:
            items.append(item("skip", "no_adapter", overdue))
            continue
        if force or only_keys is not None:
            items.append(item("check", "forced", overdue))
            continue
        if today < window[0]:
            if today.day == 1 and e.adapter_family in REVISION_SWEEP_FAMILIES:
                items.append(item("check", "revision_sweep"))
            else:
                items.append(item("skip", "not_yet"))
            continue
        if overdue:
            if since is None or since >= OVERDUE_RECHECK_DAYS:
                items.append(item("check", "overdue", True))
            else:
                items.append(item("skip", "overdue_checked_recently", True))
            continue
        if since is not None and since < e.check_every_days:
            items.append(item("skip", "checked_recently"))
            continue
        items.append(item("check", "in_window"))
    return items


def summarize(items: list[PlanItem]) -> dict[str, int]:
    out: dict[str, int] = {}
    for it in items:
        out[it.reason] = out.get(it.reason, 0) + 1
    out["due"] = sum(1 for it in items if it.due)
    out["overdue"] = sum(1 for it in items if it.overdue)
    return out


def format_plan(items: list[PlanItem]) -> str:
    lines = [f"{'key':>4}  {'action':6}  {'reason':26}  {'latest':10}  {'target':10}  {'window':23}  name"]
    for it in sorted(items, key=lambda x: (not x.due, x.reason, x.entry.key)):
        w = f"{it.window[0]}..{it.window[1]}" if it.window else "-"
        lines.append(
            f"{it.entry.key:>4}  {it.action:6}  {it.reason + (' ⚠' if it.overdue else ''):26}  "
            f"{str(it.latest or '-'):10}  {str(it.target or '-'):10}  {w:23}  "
            f"{it.entry.name} [{it.entry.adapter}]"
        )
    return "\n".join(lines)

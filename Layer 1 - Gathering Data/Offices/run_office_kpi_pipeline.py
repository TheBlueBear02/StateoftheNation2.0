#!/usr/bin/env python3
"""
run_office_kpi_pipeline.py — nightly refresh of /government/dashboard indexes
============================================================================
One entry point for every source. The planner decides what is due tonight;
adapters fetch; values are normalized, validated, staged and (when trusted)
published to index_data.

Usage:
  python run_office_kpi_pipeline.py                  # normal nightly run
  python run_office_kpi_pipeline.py --plan-only      # print tonight's plan and why
  python run_office_kpi_pipeline.py --dry-run        # plan + fetch + validate, write nothing
  python run_office_kpi_pipeline.py --index 56       # one registry key, ignore windows
  python run_office_kpi_pipeline.py --force          # check everything that has an adapter
  python run_office_kpi_pipeline.py --date 2026-10-15 --plan-only   # simulate another day
  python run_office_kpi_pipeline.py --backtest       # compare adapters to ALL existing history (no writes)
  python run_office_kpi_pipeline.py --offline ...    # use the repo SQLite snapshot instead of Supabase

Env: SUPABASE_URL, SUPABASE_SERVICE_KEY (not needed with --offline),
     OPENAI_API_KEY (only for the homepage headline), PIPELINE_RUN_SOURCE.
"""

from __future__ import annotations

import argparse
import logging
import os
import sys
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from datetime import date, datetime, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

from dotenv import load_dotenv

HERE = Path(__file__).resolve().parent
LAYER1 = HERE.parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(LAYER1))

from adapters import ADAPTERS, FAMILY_ORDER  # noqa: E402
from adapters.base import FetchTask  # noqa: E402
from models import Candidate, Observation  # noqa: E402
from periods import next_period, period_of, to_site  # noqa: E402
from planner import PlanItem, format_plan, plan, summarize  # noqa: E402
from registry import Entry, load_registry  # noqa: E402
from validate import validate  # noqa: E402

load_dotenv(LAYER1.parent / ".env")
load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("office-kpis")

PIPELINE_NAME = "office-kpis"
JERUSALEM = ZoneInfo("Asia/Jerusalem")
ATTENTION_FILE = HERE / "attention.md"
# How far back each check re-reads, so revised figures are noticed.
REVISION_LOOKBACK = {"monthly": 12, "yearly": 3}
BACKTEST_SINCE = date(1990, 1, 1)


@dataclass
class RunResult:
    items: list[PlanItem]
    candidates: list[Candidate] = field(default_factory=list)
    errors: dict[str, str] = field(default_factory=dict)          # family → error
    found_keys: set[int] = field(default_factory=set)
    unresolved: list[Entry] = field(default_factory=list)
    state_rows: list[dict] = field(default_factory=list)

    def counts(self) -> Counter:
        c = Counter()
        for cand in self.candidates:
            c[cand.kind] += 1
            c[cand.status] += 1
        return c


def build_candidates(
    observations: list[Observation],
    entries_by_key: dict[int, Entry],
    key_to_id: dict[int, int],
    history: dict[int, list[tuple[date, float]]],
    today: date,
) -> list[Candidate]:
    # Last observation wins per (key, period)
    latest_obs: dict[tuple[int, date], Observation] = {}
    for o in observations:
        latest_obs[(o.key, o.period)] = o

    out: list[Candidate] = []
    # Working copy per index: accepted values from this run join the series, so each
    # new point is compared with the one right before it (not only with old history).
    working: dict[int, list[tuple[date, float]]] = {}
    for (key, _), obs in sorted(latest_obs.items()):
        entry = entries_by_key[key]
        index_id = key_to_id[key]
        recorded_at, label = to_site(obs.period, entry.label_rule)
        series = working.setdefault(index_id, list(history.get(index_id, [])))
        existing = {period_of(d, entry.frequency): v for d, v in history.get(index_id, [])}
        prev = existing.get(obs.period)
        if prev is None:
            kind = "new"
        elif abs(prev - obs.value) <= 1e-9 * max(1.0, abs(prev)):
            kind = "same"
        else:
            kind = "revision"
        cand = Candidate(
            obs=obs,
            index_id=index_id,
            recorded_at=recorded_at,
            label=label,
            kind=kind,
            previous_value=prev,
        )
        cand = validate(cand, entry, series, today)
        out.append(cand)
        if not cand.rejected and cand.kind != "same":
            series[:] = sorted([(d, v) for d, v in series if d != recorded_at] + [(recorded_at, obs.value)])
    return out


def run(
    store,
    entries: list[Entry],
    today: date,
    *,
    force: bool = False,
    only_keys: set[int] | None = None,
    plan_only: bool = False,
    backtest: bool = False,
    adapters: dict | None = None,
) -> RunResult:
    adapters = ADAPTERS if adapters is None else adapters
    entries_by_key = {e.key: e for e in entries}

    key_to_id = store.resolve(entries)
    unresolved = [e for e in entries if e.key not in key_to_id]
    ids = sorted(set(key_to_id.values()))
    history = store.history(ids)
    staged = store.staged_latest(ids)
    raw_states = store.check_states(ids)
    id_to_key = {v: k for k, v in key_to_id.items()}
    states = {(id_to_key[i], t): s for (i, t), s in raw_states.items() if i in id_to_key}

    latest_by_key: dict[int, date | None] = {}
    for e in entries:
        index_id = key_to_id.get(e.key)
        if index_id is None:
            latest_by_key[e.key] = None
            continue
        dates = [d for d, _ in history.get(index_id, [])]
        if index_id in staged:
            dates.append(staged[index_id])
        latest_by_key[e.key] = period_of(max(dates), e.frequency) if dates else None

    items = plan(
        entries,
        latest_by_key,
        states,
        today,
        set(adapters),
        force=force or backtest,
        only_keys=only_keys,
    )
    result = RunResult(items=items, unresolved=unresolved)
    if plan_only:
        return result

    due = [it for it in items if it.due]
    by_family: dict[str, list[PlanItem]] = defaultdict(list)
    for it in due:
        by_family[it.entry.adapter_family].append(it)

    observations: list[Observation] = []
    for family in sorted(by_family, key=lambda f: FAMILY_ORDER.index(f) if f in FAMILY_ORDER else 99):
        group = by_family[family]
        tasks = [
            FetchTask(
                entry=it.entry,
                since=BACKTEST_SINCE
                if backtest
                else next_period(it.target, it.entry.frequency, -REVISION_LOOKBACK[it.entry.frequency]),
            )
            for it in group
        ]
        try:
            obs = adapters[family].fetch(tasks, today)
            log.info("[%s] %d tasks → %d observations", family, len(tasks), len(obs))
            observations.extend(obs)
        except Exception as exc:  # one broken source must not stop the night
            log.exception("[%s] adapter failed", family)
            result.errors[family] = f"{type(exc).__name__}: {exc}"

    result.candidates = build_candidates(observations, entries_by_key, key_to_id, history, today)

    targets = {it.entry.key: it.target for it in due}
    for c in result.candidates:
        if not c.rejected and c.kind != "same" and c.obs.period >= targets[c.obs.key]:
            result.found_keys.add(c.obs.key)

    now = datetime.now(timezone.utc).isoformat()
    for it in due:
        failed = result.errors.get(it.entry.adapter_family)
        if it.entry.key in result.found_keys:
            status = "found"
        elif failed:
            status = "error"
        elif it.overdue:
            status = "overdue"
        else:
            status = "checking"
        result.state_rows.append(
            {
                "index_id": key_to_id[it.entry.key],
                "target_period": it.target.isoformat(),
                "window_start": it.window[0].isoformat(),
                "window_end": it.window[1].isoformat(),
                "last_checked_at": now,
                "attempts": it.attempts + 1,
                "status": status,
                "last_error": failed,
            }
        )
    return result


# ── Reporting ────────────────────────────────────────────────────────────────


def format_candidates(cands: list[Candidate], entries_by_key: dict[int, Entry]) -> str:
    rows = [c for c in cands if c.kind != "same" or c.rejected]
    if not rows:
        return "(no new or changed values)"
    lines = [f"{'key':>4}  {'label':10}  {'value':>18}  {'kind':8}  {'status':9}  flags / reason  name"]
    for c in rows:
        prev = f" (was {c.previous_value:g})" if c.previous_value is not None and c.kind == "revision" else ""
        why = c.rejected or ",".join(c.flags)
        lines.append(
            f"{c.obs.key:>4}  {c.label:10}  {c.obs.value:>18,.4g}  {c.kind:8}  {c.status:9}  "
            f"{why}{prev}  {entries_by_key[c.obs.key].name}"
        )
    return "\n".join(lines)


def format_backtest(cands: list[Candidate], entries_by_key: dict[int, Entry]) -> str:
    by_key: dict[int, Counter] = defaultdict(Counter)
    worst: dict[int, float] = {}
    for c in cands:
        by_key[c.obs.key][c.kind] += 1
        if c.kind == "revision" and c.previous_value:
            pct = abs(c.obs.value - c.previous_value) / abs(c.previous_value)
            worst[c.obs.key] = max(worst.get(c.obs.key, 0.0), pct)
    lines = [f"{'key':>4}  {'match':>5}  {'differ':>6}  {'new':>4}  {'max diff':>8}  name"]
    for key, cnt in sorted(by_key.items()):
        overlap = cnt["same"] + cnt["revision"]
        lines.append(
            f"{key:>4}  {cnt['same']:>5}  {cnt['revision']:>6}  {cnt['new']:>4}  "
            f"{worst.get(key, 0):>8.1%}  {entries_by_key[key].name}"
            + ("   ← no overlap with history" if overlap == 0 else "")
        )
    return "\n".join(lines)


def attention_report(result: RunResult, pending_total: int) -> str | None:
    overdue = [it for it in result.items if it.overdue and it.reason != "no_adapter"]
    no_adapter = [it for it in result.items if it.reason == "no_adapter"]
    lines: list[str] = []
    if pending_total:
        lines.append(f"### {pending_total} value(s) waiting for review\nReview at `/government/dashboard/edit`.\n")
    if result.errors:
        lines.append("### Failing sources")
        lines += [f"- `{fam}`: {err}" for fam, err in result.errors.items()]
        lines.append("")
    if overdue:
        lines.append("### Overdue indexes (release window passed, no new data)")
        lines += [
            f"- **{it.entry.name}** (key {it.entry.key}, `{it.entry.adapter}`): hunting {it.target}, "
            f"window ended {it.window[1]}"
            for it in overdue
        ]
        lines.append("")
    if lines and no_adapter:
        # Informational only — never the sole reason to open the issue.
        lines.append(f"_{len(no_adapter)} indexes have no adapter yet and are not checked._\n")
    if result.unresolved:
        lines.append("### Registry entries not found in the database")
        lines += [f"- key {e.key}: {e.office} › {e.name}" for e in result.unresolved]
    return "\n".join(lines) if lines else None


# ── CLI ──────────────────────────────────────────────────────────────────────


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description="Office KPI nightly pipeline")
    p.add_argument("--plan-only", action="store_true")
    p.add_argument("--dry-run", action="store_true")
    p.add_argument("--index", type=int, action="append", help="registry key (repeatable)")
    p.add_argument("--force", action="store_true")
    p.add_argument("--date", type=date.fromisoformat, help="pretend today is YYYY-MM-DD")
    p.add_argument("--backtest", action="store_true", help="compare adapters to all history; implies --dry-run")
    p.add_argument("--offline", action="store_true", help="read the repo SQLite snapshot; implies --dry-run")
    args = p.parse_args(argv)

    entries = load_registry()
    today = args.date or datetime.now(JERUSALEM).date()
    dry = args.dry_run or args.backtest or args.offline or args.plan_only

    if args.offline:
        from store import OfflineStore

        store = OfflineStore()
    else:
        missing = [k for k in ("SUPABASE_URL", "SUPABASE_SERVICE_KEY") if not os.environ.get(k)]
        if missing:
            log.error("Missing env vars: %s (use --offline to run without Supabase)", missing)
            return 1
        from store import SupabaseStore

        store = SupabaseStore()

    started = datetime.now(timezone.utc)
    result = run(
        store,
        entries,
        today,
        force=args.force,
        only_keys=set(args.index) if args.index else None,
        plan_only=args.plan_only,
        backtest=args.backtest,
    )
    entries_by_key = {e.key: e for e in entries}

    s = summarize(result.items)
    log.info(
        "[plan] %s · %d due · %d overdue · %d not yet · %d without adapter",
        today, s["due"], s["overdue"], s.get("not_yet", 0), s.get("no_adapter", 0),
    )
    print(format_plan(result.items))
    if args.plan_only:
        return 0

    print()
    print(format_backtest(result.candidates, entries_by_key) if args.backtest
          else format_candidates(result.candidates, entries_by_key))

    counts = result.counts()
    changes: list[dict] = []
    for cand in result.candidates:
        if cand.rejected or cand.kind == "same":
            continue
        entry = entries_by_key[cand.obs.key]
        changes.append(
            {
                "key": cand.obs.key,
                "index_id": cand.index_id,
                "name": entry.name,
                "office": entry.office,
                "label": cand.label,
                "value": cand.obs.value,
                "previous_value": cand.previous_value,
                "kind": cand.kind,
                "status": cand.status,
                "method": cand.obs.method,
                "flags": list(cand.flags),
                "source_url": cand.obs.source_url,
            }
        )
    summary = {
        "date": today.isoformat(),
        "due": s["due"],
        "overdue": s["overdue"],
        "found": sorted(result.found_keys),
        "new": counts["new"],
        "revisions": counts["revision"],
        "published": counts["published"],
        "pending": counts["pending"],
        "rejected": counts["rejected"],
        "errors": result.errors,
        "changes": changes,
    }
    log.info("[result] %s", {k: v for k, v in summary.items() if k != "changes"})
    if changes:
        log.info("[changes] %d value(s) staged/published", len(changes))

    if dry:
        log.info("dry run — nothing written")
        return 0

    store.save_candidates(result.candidates)
    store.save_check_states(result.state_rows)

    pending_total = 0
    try:
        pending_total = (
            store.sb.table("index_data_candidates")
            .select("id", count="exact")
            .eq("status", "pending")
            .execute()
            .count
            or 0
        )
    except Exception as exc:
        log.warning("could not count pending candidates: %s", exc)

    report = attention_report(result, pending_total)
    if report:
        ATTENTION_FILE.write_text(report, encoding="utf-8")
        log.info("attention report written to %s", ATTENTION_FILE.name)
    elif ATTENTION_FILE.exists():
        ATTENTION_FILE.unlink()

    from emit_site_updates import emit_pipeline_site_update
    from record_pipeline_run import record_pipeline_run

    status = "error" if result.errors and not result.found_keys else ("warning" if result.errors else "success")
    message = (
        f"פורסמו {summary['published']} · "
        f"ממתינים לאישור {summary['pending']} · "
        f"נבדקו {summary['due']}"
    )
    run_id = record_pipeline_run(
        store.sb,
        pipeline=PIPELINE_NAME,
        action="nightly",
        status=status,
        message=message,
        error="; ".join(f"{k}: {v}" for k, v in result.errors.items()) or None,
        summary=summary,
        source=os.environ.get("PIPELINE_RUN_SOURCE", "cli"),
        started_at=started,
        finished_at=datetime.now(timezone.utc),
    )

    published = sorted({entries_by_key[c.obs.key].name for c in result.candidates if c.auto_publish})
    if published:
        # One strip line per publishing run (not once/day) — matches polls/knesset dedupe.
        emit_pipeline_site_update(
            store.sb,
            event_type=PIPELINE_NAME,
            href="/government/dashboard",
            page_label_he="דשבורד הממשלה",
            facts={"pipeline": PIPELINE_NAME, "updated_indexes": published},
            dedupe_key=f"{PIPELINE_NAME}:{run_id or today.isoformat()}:{'-'.join(str(k) for k in sorted({c.obs.key for c in result.candidates if c.auto_publish}))}",
            pipeline_run_id=run_id,
        )
    return 0


if __name__ == "__main__":
    sys.exit(main())

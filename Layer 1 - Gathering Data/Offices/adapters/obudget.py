"""Open Budget (BudgetKey) SQL API — next.obudget.org/api/query

params:
  codes: budget section codes summed per year (e.g. ["0020"] = Ministry of Education)
  field: raw_budget column, default "net_executed" (actual spending)

Only years where every requested code has a non-null value are emitted, so an
in-progress year (executed not published yet) never produces a partial total.

Access note: bare GETs to /api/query return HTTP 200 with ``status: ["Bot detected"]``
and empty rows. A short session warm-up against the site origin (browser-like
UA + Referer) unlocks the SQL endpoint — that is what the public UI does.
"""

from __future__ import annotations

import logging
import re
import time
from datetime import date

import requests

from adapters.base import AdapterError, FetchTask
from models import Observation

log = logging.getLogger(__name__)

ORIGIN = "https://next.obudget.org"
URL = f"{ORIGIN}/api/query"
ALLOWED_FIELDS = {"net_executed", "net_revised", "net_allocated"}

BROWSER_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"
    ),
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "he-IL,he;q=0.9,en-US;q=0.8,en;q=0.7",
    "Referer": f"{ORIGIN}/",
    "Origin": ORIGIN,
}


def build_query(codes: list[str], field: str, since_year: int) -> str:
    if field not in ALLOWED_FIELDS:
        raise AdapterError(f"obudget: field {field!r} not allowed")
    if not all(re.fullmatch(r"\d{2,10}", c) for c in codes):
        raise AdapterError(f"obudget: bad codes {codes!r}")
    code_list = ",".join(f"'{c}'" for c in codes)
    return (
        f"select year, code, {field} as value from raw_budget "
        f"where code in ({code_list}) and year >= {int(since_year)} order by year, code"
    )


def to_observations(task: FetchTask, rows: list[dict], query: str) -> list[Observation]:
    codes = [str(c) for c in task.entry.params["codes"]]
    by_year: dict[int, dict[str, float | None]] = {}
    for r in rows:
        by_year.setdefault(int(r["year"]), {})[str(r["code"])] = r.get("value")
    out = []
    for year, vals in sorted(by_year.items()):
        if any(vals.get(c) is None for c in codes):
            continue
        total = sum(float(vals[c]) for c in codes)
        period = date(year, 1, 1)
        if period < task.since:
            continue
        out.append(
            Observation(
                key=task.entry.key,
                period=period,
                value=total,
                raw_value=str(total),
                source_url=f"{ORIGIN}/i/budget/{codes[0]}/{year}",
                method="api",
                evidence={"codes": codes, "query": query},
            )
        )
    return out


def _warm_session(session: requests.Session) -> None:
    """Hit the site origin so /api/query stops returning Bot detected."""
    last: Exception | None = None
    for attempt in range(1, 4):
        try:
            r = session.get(ORIGIN + "/", timeout=30)
            r.raise_for_status()
            return
        except requests.RequestException as exc:
            last = exc
            log.warning("obudget warm-up failed (attempt %d/3): %s", attempt, exc)
            time.sleep(1.5 * attempt)
    raise AdapterError(f"obudget warm-up failed: {last}")


def _query(session: requests.Session, sql: str) -> dict:
    last: Exception | None = None
    for attempt in range(1, 4):
        try:
            r = session.get(URL, params={"query": sql}, timeout=60)
            r.raise_for_status()
            payload = r.json()
            status = payload.get("status") or []
            if any("bot" in str(s).lower() for s in status):
                log.warning("obudget bot block on attempt %d — re-warming", attempt)
                _warm_session(session)
                time.sleep(0.5)
                last = AdapterError(f"obudget blocked this client ({status})")
                continue
            if payload.get("success") is False:
                raise AdapterError(f"obudget query failed: {payload}")
            return payload
        except (requests.RequestException, ValueError, AdapterError) as exc:
            last = exc
            log.warning("obudget query failed (attempt %d/3): %s", attempt, exc)
            time.sleep(1.5 * attempt)
    raise AdapterError(f"obudget query failed after retries: {last}")


class ObudgetAdapter:
    family = "obudget"
    method = "api"

    def fetch(self, tasks: list[FetchTask], today: date) -> list[Observation]:
        if not tasks:
            return []
        session = requests.Session()
        session.headers.update(BROWSER_HEADERS)
        _warm_session(session)

        by_field: dict[str, list[FetchTask]] = {}
        for t in tasks:
            by_field.setdefault(t.entry.params.get("field", "net_executed"), []).append(t)

        out: list[Observation] = []
        for field, group in by_field.items():
            all_codes: list[str] = []
            seen: set[str] = set()
            since_year = min(t.since.year for t in group)
            for t in group:
                for c in t.entry.params["codes"]:
                    cs = str(c)
                    if cs not in seen:
                        seen.add(cs)
                        all_codes.append(cs)
            query = build_query(all_codes, field, since_year)
            payload = _query(session, query)
            status = payload.get("status") or []
            if any("bot" in str(s).lower() for s in status):
                raise AdapterError(
                    f"obudget blocked this client ({status}). "
                    "HTTP 200 with empty rows — not a missing-year case."
                )
            rows = payload.get("rows") or []
            for t in group:
                codes = {str(c) for c in t.entry.params["codes"]}
                subset = [r for r in rows if str(r.get("code")) in codes]
                out.extend(to_observations(t, subset, query))
        return out

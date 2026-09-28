"""Open Budget (BudgetKey) SQL API — next.obudget.org/api/query

params:
  codes: budget section codes summed per year (e.g. ["0020"] = Ministry of Education)
  field: raw_budget column, default "net_executed" (actual spending)

Only years where every requested code has a non-null value are emitted, so an
in-progress year (executed not published yet) never produces a partial total.
"""

from __future__ import annotations

import re
from datetime import date

from adapters.base import AdapterError, FetchTask, get_json
from models import Observation

URL = "https://next.obudget.org/api/query"
ALLOWED_FIELDS = {"net_executed", "net_revised", "net_allocated"}


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
                source_url=f"https://next.obudget.org/i/budget/{codes[0]}/{year}",
                method="api",
                evidence={"codes": codes, "query": query},
            )
        )
    return out


class ObudgetAdapter:
    family = "obudget"
    method = "api"

    def fetch(self, tasks: list[FetchTask], today: date) -> list[Observation]:
        out: list[Observation] = []
        for t in tasks:
            codes = [str(c) for c in t.entry.params["codes"]]
            field = t.entry.params.get("field", "net_executed")
            query = build_query(codes, field, t.since.year)
            payload = get_json(URL, {"query": query})
            if not payload.get("success", True):
                raise AdapterError(f"obudget query failed: {payload}")
            out.extend(to_observations(t, payload.get("rows") or [], query))
        return out

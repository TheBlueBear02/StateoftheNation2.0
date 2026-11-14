"""
Shared Knesset OData client for GitHub Actions + local runs.

1. Prefer live OData over HTTPS, using curl_cffi Chrome impersonation when
   installed (plain requests is often blocked by the Knesset WAF from GHA IPs).
2. If OData keeps returning HTML/WAF pages, fall back to Hasadna CSV mirrors
   (cached per process) and apply simple $filter expressions client-side.
"""

from __future__ import annotations

import csv
import io
import logging
import re
import time
from datetime import datetime, timezone
from typing import Any
from xml.etree import ElementTree as ET

log = logging.getLogger(__name__)

ODATA_BASE = "https://knesset.gov.il/Odata/ParliamentInfo.svc"
HASADNA_BASE = "https://production.oknesset.org/pipelines/data"
PAGE_SIZE = 50
RETRY_MAX = 5
RETRY_DELAY = 4

NS = {
    "atom": "http://www.w3.org/2005/Atom",
    "m": "http://schemas.microsoft.com/ado/2007/08/dataservices/metadata",
    "d": "http://schemas.microsoft.com/ado/2007/08/dataservices",
}

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/131.0.0.0 Safari/537.36"
    ),
    "Accept": "application/atom+xml,application/xml",
}

# Hasadna dump paths (used only when live OData is blocked).
HASADNA_ENTITY_PATHS: dict[str, str] = {
    "KNS_KnessetDates": "knesset/kns_knessetdates/kns_knessetdates.csv",
    "KNS_Person": "members/kns_person/kns_person.csv",
    "KNS_Faction": "knesset/kns_faction/kns_faction.csv",
    "KNS_GovMinistry": "knesset/kns_govministry/kns_govministry.csv",
    "KNS_PersonToPosition": "members/kns_persontoposition/kns_persontoposition.csv",
    "KNS_Committee": "committees/kns_committee/kns_committee.csv",
    "KNS_CommitteeSession": "committees/kns_committeesession/kns_committeesession.csv",
    "KNS_DocumentCommitteeSession": (
        "committees/kns_documentcommitteesession_dataservice/"
        "kns_documentcommitteesession_dataservice.csv"
    ),
}

# Hasadna column renames → OData field names used by sync scripts.
HASADNA_FIELD_ALIASES: dict[str, dict[str, str]] = {
    "KNS_Faction": {"Id": "FactionID"},
}

_HASADNA_CACHE: dict[str, list[dict[str, Any]]] = {}
_ODATA_BLOCKED = False  # sticky for the process after a confirmed WAF/HTML block
_CMP_RE = re.compile(
    r"([A-Za-z_][A-Za-z0-9_]*)\s+(eq|gt|ge|lt|le)\s+"
    r"(?:datetime'([^']*)'|'([^']*)'|([-+]?\d+(?:\.\d+)?)|(true|false))",
    re.IGNORECASE,
)

try:
    from curl_cffi import requests as _http  # type: ignore

    _IMPERSONATE = "chrome131"
    _USING_CURL_CFFI = True
except ImportError:  # pragma: no cover
    import requests as _http

    _IMPERSONATE = None
    _USING_CURL_CFFI = False


def is_reblaze_block(text: str) -> bool:
    sample = (text or "")[:4000].lower()
    if any(
        s in sample
        for s in (
            "reblaze",
            "access denied",
            "request blocked",
            "rbzid",
            "cf-ray",
            "captcha",
        )
    ):
        return True
    stripped = (text or "").lstrip().lower()
    return stripped.startswith("<!doctype html") or stripped.startswith("<html")


def parse_atom_feed(content: bytes) -> ET.Element:
    try:
        root = ET.fromstring(content)
    except ET.ParseError as exc:
        raise ValueError(f"invalid OData XML: {exc}") from exc
    tag = root.tag.split("}")[-1] if "}" in root.tag else root.tag
    if tag != "feed":
        raise ValueError(f"expected Atom <feed>, got <{tag}>")
    return root


def parse_odata_value(elem: ET.Element, *, keep_datetime: bool = False):
    if elem.get(f"{{{NS['m']}}}null", "false").lower() == "true":
        return None

    type_attr = elem.get(f"{{{NS['m']}}}type", "")
    text = (elem.text or "").strip()
    if not text:
        return None

    if type_attr in ("Edm.Int32", "Edm.Int16", "Edm.Byte", "Edm.Int64"):
        return int(text)
    if type_attr == "Edm.Decimal":
        return float(text)
    if type_attr == "Edm.Boolean":
        return text.lower() == "true"
    if type_attr == "Edm.DateTime":
        if keep_datetime and "T" in text:
            return text.replace("Z", "+00:00")
        return text[:10]
    return text


def parse_entry(entry: ET.Element, *, keep_datetime: bool = False) -> dict:
    props = entry.find("./atom:content/m:properties", NS)
    if props is None:
        return {}
    return {
        child.tag.split("}")[-1]: parse_odata_value(
            child, keep_datetime=keep_datetime
        )
        for child in props
    }


def _http_get(url: str, *, params: dict | None = None, timeout: int = 60):
    kwargs: dict[str, Any] = {
        "params": params,
        "headers": HEADERS,
        "timeout": timeout,
    }
    if _USING_CURL_CFFI and _IMPERSONATE:
        kwargs["impersonate"] = _IMPERSONATE
    return _http.get(url, **kwargs)


def _coerce_csv_value(key: str, value: Any) -> Any:
    if value is None:
        return None
    text = str(value).strip()
    if text == "":
        return None
    if key in ("IsCurrent", "IsActive") or key.startswith("Is"):
        return text.lower() in ("true", "1", "yes")
    if (
        key.endswith("ID")
        or key.endswith("Id")
        or key.endswith("Num")
        or key in ("Id", "Number")
    ):
        try:
            return int(float(text))
        except ValueError:
            return text
    if "Date" in key:
        # Hasadna: "YYYY-MM-DD HH:MM:SS" → keep ISO-ish for timestamptz helpers.
        if " " in text and "T" not in text:
            text = text.replace(" ", "T", 1)
        if text.endswith("Z"):
            return text
        return text
    return text


def _normalize_hasadna_row(entity: str, row: dict) -> dict[str, Any]:
    aliases = HASADNA_FIELD_ALIASES.get(entity, {})
    out: dict[str, Any] = {}
    for key, value in row.items():
        name = aliases.get(key, key)
        out[name] = _coerce_csv_value(name, value)
    return out


def fetch_hasadna_entity(entity: str) -> list[dict[str, Any]]:
    if entity in _HASADNA_CACHE:
        return _HASADNA_CACHE[entity]
    path = HASADNA_ENTITY_PATHS.get(entity)
    if not path:
        raise RuntimeError(f"No Hasadna dump mapped for {entity}")
    url = f"{HASADNA_BASE}/{path}"
    log.warning(
        "  OData blocked — falling back to Hasadna CSV for %s (%s)",
        entity,
        url,
    )
    resp = _http.get(url, headers={"User-Agent": HEADERS["User-Agent"]}, timeout=600)
    resp.raise_for_status()
    text = resp.content.decode("utf-8-sig", errors="replace")
    reader = csv.DictReader(io.StringIO(text))
    rows = [_normalize_hasadna_row(entity, row) for row in reader]
    log.info("  Hasadna %s → %d rows", entity, len(rows))
    _HASADNA_CACHE[entity] = rows
    return rows


def parse_odata_datetime(value: Any) -> datetime | None:
    """Parse an OData / Hasadna timestamp into naive UTC."""
    if isinstance(value, datetime):
        dt = value
    else:
        if value is None:
            return None
        text = str(value).strip()
        if not text:
            return None
        if text.lower().startswith("datetime'") and text.endswith("'"):
            text = text.split("'", 1)[1][:-1]
        if " " in text and "T" not in text:
            text = text.replace(" ", "T", 1)
        text = text.replace("Z", "+00:00")
        try:
            dt = datetime.fromisoformat(text)
        except ValueError:
            return None
    if dt.tzinfo is not None:
        dt = dt.astimezone(timezone.utc).replace(tzinfo=None)
    return dt


def _parse_cmp_clause(clause: str) -> tuple[str, str, Any] | None:
    match = _CMP_RE.fullmatch(clause.strip())
    if not match:
        return None
    field, op, datetime_val, str_val, num_val, bool_val = match.groups()
    op = op.lower()
    if datetime_val is not None:
        parsed = parse_odata_datetime(datetime_val)
        return field, op, parsed if parsed is not None else datetime_val
    if str_val is not None:
        return field, op, str_val
    if bool_val is not None:
        return field, op, bool_val.lower() == "true"
    if num_val is not None:
        if "." in num_val:
            return field, op, float(num_val)
        return field, op, int(num_val)
    return None


def _ordered_filter_value(value: Any) -> Any:
    parsed = parse_odata_datetime(value)
    if parsed is not None:
        return parsed
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return value
    return str(value)


def _filter_compare(actual: Any, expected: Any, op: str) -> bool:
    if op == "eq":
        return _filter_values_equal(actual, expected)
    if actual is None:
        return False
    left = _ordered_filter_value(actual)
    right = _ordered_filter_value(expected)
    if isinstance(left, datetime) and isinstance(right, datetime):
        pass
    elif type(left) is not type(right):
        left, right = str(left), str(right)
    if op == "gt":
        return left > right
    if op == "ge":
        return left >= right
    if op == "lt":
        return left < right
    if op == "le":
        return left <= right
    return False


def _filter_values_equal(actual: Any, expected: Any) -> bool:
    if actual == expected:
        return True
    if isinstance(expected, bool):
        if isinstance(actual, str):
            return actual.strip().lower() in (
                ("true", "1", "yes") if expected else ("false", "0", "no")
            )
        return False
    return str(actual) == str(expected)


def apply_odata_filter(
    rows: list[dict[str, Any]], filter_expr: str | None
) -> list[dict[str, Any]]:
    """Support `eq` / `gt` / `ge` / `lt` / `le` clauses joined by `and`.

    `gt datetime'...'` is what incremental sync sends for LastUpdatedDate.
    The Hasadna CSV is a full dump, so the same filter has to apply client-side.
    """
    if not filter_expr:
        return rows
    clauses = [c.strip() for c in re.split(r"\s+and\s+", filter_expr, flags=re.I)]
    parsed: list[tuple[str, str, Any]] = []
    for clause in clauses:
        item = _parse_cmp_clause(clause)
        if item is None:
            raise ValueError(f"Unsupported OData filter for Hasadna fallback: {filter_expr!r}")
        parsed.append(item)

    out = []
    for row in rows:
        ok = True
        for field, op, expected in parsed:
            if not _filter_compare(row.get(field), expected, op):
                ok = False
                break
        if ok:
            out.append(row)
    return out


def _note_fetch(fetch_meta: dict[str, Any] | None, **fields: Any) -> None:
    if fetch_meta is not None:
        fetch_meta.update(fields)


def fetch_odata(
    entity: str,
    filter_expr: str | None = None,
    *,
    keep_datetime: bool = False,
    allow_hasadna_fallback: bool = True,
    fetch_meta: dict[str, Any] | None = None,
    orderby: str | None = None,
    on_page=None,
) -> list[dict[str, Any]]:
    """
    Fetch all rows for a KNS_* entity.

    Uses $skip pagination against live OData. On persistent WAF/HTML blocks,
    falls back to the matching Hasadna CSV (when mapped).
    """
    global _ODATA_BLOCKED

    if _USING_CURL_CFFI:
        log.debug("  OData transport: curl_cffi (%s)", _IMPERSONATE)
    else:
        log.debug(
            "  OData transport: requests (install curl_cffi to reduce WAF blocks)"
        )

    if _ODATA_BLOCKED and allow_hasadna_fallback and entity in HASADNA_ENTITY_PATHS:
        rows = apply_odata_filter(fetch_hasadna_entity(entity), filter_expr)
        log.info(
            "  %s via Hasadna (OData previously blocked) → %d rows (filter=%s)",
            entity,
            len(rows),
            filter_expr or "none",
        )
        _note_fetch(fetch_meta, source="hasadna", entity=entity, filter=filter_expr)
        return rows

    base_params: dict[str, Any] = {"$top": PAGE_SIZE}
    if filter_expr:
        base_params["$filter"] = filter_expr
    if orderby:
        base_params["$orderby"] = orderby

    all_rows: list[dict[str, Any]] = []
    skip = 0
    page = 1
    saw_waf = False

    while True:
        params = {**base_params, "$skip": skip}
        log.info("  %s: page %d (skip=%d)…", entity, page, skip)

        root = None
        resp = None
        page_failed = False
        for attempt in range(1, RETRY_MAX + 1):
            try:
                resp = _http_get(
                    f"{ODATA_BASE}/{entity}",
                    params=params,
                    timeout=60,
                )
                resp.raise_for_status()
                if is_reblaze_block(resp.text):
                    saw_waf = True
                    raise ValueError("WAF/HTML block page instead of Atom feed")
                root = parse_atom_feed(resp.content)
                break
            except Exception as exc:
                wait = RETRY_DELAY * attempt
                snippet = ""
                if resp is not None:
                    snippet = resp.text[:240].replace("\n", " ")
                log.warning(
                    "  OData error (attempt %d/%d): %s — retrying in %ds%s",
                    attempt,
                    RETRY_MAX,
                    exc,
                    wait,
                    f" | body[:240]={snippet!r}" if snippet else "",
                )
                if attempt == RETRY_MAX:
                    page_failed = True
                    break
                time.sleep(wait)

        if page_failed:
            # Pages already handed to on_page are checkpointed by the caller.
            # Replacing them with a CSV dump would rewind that resume point.
            if on_page is not None and skip > 0:
                raise RuntimeError(
                    f"OData {entity} page {page} failed after {RETRY_MAX} attempts"
                )
            if allow_hasadna_fallback and entity in HASADNA_ENTITY_PATHS and (
                saw_waf or page == 1
            ):
                if saw_waf:
                    _ODATA_BLOCKED = True
                rows = apply_odata_filter(fetch_hasadna_entity(entity), filter_expr)
                log.info(
                    "  %s via Hasadna fallback → %d rows (filter=%s)",
                    entity,
                    len(rows),
                    filter_expr or "none",
                )
                _note_fetch(fetch_meta, source="hasadna", entity=entity, filter=filter_expr)
                return rows
            raise RuntimeError(
                f"OData {entity} page {page} failed after {RETRY_MAX} attempts"
            )

        assert root is not None
        entries = root.findall("atom:entry", NS)
        rows = [
            parse_entry(e, keep_datetime=keep_datetime) for e in entries
        ]
        all_rows.extend(rows)
        if on_page is not None and rows:
            on_page(rows)
        log.info(
            "  %s: page %d → %d rows (total: %d)",
            entity,
            page,
            len(rows),
            len(all_rows),
        )

        if len(rows) < PAGE_SIZE:
            break
        skip += PAGE_SIZE
        page += 1
        time.sleep(0.25)

    _note_fetch(fetch_meta, source="odata", entity=entity, filter=filter_expr)
    return all_rows

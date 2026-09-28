"""Adapter contract + shared HTTP helper.

An adapter receives every due task for its family in ONE call (so a source is
fetched once per night) and returns Observations for any periods >= task.since.
It must not decide labels, publish, or validate — that happens downstream.
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass
from datetime import date
from typing import Any, Protocol

import requests

from models import Observation
from registry import Entry

log = logging.getLogger(__name__)

USER_AGENT = "StateOfTheNationKpiBot/1.0 (+https://www.stateofthenation.co.il)"


@dataclass
class FetchTask:
    entry: Entry
    since: date            # earliest period the caller cares about (target minus revision lookback)


class AdapterError(RuntimeError):
    pass


class Adapter(Protocol):
    family: str
    method: str

    def fetch(self, tasks: list[FetchTask], today: date) -> list[Observation]: ...


def get_json(url: str, params: dict[str, Any] | None = None, *, retries: int = 3, timeout: int = 30) -> Any:
    last: Exception | None = None
    for attempt in range(1, retries + 1):
        try:
            r = requests.get(url, params=params, timeout=timeout, headers={"User-Agent": USER_AGENT})
            r.raise_for_status()
            return r.json()
        except (requests.RequestException, ValueError) as exc:
            last = exc
            log.warning("GET %s failed (attempt %d/%d): %s", url, attempt, retries, exc)
            time.sleep(2 * attempt)
    raise AdapterError(f"GET {url} failed after {retries} attempts: {last}")

#!/usr/bin/env python3
"""Swap ביטחון לאומי תקציב (index 22) to full section 0007 ביצוע בפועל."""
from __future__ import annotations

import sqlite3
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")

DB = Path(__file__).resolve().parent / "office_dashboard_source.db"
INDEX_ID = 22
SOURCE = "https://next.obudget.org/i/budget/0007/2026"
INFO = "תקציב המשרד לביטחון לאומי בפועל בכל שנה"

# Rightmost column (ביצוע בפועל) from next.obudget.org/i/budget/0007/2026
DATA = [
    ("2009", "9,174,394,215"),
    ("2010", "9,754,316,331"),
    ("2011", "10,523,858,219"),
    ("2012", "11,590,404,716"),
    ("2013", "12,675,606,179"),
    ("2014", "13,348,517,647"),
    ("2015", "14,165,944,609"),
    ("2016", "13,718,783,498"),
    ("2017", "16,279,654,764"),
    ("2018", "17,189,485,787"),
    ("2019", "18,298,718,958"),
    ("2020", "19,147,322,408"),
    ("2021", "19,329,209,115"),
    ("2022", "20,825,818,763"),
    ("2023", "23,110,520,164"),
    ("2024", "25,176,846,831"),
    ("2025", "27,635,155,719"),
]


def main() -> None:
    con = sqlite3.connect(DB)
    cur = con.cursor()

    row = cur.execute(
        "SELECT id, name FROM indexes WHERE id = ?", (INDEX_ID,)
    ).fetchone()
    if not row or row[1] != "תקציב":
        raise SystemExit(f"expected index {INDEX_ID}=תקציב, got {row!r}")

    cur.execute(
        "UPDATE indexes SET source = ?, info = ? WHERE id = ?",
        (SOURCE, INFO, INDEX_ID),
    )
    print(f"updated index {INDEX_ID} source → {SOURCE}")

    keep_labels = {label for label, _ in DATA}
    for label, value in DATA:
        existing = cur.execute(
            "SELECT id, value FROM indexes_data WHERE index_id = ? AND label = ?",
            (INDEX_ID, label),
        ).fetchone()
        if existing:
            if existing[1] != value:
                cur.execute(
                    "UPDATE indexes_data SET value = ? WHERE id = ?",
                    (value, existing[0]),
                )
                print(f"  updated {label}={value}")
            else:
                print(f"  unchanged {label}")
        else:
            cur.execute(
                "INSERT INTO indexes_data (index_id, label, value) VALUES (?, ?, ?)",
                (INDEX_ID, label, value),
            )
            print(f"  inserted {label}={value}")

    stale = cur.execute(
        "SELECT id, label FROM indexes_data WHERE index_id = ?",
        (INDEX_ID,),
    ).fetchall()
    for row_id, label in stale:
        if label not in keep_labels:
            cur.execute("DELETE FROM indexes_data WHERE id = ?", (row_id,))
            print(f"  deleted stale {label}")

    con.commit()
    n = cur.execute(
        "SELECT COUNT(*) FROM indexes_data WHERE index_id = ?", (INDEX_ID,)
    ).fetchone()[0]
    print(f"done: points={n}")
    con.close()


if __name__ == "__main__":
    main()

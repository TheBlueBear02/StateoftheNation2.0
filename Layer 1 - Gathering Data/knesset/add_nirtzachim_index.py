#!/usr/bin/env python3
"""Add the 'נרצחים' KPI to office_dashboard_source.db (idempotent)."""
from __future__ import annotations

import sqlite3
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")

DB = Path(__file__).resolve().parent / "office_dashboard_source.db"

NAME = "נרצחים"
INFO = "מספר קורבנות רצח פלילי בישראל בכל שנה"
ICON = r"static\images\offices\המשרד לביטחון לאומי\kpi\מקרי רצח בחברה הערבית.png"
OFFICE_ID = 2  # המשרד לביטחון לאומי
INDEX_ID = 63
SOURCE = ""  # curated annual tally; no stable public URL yet

DATA = [
    ("2010", 150),
    ("2011", 147),
    ("2012", 128),
    ("2013", 131),
    ("2014", 129),
    ("2015", 120),
    ("2016", 110),
    ("2017", 136),
    ("2018", 124),
    ("2019", 142),
    ("2020", 147),
    ("2021", 173),
    ("2022", 148),
    ("2023", 300),
    ("2024", 307),
    ("2025", 295),
]


def main() -> None:
    con = sqlite3.connect(DB)
    cur = con.cursor()

    existing = cur.execute(
        "SELECT id FROM indexes WHERE name = ? AND office_id = ?",
        (NAME, OFFICE_ID),
    ).fetchone()

    if existing:
        index_id = existing[0]
        cur.execute(
            "UPDATE indexes SET info=?, icon=?, is_kpi=1, alert=1, chart_type=?, "
            "source=?, is_shown=1 WHERE id=?",
            (INFO, ICON, "bar", SOURCE or None, index_id),
        )
        print(f"updated index id={index_id}")
    else:
        # Prefer stable key 63 if free; otherwise let sqlite autoincrement.
        taken = cur.execute(
            "SELECT 1 FROM indexes WHERE id = ?", (INDEX_ID,)
        ).fetchone()
        if taken:
            cur.execute(
                "INSERT INTO indexes "
                "(name, info, icon, office_id, is_kpi, alert, chart_type, source, is_shown) "
                "VALUES (?, ?, ?, ?, 1, 1, ?, ?, 1)",
                (NAME, INFO, ICON, OFFICE_ID, "bar", SOURCE or None),
            )
            index_id = cur.lastrowid
        else:
            cur.execute(
                "INSERT INTO indexes "
                "(id, name, info, icon, office_id, is_kpi, alert, chart_type, source, is_shown) "
                "VALUES (?, ?, ?, ?, ?, 1, 1, ?, ?, 1)",
                (INDEX_ID, NAME, INFO, ICON, OFFICE_ID, "bar", SOURCE or None),
            )
            index_id = INDEX_ID
        print(f"inserted index id={index_id}")

    for label, value in DATA:
        row = cur.execute(
            "SELECT id, value FROM indexes_data WHERE index_id = ? AND label = ?",
            (index_id, label),
        ).fetchone()
        if row:
            if row[1] != value:
                cur.execute(
                    "UPDATE indexes_data SET value = ? WHERE id = ?",
                    (value, row[0]),
                )
                print(f"  updated {label}={value}")
        else:
            cur.execute(
                "INSERT INTO indexes_data (index_id, label, value) VALUES (?, ?, ?)",
                (index_id, label, value),
            )
            print(f"  inserted {label}={value}")

    con.commit()
    n = cur.execute(
        "SELECT COUNT(*) FROM indexes_data WHERE index_id = ?", (index_id,)
    ).fetchone()[0]
    print(f"done: index_id={index_id}, points={n}")
    con.close()


if __name__ == "__main__":
    main()

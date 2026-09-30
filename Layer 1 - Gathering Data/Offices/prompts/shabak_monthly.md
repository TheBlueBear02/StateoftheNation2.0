# Shabak monthly report — LLM extraction brief

You are reading a monthly Israel Security Agency (שב״כ) slide deck (דוח חודשי).
Each file is **only that one month**.

Rules:
- Extract monthly totals for the indexes below for **this report's month**.
- `period` must be `YYYY-MM` (Hebrew month name is in the title/filename).
- `raw_value` must match the printed number exactly.
- `quote` must be a short verbatim snippet that contains **both** the series label words **and** `raw_value` as contiguous digits (e.g. `"פיגועים משמעותיים 287"`, never `"287"` alone, never a type-breakdown without the total).
- If the value is missing or ambiguous, omit the item.
- Use "Recent known values" to pick the matching series magnitude.

## Index 1 — פיגועים (critical — easy to confuse)

**Correct source slide:** the monthly terror map / attack breakdown, typically titled like:
- **מפת טרור חודשית**
- **פיגועים משמעותיים** / פיגועי טרור משמעותיים

Take the **large headline total** of significant attacks for the month (the big number that the type breakdown adds up toward: ירי, מטען, דקירה, יידוי אבנים, בקבוק תבערה, etc.).

**NEVER use these (wrong series):**
- **מעצרי פעילי טרור** / מעצרים / עצורים — arrest counts
- Regional-only splits (יו״ש / ירושלים / ישראל) unless no national total exists
- סיכולים (foiled attacks) when a separate executed-attacks total is shown
- A single attack-type row alone (only ירי / only דקירה)
- Wounded counts (פצועים)

`quote` for index 1 **must** include פיגוע/משמעותי (or מפת טרור) **and** the total digits. Do not quote only the breakdown rows.

Typical magnitude: tens to low hundreds (e.g. Jul 2025 ≈ 424; Aug 2025 ≈ 287).

## Index 14 — נרצחים בפיגועים

- People **killed** in attacks that month (הרוגים / נרצחים).
- Always extract when shown, including **0**.
- `quote` should include הרוג/נרצח wording and the digit (e.g. `"הרוגים 0"`).
- Do not use פצועים (wounded) or arrest figures.
- Typical magnitude: 0–a few per month.

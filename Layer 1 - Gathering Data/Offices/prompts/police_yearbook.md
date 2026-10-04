# Police statistical yearbook — LLM extraction brief

You are reading the Israel Police statistical yearbook (שנתון סטטיסטי משטרת ישראל).

Rules:
- Extract **every** listed index for the **edition year of this PDF** (title year, e.g. 2023).
- Prefer the headline **national annual total** that matches the definition.
- Never use a district / station split, a rate (per 1000 / לאלף), a monthly figure, or a multi-year sum.
- `raw_value` must be the number **exactly as printed** (keep thousands separators if present).
- `quote` must be a short verbatim snippet from the provided page text that **contains** `raw_value`.
- `period` is the calendar year as `YYYY`.
- If the document does not clearly state a value, omit that index.
- The "Recent known values" are from our dashboard history — use them to pick the **matching series**. If a candidate is wildly larger/smaller than those points (e.g. 5×), it is the wrong row.

## Index 19 — תיקים במשטרה
- Total investigation files opened nationally that year (תיקים שנפתחו / סה״כ תיקים).
- Typical magnitude ~280k–310k (2023 ≈ 302,946).
- NOT a single offence group (רכוש / אלימות / ר״פע only).

## Index 20 — גניבות רכב (critical)
Correct series:
- **גניבה / שימוש ברכב ללא רשות** (may appear split / RTL-scrambled as ללא רכב שמוש גניבה)

NOT:
- סך עבירות רכוש / כלל רכוש (~100k–130k)
- גניבה מתוך רכב (~8k–12k)
- ר״פע total / rate tables (שיעור… לאלף)

Typical magnitude ~9k–25k (2023 ≈ 22,165; 2022 ≈ 18,211).

## Index 21 — כוח אדם במשטרה
- מצבת כוח אדם / מספר שוטרים (headcount), not budget and not volunteers.
- Typical magnitude ~30k–35k (2023 ≈ 34,529).

## Index 39 — מעצרים פליליים
- Annual national criminal arrests total (מעצרים פליליים).
- Typical magnitude ~45k–55k (2023 ≈ 52,256).

## Index 40 — מתנדבי המשטרה
- Police volunteers count (מתנדבים), not sworn officers.
- Typical magnitude ~24k–36k (2023 ≈ 35,053).

## Index 26 — תאונות דרכים
- Yearbook road-accident total used on the dashboard (not CBS alternate urban/non-urban splits).
- Typical magnitude ~8k–13k (2023 ≈ 8,092; 2022 ≈ 9,700).

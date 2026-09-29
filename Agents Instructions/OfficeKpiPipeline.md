# OfficeKpiPipeline

> Architecture for automatically refreshing the 48 existing office indexes shown on `/government/dashboard`.
> See [GovernmentDashboardPage.md](./GovernmentDashboardPage.md) for the UI and [Database.md](./Database.md) for `indexes` / `index_data`.
> Code: `Layer 1 - Gathering Data/Offices/` (registry `kpi_sources.yaml`, one entry per index). Short version + to-do: [OfficeKpiPlan.md](./OfficeKpiPlan.md).
> Registry entries use `key` = the index id in `office_dashboard_source.db`; the live Supabase index is resolved at runtime by office + name.

**Scope of v1:** refresh data for the existing 4 offices × 12 indexes (7 KPI + 5 policy). No new indexes/offices yet. The design is built so that a new index is added with a registry entry and no new code, as long as its source type already has an adapter.

---

## 1. Current state (as of 2026-09-28)

- Data was hand-curated in the old Flask app, copied to `office_dashboard_source.db`, and pushed to Supabase by `seed_office_dashboard.py`. Nothing updates it automatically ("No automated sync" in Database.md).
- Staleness: most annual series end in **2023**; a few end in 2024; monthly series end around mid-2025. Many sources already have 2024–2025 (and some 2026) figures, so the first run doubles as a **backfill**.
- Values in the source DB are mixed types (`'3.70%'`, `'1,448,420'`, ints, floats). `parse_value()` in the seed script cleans them. The new pipeline must write clean `numeric` only.
- The `recorded_at` convention differs by index, and upserts use `(index_id, recorded_at)`, so an adapter that uses a different day makes **duplicate points**:
  - yearly → `YYYY-01-01`, label `YYYY`
  - Shabak monthly (ids 1, 14) → **last day of month**, label `DD.MM.YYYY`. Note: id 14 has at least one `30.08.2025` point where id 1 has `31.08.2025`.
  - IAA / housing / deficit monthly (ids 30, 56, 51) → **1st of month**, label `01.MM.YYYY`

## 2. Design principles

1. **Registry-driven:** each index's source, adapter, params and label convention sit in one YAML file in git, so changes are reviewable.
2. **Adapters by source type, extractors by document:** one police yearbook feeds 6 indexes, and one Shabak report feeds 2. So we download and parse a document **once**, then map its values to many indexes.
3. **Nothing goes to `index_data` unchecked:** every value lands first in a staging table with provenance (URL, file hash, page, snippet, method). It is published automatically only when it is trustworthy (API + passes validation). Anything else goes to a review queue.
4. **Idempotent and revision-aware:** re-running a job doesn't change anything. If a source revises a past value (CBS does this often), we record it as a *revision* rather than silently overwriting it.
5. **Fits the existing ops stack:** Python in `Layer 1 - Gathering Data/`, GitHub Actions cron, `record_pipeline_run`, `review_queue` → GitHub issue, `emit_site_updates` for the homepage strip, and a card in the `PIPELINES` registry on `/piplines`.

## 3. Source tiers (the 48 indexes)

| Tier | Method | Count | Auto-publish? | Examples |
|------|--------|-------|---------------|----------|
| **A — API** | Official JSON/SQL API, deterministic | ~17 (+5 unofficial) | Yes, if validation passes | obudget budgets (8), CBS CPI / housing, World Bank GDP per capita, data.gov.il vehicle registry (EV share) |
| **A′ — unofficial JSON** | Internal JSON behind a gov web app (found via the browser network tab) | 5 | Yes, but monitored because it can break silently | shkifut.education.gov.il: class size, total students, Haredi share, cost per student, 5-unit math |
| **B — structured file** | Find the newest XLSX/CSV/table on a publisher page → parse with a fixed column mapping | ~7 | After the first approved run for that file layout | IAA monthly passengers, CBS yearbook tables (rail, graduates), fuel price |
| **C — PDF + LLM** | Find the newest PDF → extract text/tables → LLM structured extraction with evidence | ~14 | **No**, review queue | Police statistical yearbook (6 indexes), Shabak monthly report (2), BTL poverty report (Gini), Road Safety Authority annual summary, MOF monthly deficit |
| **D — assisted manual** | Annual/irregular sources from NGOs and surveys. The pipeline only *alerts* when a new edition is likely out and pre-fills a candidate if it can | 5 | No | IDI trust in police, IWN femicide, Abraham Initiatives Arab-society murders, firearms licences, teacher salary (Knesset research) |

The full mapping is in `kpi_sources.yaml`.

### Verified during design (2026-09-28)
- `next.obudget.org/api/query?query=<SQL>` → the `raw_budget` table has `net_executed` by `code` and `year` through **2025** (2026 has the revised budget only). Works unauthenticated **after a session warm-up** against `https://next.obudget.org/` with browser-like headers; a cold GET returns HTTP 200 with `status: ["Bot detected"]` and empty rows (the adapter handles this).
- `api.cbs.gov.il/index/data/price?id=40010&format=json&last=N` → housing price index on the **1993 average base**, the same base as the site's series. The API has data through **06/2026**; the site stops at 06/2025.
- `api.cbs.gov.il/index/data/price?id=120010…` → CPI (2024 base). Monthly `percentYear` is available, so the Dec value = annual inflation.
- `apis.cbs.gov.il/series/data/list?id=…` → CBS statistical series (implemented as `cbs_series`):
  - **64092** GDP quantitative change (yearly %) → index 54 צמיחה
  - **615908** average wage per employee post, total (yearly ₪) → index 58 שכר ממוצע
  - **493549** LFS unemployment rate ages 15+ (yearly %) → index 60 אחוז אבטלה
- `data.gov.il/api/3/action/datastore_search?resource_id=053cea08-…` → private/commercial vehicle registry (~4.2M rows, updated daily, includes `sug_delek_nm` and `moed_aliya_lakvish`).
- Not reachable from WebFetch / sandbox (robots rules or firewall): historically World Bank / BOI SDMX — both are verified from this machine now (`api.worldbank.org`, `edge.boi.gov.il`). Public debt/GDP and government debt stock (indexes **52** / **55**) are **not** in BOI Edge `DEBT_AGG`/`PS` (private-sector aggregates only) — they use the `curated` adapter + `curated_series.yaml` (Accountant General figures). Monthly deficit %%GDP (**51**) is derived on BOI SDMX as trailing-12m `OZAR_A5TZM_M` / trailing-4Q `GDP_Q_N`. Equality/Gini (**57**) stays `document` (BTL PDF).

## 4. Architecture

```
                    kpi_sources.yaml  (registry: index → adapter + params + label rule)
                           │
      ┌────────────────────┼──────────────────────────────┐
      ▼                    ▼                              ▼
 API adapters        Document discovery            Manual/alert jobs
 (cbs, obudget,      (scrape publisher page →       (edition-watch: page hash
  worldbank, boi,     newest PDF/XLSX link)          changed / date passed)
  datagov, curated,        │
  shkifut)                 ▼
      │             raw_documents (Supabase Storage + table; sha256 dedupe)
      │                    │
      │                    ▼
      │             Extractors: xlsx/table parser  |  pdf text → LLM (JSON schema,
      │                                               page + quote evidence)
      ▼                    ▼
   Normalizer: unit/scale conversion, label + recorded_at per registry rule
                           │
                           ▼
   Validator: type, range vs history, jump detector, duplicate/revision check
                           │
                           ▼
              index_data_candidates  (staging, with provenance + status)
                  │                          │
     auto_publish rule true              needs review
                  ▼                          ▼
           index_data upsert by (index_id, recorded_at);
           also drop same-label orphans with a different recorded_at
           (manual rows sometimes used today as recorded_at)
                  │
                  ▼
   pipeline_runs row · emit_site_updates("עמוד דשבורד הממשלה עודכן…")
```

### 4.1 Folder layout (new)

```
Layer 1 - Gathering Data/Offices/
  kpi_sources.yaml            # registry (source of truth for automation)
  run_office_kpi_pipeline.py  # orchestrator: --index 56 --force --dry-run --plan-only --date YYYY-MM-DD
  registry.py                 # load + validate YAML (pydantic)
  planner.py                  # what's due tonight (release windows + kpi_check_state)
  adapters/
    base.py                   # Adapter protocol → list[Observation]
    cbs_price.py              # api.cbs.gov.il/index/data/price
    cbs_series.py             # apis.cbs.gov.il/series (LFS, wages, national accounts)
    obudget.py                # raw_budget SQL
    worldbank.py
    boi_sdmx.py               # plain series + rolling_deficit_gdp_pct (index 51)
    datagov.py                # CKAN datastore_search / datastore_search_sql
    curated.py                # curated_series.yaml (AG debt 52/55 until BOI codes exist)
    shkifut.py                # unofficial JSON
    document.py               # discover → download → store (B/C)
  curated_series.yaml         # hand-maintained AG debt points for curated adapter
  extractors/
    xlsx_table.py             # fixed mapping per file layout
    pdf_llm.py                # pdfplumber text/tables → OpenAI structured output
    prompts/<doc_key>.md      # per-document extraction prompt, e.g. police_yearbook.md
  normalize.py                # labels/recorded_at rules, units, scale
  validate.py
  publish.py                  # candidates → index_data, revisions
  schema_office_kpi_pipeline.sql
  requirements.txt            # requests, pydantic, pyyaml, pdfplumber, openpyxl, openai, supabase
```

### 4.2 Core data contract

Every adapter and extractor returns `Observation` objects:

```python
@dataclass
class Observation:
    index_id: int
    period: date            # canonical period start (YYYY-01-01 / YYYY-MM-01)
    value: Decimal
    source_url: str
    method: Literal["api", "api_unofficial", "table", "llm", "manual"]
    confidence: float       # 1.0 for API; LLM self-report × validator score
    evidence: dict | None   # {"doc_id":…, "page": 34, "quote": "…", "table": "…"}
    raw_value: str | None   # the value exactly as it appeared in the source
```

`normalize.py` then applies the index's `label_rule` and turns `period` into the site's `recorded_at` + `label` (e.g. `month_end` → `2025-08-31` / `31.08.2025`). Adapters never produce labels themselves, which keeps the day-of-month rules in one place.

### 4.3 New tables (`schema_office_kpi_pipeline.sql`)

```sql
-- Downloaded source files (B/C). Files themselves go in Storage bucket `kpi-sources`.
create table if not exists kpi_documents (
  id bigint generated always as identity primary key,
  doc_key text not null,            -- e.g. 'police_yearbook', 'shabak_monthly'
  url text not null,
  sha256 text not null unique,      -- dedupe: same file is never parsed twice
  storage_path text,
  edition text,                     -- '2024', '2025-08'
  fetched_at timestamptz not null default now(),
  parse_status text not null default 'new'
    check (parse_status in ('new','parsed','failed','ignored'))
);

-- Staging for every extracted value, with provenance.
create table if not exists index_data_candidates (
  id bigint generated always as identity primary key,
  index_id bigint not null references indexes(id),
  recorded_at date not null,
  label text not null,
  value numeric not null,
  raw_value text,
  method text not null,
  confidence real not null,
  source_url text,
  document_id bigint references kpi_documents(id),
  evidence jsonb,
  validation jsonb,                 -- {"checks": [...], "flags": ["jump_3sd"]}
  kind text not null default 'new'  -- 'new' | 'revision' | 'same'
    check (kind in ('new','revision','same')),
  previous_value numeric,
  status text not null default 'pending'
    check (status in ('pending','approved','rejected','published','superseded')),
  reviewed_by text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (index_id, recorded_at, value, method)
);

-- Automation metadata on existing indexes (curation stays in YAML; this is runtime state).
alter table public.indexes add column if not exists last_checked_at timestamptz;
alter table public.indexes add column if not exists last_new_data_at timestamptz;
alter table public.indexes add column if not exists next_expected_at date;

-- Optional audit: which candidate produced each published point.
alter table public.index_data add column if not exists candidate_id bigint;
alter table public.index_data add column if not exists source_url text;
```

RLS: both new tables are service-role write; `index_data_candidates` gets **no anon read**. The review UI goes through a Next API route that uses `requirePipelineSecret`.

### 4.4 Validation rules (`validate.py`)

| Check | Rule | On fail |
|-------|------|---------|
| Type/unit | numeric, and within the registry's `bounds` (e.g. percent 0–100, Gini 20–60) | reject |
| Period sanity | not in the future; frequency matches the registry | reject |
| Jump detector | Change vs the last point is > `max_jump` (registry, default 3σ of historical diffs, or ±40% YoY for yearly series) | review, even for tier A |
| Revision | same `(index_id, recorded_at)` exists with a different value | `kind='revision'`. Tier A applies it if |Δ| < 2% and flags it in the run summary; anything bigger goes to review |
| Cross-check | when the registry names a `cross_check` source (e.g. unemployment CBS vs BOI) they must agree within tolerance | review |
| LLM evidence | `quote` must literally contain the `raw_value` string, and the page must exist in the document | reject (catches hallucination) |

### 4.5 Auto-publish policy

```
publish automatically if all validations passed and:
    (method in ("api", "api_unofficial")
       or (method == "table" and this doc_key's layout was approved before))   # tier B after first approval
    and (kind == "new" or (kind == "revision" and |Δ| < 2%))
otherwise → pending review
```

LLM-extracted values are **never** auto-published in v1. After ~6 months of review history, look at the per-document approval rate and consider auto-publishing a document key that has been ≥ 98% approved.

### 4.6 LLM extraction (tier C)

- Pre-extract with `pdfplumber` (text + tables per page). Hebrew RTL PDFs often come out reversed or garbled. Detect this (e.g. if more than X% of Hebrew tokens are reversed, flip them) and fall back to OCR (`tesseract -l heb`) only when there is no text layer.
- **Narrow the input before calling the model.** Each document key has `anchors` in the registry (for example `"גניבות רכב"`, `"מתנדבים"`). Only the pages containing those anchors, plus their neighbouring pages, are sent to the model. This saves cost and reduces confusion between look-alike tables.
- One call per document per *group* of indexes, using OpenAI structured output with a JSON schema: `[{index_key, period, value, raw_value, page, quote, unit}]`. The prompt includes each index's **definition and the last 3 known values**, so the model picks the matching series. For example, "כלי רכב פרטיים שנגנבו" and "כלל כלי הרכב" are different series, and the history shows which one we track.
- Keep all the model's outputs, including rejected ones, in `evidence` for debugging.

### 4.7 Document discovery (tiers B/C)

Each `doc_key` has a `discover` block:

```yaml
discover:
  page: https://www.gov.il/he/departments/publications/reports/police_statistical_2024
  link_regex: 'שנתון.*\.pdf$'
  edition_from: 'url_year'     # or 'link_text', 'page_date'
  expected: {every: year, month: 7}   # used for next_expected_at + alerting
```

- gov.il pages are JS-rendered and sometimes protected by bot checks. Handle them in this order: (1) the gov.il `BlobFolder` direct URL pattern with the year substituted, (2) plain `requests`, (3) Playwright (Chromium is already available on GitHub runners) as the last resort. Record which path worked.
- A new `sha256` creates a `kpi_documents` row, and extraction runs only for new documents. This makes the job cheap enough to run weekly.

### 4.8 Scheduling: one nightly workflow + a planner

There is **one** GitHub Action, `office-kpi-pipeline.yml`, which runs every night. The workflow has no scheduling logic of its own. It runs the orchestrator, and the orchestrator's **planner** works out from the registry and the database what is worth checking tonight.

**Why not "monthly KPIs once a month"?** A fixed monthly day can run the night before a release and then miss the data for a whole month. The planner instead **looks for the next missing period only inside the window when it is expected**, retries inside that window until the data shows up, and then stays quiet until the next period's window opens.

#### Planner logic (`planner.py`)

For each index in `kpi_sources.yaml`:

```
latest      = max(recorded_at) in index_data           # e.g. 2025-06 for a monthly series
target      = latest + 1 period                         # the period we're hunting: 2025-07
window      = release window for target (from registry `release`):
                monthly: [end(target) + min_lag_days, end(target) + max_lag_days]
                yearly:  "MM-DD..MM-DD" in year(target)+1   (e.g. obudget 2025 → 2026-03-01..2026-07-31)
state       = kpi_check_state row for (index_id, target) → last_checked_at, attempts

today < window.start                          → SKIP   (not expected yet)
window.start ≤ today ≤ window.end:
      today - last_checked_at ≥ check_every   → CHECK
      else                                    → SKIP   (checked recently)
today > window.end                            → OVERDUE: check weekly + list in the freshness alert
target found (any candidate, even pending)    → move on to target+1; its window decides the next check
```

This works for backlog too. If a series is 2 years behind, `target` is the oldest missing period and its window has already passed, so it's checked tonight. Once found, the next period is checked the following night, and so on. API adapters simply return every missing period in one call, so a 2023→2026 gap closes in a single night.

#### Nightly run order

1. **Plan:** build tonight's due list and log it (`[plan] 7 due · 38 not yet · 3 overdue`).
2. **Group by source:** due indexes that share a document (`police_yearbook`, `shabak_monthly`) or API are grouped, so each source is fetched once.
3. **Execute:** cheapest sources first (APIs → files → PDF+LLM). Each source group is isolated: a failure in one is logged and the run continues. There are guardrails: `MAX_LLM_CALLS_PER_NIGHT` (default 20) and a total time budget (default 40 min). Groups that don't fit are pushed to tomorrow night.
4. **Validate → stage → publish** (4.4–4.5).
5. **Update `kpi_check_state`** (checked_at, attempts, found/not found, error).
6. **Report:** one `pipeline_runs` row with a per-index summary (`changes` includes `source_url` so `/piplines` can link out for fact-checking). `emit_site_updates` runs only if something was published. **One** GitHub issue, "Office KPIs: needs attention", is created or updated (never duplicated) when there are pending reviews, overdue indexes, or failing sources.

**Monthly revision sweep:** on the 1st of each month the planner also re-queries API sources for the last 12 periods, to catch revised values (CBS revises past figures). This is the only check that doesn't depend on a missing period.

#### State table

```sql
create table if not exists kpi_check_state (
  index_id bigint not null references indexes(id),
  target_period date not null,          -- the period being hunted
  window_start date, window_end date,
  last_checked_at timestamptz,
  attempts int not null default 0,
  status text not null default 'waiting'
    check (status in ('waiting','checking','found','overdue','error')),
  last_error text,
  primary key (index_id, target_period)
);
```

This replaces the `last_checked_at` / `next_expected_at` columns proposed on `indexes` in 4.3. The freshness table in the review UI reads from this table.

#### Workflow

```yaml
name: office-kpi-pipeline
on:
  schedule:
    - cron: '0 23 * * *'      # 02:00 Israel (summer) — after most gov sites publish, before morning traffic
  workflow_dispatch:
    inputs:
      index:   { description: 'Only this index_id (ignores windows)', required: false }
      force:   { description: 'Check all indexes regardless of windows', type: boolean, default: false }
      dry_run: { description: 'Plan + extract, write nothing', type: boolean, default: false }
concurrency: { group: office-kpi-pipeline, cancel-in-progress: false }
jobs:
  run:
    runs-on: ubuntu-latest
    timeout-minutes: 60
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with: { python-version: '3.13', cache: pip }
      - run: pip install -r requirements.txt && python -m playwright install --with-deps chromium
        working-directory: 'Layer 1 - Gathering Data/Offices'
      - run: >
          python run_office_kpi_pipeline.py
          ${{ inputs.index && format('--index {0}', inputs.index) || '' }}
          ${{ inputs.force && '--force' || '' }}
          ${{ inputs.dry_run && '--dry-run' || '' }}
        working-directory: 'Layer 1 - Gathering Data/Offices'
        env:
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_SERVICE_KEY: ${{ secrets.SUPABASE_SERVICE_KEY }}
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
          PIPELINE_RUN_SOURCE: github-actions
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}   # for the single "needs attention" issue
```

For debugging, the same command runs locally: `python run_office_kpi_pipeline.py --plan-only` prints tonight's plan with the reason for each index, and `--date 2026-10-15` simulates the planner on another day.

### 4.9 Ops surface

- `src/content/pipelines/officeKpis.ts` → a new card on `/piplines` with its schedule and docs.
- `/government/dashboard/edit` (same password gate as `/knesset/edit`):
  - **Review queue**: each candidate side by side with a mini chart of the existing series + the new point, the evidence quote/page, and a link to the stored PDF page. Actions: Approve / Edit value / Reject.
  - **Freshness table**: 48 rows showing the latest point, expected next release, last checked time, and status (🟢 fresh / 🟡 due / 🔴 overdue / ⚪ manual).
  - **Manual entry** for tier D. It writes a candidate with `method='manual'` so the same publish path and audit apply.
- `emit_site_updates` is called only when points were **published**, with facts like `{"page": "דשבורד הממשלה", "updated": ["מחירי הדירות", "אינפלציה"]}`. Dedupe key is `office-kpis:{pipeline_run_id}:{sorted index keys}` so each publishing run gets its own homepage ticker row (same-day runs no longer overwrite each other).

## 5. Data-quality flags found while mapping (curation decisions needed)

1. **ביטחון לאומי › תקציב (id 22)**: the series (~₪52M/yr) is obudget code `0010`/`00105101`, which is only the **ministry HQ** (מטה). Police and Prison Service budgets are separate sections worth billions. Decide: keep it as "HQ budget" and rename it, or switch to the sum of the relevant sections. The same question applies to **תחבורה › תקציב (id 24)** (~₪0.5B, ministry section only).
2. **כלי רכב חשמליים (id 29)**: values are share of **new first-registrations** (`moed_aliya_lakvish`, fuel=`חשמל`), not of the whole fleet. `indexes.info` and the datagov adapter match that definition; only complete calendar years are published.
3. **תחבורה still on document**: נוסעים בנתב"ג (30), נסיעות באוטובוסים (31), תאונות דרכים (26) — no CBS/data.gov series matched site history; IAA/MOT/police file extractors are the next step. Vehicles/1000 (28), fuel Jan (32), road fatalities (36) use `curated`; rail passengers (34) uses CBS monthly series `1617` summed ×1000.
4. **Freshness ≠ last label on site**: a card is green only while the *next* expected period is still inside its release window. Fuel (32) uses `year_offset: 0` and window `01-01..02-15`, so after publishing January 2025 it immediately expects January 2026 — with 2025 on site and today past mid-Feb 2026 the box is correctly red until 2026 is curated. Vehicles (28) stays red until new CBS rates are hand-added to `curated_series.yaml` (no live series id yet); catch-up through 2025 is in YAML (421 / 427).
3. **שכר ממוצע (id 58)** and **אחוז אבטלה (id 60)** now resolve via `cbs_series` (IDs 615908 / 493549). Update live `indexes.source` URLs to the CBS series endpoints when publishing.
4. **Monthly day convention**: ids 1 and 14 should share the same `recorded_at` per month (one has `30.08.2025`, the other `31.08.2025`). Normalize this in the first migration.
5. **Methodology breaks**: CBS rebases the CPI and the police sometimes change yearbook definitions. The registry has a `notes`/`break_at` field, so the chart can later show a break marker.

## 6. Rollout plan

| Phase | Deliverable | Covers |
|-------|-------------|--------|
| **0 — Foundations** | `schema_office_kpi_pipeline.sql`, registry loader, **planner**, `Observation`/normalize/validate/publish, the single nightly workflow, `--plan-only` / `--dry-run` | – |
| **1 — Quick wins, tier A** | obudget, CBS price, CBS series, World Bank, BOI, data.gov.il adapters, plus the nightly workflow | ~17 indexes; backfills 2024–2026 on day one |
| **2 — Review UI + freshness** | `/government/dashboard/edit` queue + freshness table, and the `/piplines` card | Makes C/D safe |
| **3 — Tier C documents** | Police yearbook (6 indexes in one extractor), Shabak monthly (2), then BTL, Road Safety, MOF deficit | +14 |
| **4 — Tier B + A′** | IAA xlsx, CBS yearbook tables, shkifut JSON spike | +12 |
| **5 — Tier D** | Edition-watch and manual entry | +5 → all 48 automated or tracked |

Then new indexes/offices = new registry entries + (sometimes) one new prompt file.

## 7. Verification

```bash
cd "Layer 1 - Gathering Data/Offices"
python run_office_kpi_pipeline.py --tier A --dry-run          # prints candidates + diff, writes nothing
python run_office_kpi_pipeline.py --index 56 --dry-run        # single index
python -m pytest tests/                                        # fixture PDFs/JSON per adapter
```

Each adapter has a recorded fixture (a saved JSON/PDF) and a test that replays the existing series. **Regression check:** running the adapter over past periods must reproduce the values already in `index_data` within tolerance. This is how we show that an automated source matches the hand-curated history before we let it write anything.

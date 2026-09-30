# Office KPI Automation — System & Plan

Code: `Layer 1 - Gathering Data/Offices/` · Workflow: `.github/workflows/office-kpi-pipeline.yml`

Refreshes the 49 indexes on `/government/dashboard` automatically. Details: `OfficeKpiPipeline.md`. Per-index config: `kpi_sources.yaml`.

## System

- **One GitHub Action**, nightly at 02:00 IL, runs `run_office_kpi_pipeline.py`.
- **Registry** (`kpi_sources.yaml`): for each index it holds the source, adapter, date/label rule and **release window**.
- **Planner**: for each index it targets the next missing period and checks only while that period's release window is open. It retries until found, then waits for the next window. Past the window, the index is marked overdue.
- **Adapters** fetch data. Three kinds:
  - **API** (obudget, CBS, World Bank, BOI, data.gov.il)
  - **Structured files** (XLSX/tables)
  - **PDF + LLM** (the model is a setting, chosen by testing)
- **Safety**:
  - Every value lands in a staging table with its source and evidence.
  - API values are auto-published if they pass validation; PDF values wait for manual review.

## Flow

```
nightly cron → planner (what's due tonight?) → group by source
  → fetch (API / download doc once) → extract → normalize date+label
  → validate → index_data_candidates
      ├─ trusted & valid → index_data (published)
      └─ else → review queue
  → update kpi_check_state → pipeline_runs row
  → site update (if published) → one "needs attention" GitHub issue (if needed)
```

## To-do

### 1. Build the core
- [x] SQL: `index_data_candidates`, `kpi_documents`, `kpi_check_state` (+ RLS)
- [x] Registry loader + validation
- [x] Planner (release windows, retry cadence, overdue)
- [x] `Observation` model, normalize (label rules), validate, publish
- [x] Runner flags: `--plan-only --dry-run --index --force --date`
- [x] Nightly workflow `office-kpi-pipeline.yml`

### 2. First adapter + test
- [x] CBS housing index adapter (verified API)
- [x] Test: the adapter reproduces the existing history
- [x] Dry run: shows the missing months correctly

### 3. All API sources
- [x] obudget adapter (8 budgets, 100% match with history; session warm-up bypasses `Bot detected`)
- [x] CBS series adapter — growth / wage / unemployment + rail yearly_sum (index 34, series 1617)
- [x] Curated adapter covers AG debt (52/55) and Transport rates without a live series yet (vehicles/1000, fuel Jan, road fatalities)
- [x] History-reproduction test for cbs_price / cbs_series / obudget / worldbank / datagov / curated

### 4. Review UI
- [x] `/government/dashboard/edit`: review queue, freshness table, approve/reject
- [x] Pipeline card on `/piplines` (`officeKpis.ts`, id `office-kpis`)

### 5. Documents
- [x] Document discovery + download (dedupe by hash) — `discover.py`, `doc_cache.py`, `documents.yaml`
- [x] XLSX/table extractor scaffold (`extractors/xlsx_table.py`; IAA layout TBD)
- [x] PDF + LLM extractor with quote check (`extractors/pdf_llm.py` + prompts). Default model `gpt-4.1-mini` (`OFFICE_KPI_LLM_MODEL`)
- [x] First docs wired: police yearbook (discovery via policemuseum.org.il + PDF LLM), Shabak monthly, BTL poverty (prompt only); remaining docs still need live fixtures
- [x] Tune police yearbook prompts/anchors so series match history (all 6 indexes match 2023 fixture: 19/20/21/26/39/40)
- [x] Shabak confusion guard: prompt + `avoid_anchors` (מעצרים) + per-index `quote_must_include` / `quote_must_not_include` so מעצרי פעילי טרור cannot pass as index 1 פיגועים
- [x] Shabak monthly: one PDF per month — `discover_all` + Hebrew month editions; download/extract each missing month (cap `MAX_MONTHLY_DOCS_PER_NIGHT=6`). Playwright required (Cloudflare)
- [ ] Enable in GitHub Action: set `OFFICE_KPI_DOCUMENTS=true` + `playwright install chromium` once ready

### 6. Test before production
- [x] Unit tests (planner dates, label rules, validation)
- [x] `--date` simulation: checks start in the window, respect retry cadence, go weekly when overdue
- [x] Apply `schema_office_kpi_pipeline.sql` in Supabase
- [ ] 1–2 weeks of nightly runs in `--dry-run`; review the plans and diffs

### 7. Production
- [ ] Go live: set repo variable `OFFICE_KPI_LIVE=true` (scheduled runs are dry-run until then), API sources only
- [ ] Watch the nightly issue and run log for 2 weeks
- [ ] Enable document sources (`OFFICE_KPI_DOCUMENTS=true`); review all PDF values
- [ ] Tune release windows from run history
- [x] Update `Database.md`, `PiplinesPage.md`

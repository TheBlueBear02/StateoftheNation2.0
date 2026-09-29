# Office KPI Automation — System & Plan

Code: `Layer 1 - Gathering Data/Offices/` · Workflow: `.github/workflows/office-kpi-pipeline.yml`

Refreshes the 48 indexes on `/government/dashboard` automatically. Details: `OfficeKpiPipeline.md`. Per-index config: `kpi_sources.yaml`.

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
- [ ] Document discovery + download (dedupe by hash)
- [ ] XLSX/table extractor
- [ ] PDF + LLM extractor with a quote check. Pick the model by testing it on past editions
- [ ] Police yearbook, Shabak monthly, then the remaining docs

### 6. Test before production
- [x] Unit tests (planner dates, label rules, validation)
- [x] `--date` simulation: checks start in the window, respect retry cadence, go weekly when overdue
- [x] Apply `schema_office_kpi_pipeline.sql` in Supabase
- [ ] 1–2 weeks of nightly runs in `--dry-run`; review the plans and diffs

### 7. Production
- [ ] Go live: set repo variable `OFFICE_KPI_LIVE=true` (scheduled runs are dry-run until then), API sources only
- [ ] Watch the nightly issue and run log for 2 weeks
- [ ] Enable document sources; review all PDF values
- [ ] Tune release windows from run history
- [x] Update `Database.md`, `PiplinesPage.md`

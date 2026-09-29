# Piplines Page — `/piplines`

Ops dashboard and documentation hub for data pipelines that feed the project database.

## Routes

| URL | Behavior |
|-----|----------|
| `/piplines` | Password-gated **dashboard**: pipeline cards, schedules, run log |
| `/piplines/government-dashboard` | Password-gated **office index board**: all shown indexes by office; green/red border = up-to-date vs not updated past release window; green/red tag = automated adapter live vs not; equal-height cards link to `/government/dashboard?office=&index=` |
| `/piplines/docs` | Redirects to `/piplines/docs/{DEFAULT_PIPELINE_ID}` |
| `/piplines/docs/[[...slug]]` | Docs hub: sidebar + `PipelineDocView` for the selected pipeline |
| `/piplines/{id}` | Legacy redirect → `/piplines/docs/{id}` (if id is a known pipeline) |

Docs pages are `noindex` but **not** password-gated. The dashboard and all `/edit` pages share one unlock password.

## Shared password

- Env: `NEXT_PUBLIC_PIPELINE_EDIT_SECRET` / `PIPELINE_EDIT_SECRET`
- Fallbacks: existing `ELECTIONS_EDIT_SECRET` / `KNESSET_EDIT_SECRET` (and `VITE_` / `NEXT_PUBLIC_` variants)
- Session key: `pipeline-unlocked` (shared across dashboard + `/elections/edit`, `/elections/polls/edit`, `/knesset/edit`)
- Helpers: `src/lib/pipelineAuth.ts`, `src/components/pipelines/PipelineUnlockGate.tsx`
- API: `requirePipelineSecret` in `src/server/apiCommon.ts` (accepts `x-pipeline-edit-secret`, `x-elections-edit-secret`, or `x-knesset-edit-secret`)

## File Map

| Path | Role |
|------|------|
| `src/app/piplines/page.tsx` | Dashboard App Router page |
| `src/app/piplines/docs/[[...slug]]/page.tsx` | Docs App Router page |
| `src/app/piplines/[slug]/page.tsx` | Legacy redirect |
| `src/views/PipelinesDashboardPage.tsx` / `.css` | Dashboard UI |
| `src/views/GovernmentDashboardPipelinePage.tsx` / `.css` | Office KPI coverage board |
| `src/app/piplines/government-dashboard/page.tsx` | Board App Router page |
| `src/content/officeKpiRegistry.ts` | Mirror of `kpi_sources.yaml` (automated flags + release windows) |
| `src/lib/officeKpiPeriods.ts` | Period / release-window freshness helpers |
| `src/views/PiplinesDocsPage.tsx` | Docs shell (sidebar + main) |
| `src/views/PiplinesPage.css` | Docs layout styles |
| `src/components/pipelines/PipelineDocView.tsx` | Renders a `PipelineDoc` |
| `src/components/pipelines/PipelineUnlockGate.tsx` | Shared password gate |
| `src/components/pipelines/PipelineRunLog.tsx` | Run history feed |
| `src/hooks/usePipelineRuns.ts` | Loads `pipeline_runs` |
| `src/hooks/usePipelineRunProgress.ts` | Live total + per-step timers on edit panels |
| `src/content/pipelines/index.ts` | `PIPELINES` registry |
| `src/content/pipelines/officeKpis.ts` | Office KPI pipeline card + docs |
| `src/content/pipelines/types.ts` | Includes `schedule`, `docsPath`, `editPath` |
| `Layer 1 - Gathering Data/schema_pipeline_runs.sql` | Run-history table DDL |
| `Layer 1 - Gathering Data/record_pipeline_run.py` | Shared insert helper |
| `Layer 1 - Gathering Data/schema_site_updates.sql` | Homepage news-strip table DDL |
| `Layer 1 - Gathering Data/emit_site_updates.py` | Shared finish-hook: facts → LLM headline → `site_updates` |

## Dashboard (`/piplines`)

1. Breadcrumb + title **לוח צינורות נתונים**
2. **Pipeline cards** from `PIPELINES`: status, schedule label, links to docs + edit
3. **Run log** — last 50 rows from `pipeline_runs` (newest first). Rows are clickable: expand to see structured details when `summary` has them (office KPIs store per-value `changes`: index name, period, value, previous value, status, and `source_url` as a **מקור לבדיקה** link for fact-checking). Office KPI English legacy messages are normalized to Hebrew counts (**פורסמו** / **ממתינים לאישור** / **נבדקו**).

Schedules today:

| Pipeline | Schedule label |
|----------|----------------|
| Polls | כל יום בחצות · 00:00 שעון ישראל (`0 21 * * *` UTC) |
| Knesset | כל יום שבת בחצות · 00:00 שעון ישראל (`0 21 * * 5` UTC) |
| Office KPIs | כל לילה ב־02:00 שעון ישראל (`0 23 * * *` UTC) |
| Elections candidates | לא נקבע עדיין |

## `pipeline_runs`

Anon **read**; service-role **write**. Writers:

- Polls CLI (`run_polls_pipeline.py`) — `source` from `PIPELINE_RUN_SOURCE` (default `cli`; GitHub Actions sets `github-actions`)
- Knesset CLI (`load_all_knesset_data.py`) — same `PIPELINE_RUN_SOURCE` convention
- Office KPI CLI (`run_office_kpi_pipeline.py`) — `pipeline=office-kpis`; same `PIPELINE_RUN_SOURCE` convention
- Polls / Knesset UI APIs — `source=ui`

Polls edit UI (`/elections/polls/edit`) also shows a **diagnostics console** fed by `diagnostics` from `run_polls_pipeline_api.py` (rejected staging rows, parse/validation warnings), plus **stage 7** (`יצירת עדכון`) that emits a homepage ticker row and lets you edit/save the headline. Knesset edit UI (`/knesset/edit`) has the same stage-7 pattern: stage 6 records position diffs; stage 7 emits and exposes the editable headline.

Office KPI edit UI (`/government/dashboard/edit`): last run summary + status counts from `index_data_candidates`, filterable candidate cards (pending / published / rejected / all) with **Approve & publish** or **Reject**, a freshness table from `kpi_check_state`, and the homepage news-strip headline from `site_updates` (`event_type=office-kpis`) with editable save. Coverage board (`/piplines/government-dashboard`, linked as **לוח סטטוס** on the office-kpis card): all `is_shown` indexes grouped by office; **green border** when the next expected period is not past its release-window end, **red border** when overdue; **green tag** when `adapterFamily` is in `{cbs_price,cbs_series,obudget,worldbank,datagov,boi_sdmx,curated}` (and registry params are not `TODO`), else **red tag**. Equality/Gini (57) stays document (BTL PDF). APIs under `/api/office-kpis/*` (status, candidates, freshness, board, review, site-update) use `requirePipelineSecret` + service role.

Apply `schema_pipeline_runs.sql` once in the Supabase SQL editor before the dashboard log can load.

## Homepage site updates (`emit_site_updates`)

Every successful non-dry-run pipeline orchestration that made meaningful DB changes must emit a homepage news-strip headline via the shared helper.

| Piece | Role |
|-------|------|
| `emit_site_updates.py` | Collect structured change facts → gpt-4o writes one Hebrew headline (max 8 words, formal news tone, mention the target page) → insert into `site_updates` |
| `site_updates` | Anon-readable feed for the homepage black ticker (`useSiteUpdates`) |
| Failure mode | Best-effort: missing `OPENAI_API_KEY`, empty facts, or API errors → skip emit; pipeline exit code unchanged |

Public API:

```python
emit_pipeline_site_update(
    sb,
    event_type="polls_run",       # or knesset_run / elections_run / …
    href="/elections/polls",
    page_label_he="עמוד הסקרים",
    facts={...},                  # structured changes only
    dedupe_key="...",
)
```

Thin collectors already wired:

- `emit_polls_run_update` — new non-scenario polls since run start → `/elections/polls`
- `emit_knesset_run_update` — field-level membership/appointment diffs → `/knesset`
- `emit_elections_run_update` — new `election_candidates` since run start → `/elections`

Finish sequence for orchestrators: domain work → `record_pipeline_run` → **emit site update only if the run produced new/changed data** (e.g. new polls inserted, knesset position field diffs, new election candidates, office KPI publishes). Do not call emit on no-op successful runs. Dedupe keys must be unique per meaningful change set (poll ids, knesset diff hash, office-kpis `run_id`+index keys) — not a once-per-day key that overwrites earlier ticker rows.

Apply `schema_site_updates.sql` in the Supabase SQL editor. Scheduled polls and knesset runs need `OPENAI_API_KEY` as a GitHub Actions secret (missing key skips emit).

## Adding a New Pipeline

1. Create `src/content/pipelines/{id}.ts` exporting a `PipelineDoc` with `docsPath`, optional `editPath`, and `schedule`.
2. Append it to `PIPELINES` in `src/content/pipelines/index.ts`.
3. Call `record_pipeline_run` on finish (ops dashboard).
4. Call `emit_pipeline_site_update` (or a dedicated collector in `emit_site_updates.py`) **only when the run produced new/changed data** (non-empty facts) — with structured facts, `href`, and Hebrew page label. Do not invent a second news-feed writer. Do not call emit on no-op successful runs.
5. Document in that pipeline’s `PipelineDoc` what facts are emitted and which site page the ticker links to.
6. Docs sidebar and dashboard cards update from the registry.

## Content Rules

- Pipeline page content should explain data sources, data flow, updated entities, run modes, and project-facing behavior.
- Do not mention storage vendors, frontend frameworks, build tools, SDKs, package names, or implementation tooling in pipeline docs unless the user explicitly asks for it.
- Use neutral language such as "project database", "target tables", "sync process", and "site data".

## Design

- White background, square corners, blue accents (DesignLanguage)
- Docs: sidebar nav with muted inactive / black active text; RTL; code blocks `direction: ltr`
- Dashboard: card grid + scrollable run log with status rail
- Mobile: sidebar stacks above main below 768px

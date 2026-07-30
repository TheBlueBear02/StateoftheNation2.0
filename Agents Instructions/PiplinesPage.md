# Piplines Page — `/piplines`

Ops dashboard and documentation hub for data pipelines that feed the project database.

## Routes

| URL | Behavior |
|-----|----------|
| `/piplines` | Password-gated **dashboard**: pipeline cards, schedules, run log |
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
| `src/views/PiplinesDocsPage.tsx` | Docs shell (sidebar + main) |
| `src/views/PiplinesPage.css` | Docs layout styles |
| `src/components/pipelines/PipelineDocView.tsx` | Renders a `PipelineDoc` |
| `src/components/pipelines/PipelineUnlockGate.tsx` | Shared password gate |
| `src/components/pipelines/PipelineRunLog.tsx` | Run history feed |
| `src/hooks/usePipelineRuns.ts` | Loads `pipeline_runs` |
| `src/content/pipelines/index.ts` | `PIPELINES` registry |
| `src/content/pipelines/types.ts` | Includes `schedule`, `docsPath`, `editPath` |
| `Layer 1 - Gathering Data/schema_pipeline_runs.sql` | Run-history table DDL |
| `Layer 1 - Gathering Data/record_pipeline_run.py` | Shared insert helper |

## Dashboard (`/piplines`)

1. Breadcrumb + title **לוח צינורות נתונים**
2. **Pipeline cards** from `PIPELINES`: status, schedule label, links to docs + edit
3. **Run log** — last 50 rows from `pipeline_runs` (newest first)

Schedules today:

| Pipeline | Schedule label |
|----------|----------------|
| Polls | פעמיים ביום · 05:00 ו־17:00 UTC (`0 5,17 * * *`) |
| Knesset | לא נקבע עדיין |
| Elections candidates | לא נקבע עדיין |

## `pipeline_runs`

Anon **read**; service-role **write**. Writers:

- Polls CLI (`run_polls_pipeline.py`) — `source` from `PIPELINE_RUN_SOURCE` (default `cli`; GitHub Actions sets `github-actions`)
- Polls / Knesset UI APIs — `source=ui`

Apply `schema_pipeline_runs.sql` once in the Supabase SQL editor before the dashboard log can load.

## Adding a New Pipeline

1. Create `src/content/pipelines/{id}.ts` exporting a `PipelineDoc` with `docsPath`, optional `editPath`, and `schedule`.
2. Append it to `PIPELINES` in `src/content/pipelines/index.ts`.
3. Docs sidebar and dashboard cards update from the registry.

## Content Rules

- Pipeline page content should explain data sources, data flow, updated entities, run modes, and project-facing behavior.
- Do not mention storage vendors, frontend frameworks, build tools, SDKs, package names, or implementation tooling in pipeline docs unless the user explicitly asks for it.
- Use neutral language such as "project database", "target tables", "sync process", and "site data".

## Design

- White background, square corners, blue accents (DesignLanguage)
- Docs: sidebar nav with muted inactive / black active text; RTL; code blocks `direction: ltr`
- Dashboard: card grid + scrollable run log with status rail
- Mobile: sidebar stacks above main below 768px

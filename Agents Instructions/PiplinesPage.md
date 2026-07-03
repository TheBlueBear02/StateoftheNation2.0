# Piplines Page — `/piplines`

Documentation hub for data pipelines that feed the project database. Layout mimics a code-project docs site: pipeline list in a sidebar, selected pipeline content in the main column.

## Routes

| URL | Behavior |
|-----|----------|
| `/piplines` | Redirects to `/piplines/knesset` (default pipeline) |
| `/piplines/:pipelineId` | Renders pipeline doc if `pipelineId` exists in registry; otherwise redirects to default |

## File Map

| Path | Role |
|------|------|
| `src/pages/PiplinesPage.tsx` | Page shell: sidebar nav + nested `Routes` for pipeline content |
| `src/pages/PiplinesPage.css` | Docs layout, sidebar, tables, code blocks |
| `src/components/pipelines/PipelineDocView.tsx` | Renders a `PipelineDoc` (sections, tables, code) |
| `src/content/pipelines/index.ts` | `PIPELINES` registry, `getPipelineById`, `DEFAULT_PIPELINE_ID` |
| `src/content/pipelines/types.ts` | `PipelineDoc`, `PipelineSection`, `PipelineTable` types |
| `src/content/pipelines/knesset.ts` | Knesset OData → project database pipeline content |

## Adding a New Pipeline

1. Create `src/content/pipelines/{id}.ts` exporting a `PipelineDoc`.
2. Append it to `PIPELINES` in `src/content/pipelines/index.ts`.
3. Sidebar and routes update automatically from the registry.

## Content Rules

- Pipeline page content should explain data sources, data flow, updated entities, run modes, and project-facing behavior.
- Do not mention storage vendors, frontend frameworks, build tools, SDKs, package names, or implementation tooling in pipeline docs unless the user explicitly asks for it.
- Use neutral language such as "project database", "target tables", "sync process", and "site data".
- Keep operational commands only when they help agents understand or run the pipeline; avoid exposing unrelated stack details.

## Knesset Pipeline (live)

- **Script:** `Layer 1 - Gathering Data/knesset/sync_knesset_data.py`
- **Source:** `http://knesset.gov.il/Odata/ParliamentInfo.svc`
- **Tables:** `knessets`, `people`, `knesset_factions`, `offices`, `governments`, `knesset_memberships`, `minister_appointments`
- **Related scripts:** `km_images.py`, `fix_faction_links*.py`, `check.py` in the same folder

## Design

- White background with subtle borders between sidebar and content
- Sidebar navigation is plain text only: inactive pipeline links use muted gray text, and the selected pipeline uses black text
- RTL via `SiteLayout`; code blocks use `direction: ltr`
- Status appears as a plain text label in the document header, not as a filled badge and not in the sidebar navigation
- Mobile: sidebar stacks above main content below 768px

## Layout

```
SiteLayout
  └─ main.piplines-page
       └─ grid: sidebar | main
            ├─ aside.piplines-sidebar — NavLink per pipeline
            └─ div.piplines-main — PipelineDocView for active pipeline
```

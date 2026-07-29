# Piplines Page — `/piplines`

Documentation hub for data pipelines that feed the project database. Layout mimics a code-project docs site: pipeline list in a sidebar, selected pipeline content in the main column.

## Routes

| URL | Behavior |
|-----|----------|
| `/piplines` | Redirects to `/piplines/knesset` (default pipeline) |
| `/piplines/[[...slug]]` | App Router catch-all; view reads `slug` via `useParams` and renders pipeline doc if id exists in registry; otherwise redirects to default |

## File Map

| Path | Role |
|------|------|
| `src/app/piplines/[[...slug]]/page.tsx` | App Router wrapper + metadata |
| `src/views/PiplinesPage.tsx` | Page shell: sidebar nav (`next/link`) + pipeline content from slug |
| `src/views/PiplinesPage.css` | Docs layout, sidebar, tables, code blocks |
| `src/components/pipelines/PipelineDocView.tsx` | Renders a `PipelineDoc` (sections, tables, code) |
| `src/content/pipelines/index.ts` | `PIPELINES` registry, `getPipelineById`, `DEFAULT_PIPELINE_ID` |
| `src/content/pipelines/types.ts` | `PipelineDoc`, `PipelineSection`, `PipelineTable` types |
| `src/content/pipelines/knesset.ts` | Knesset OData → project database pipeline content |
| `src/content/pipelines/electionsCandidates.ts` | Elections candidate-list → project database pipeline content |
| `src/content/pipelines/elections2026Polls.ts` | Wikipedia polls → weighted averages pipeline content |

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

- **Script:** `Layer 1 - Gathering Data/knesset/load_all_knesset_data.py` (also referenced as `sync_knesset_data.py` in script headers)
- **API wrapper:** `Layer 1 - Gathering Data/knesset/run_knesset_pipeline_api.py` — used by `/knesset/edit` in dev
- **HTTP API:** `src/app/api/knesset/[...path]/route.ts` (status, stages, sync-full, faction links, images, update-faction)
- **Dev UI:** `/knesset/edit` — password-gated pipeline runner + faction metadata editor (`KNESSET_EDIT_SECRET` / `NEXT_PUBLIC_KNESSET_EDIT_SECRET`)
- **Source:** `http://knesset.gov.il/Odata/ParliamentInfo.svc`
- **Tables:** `knessets`, `people`, `knesset_factions`, `offices`, `governments`, `knesset_memberships`, `minister_appointments`
- **Related scripts:** `km_images.py`, `fix_faction_links_all.py` in the same folder

## Elections Candidates Pipeline (live)

- **Route:** `/piplines/elections-candidates`
- **Scripts:** `Layer 1 - Gathering Data/Elections/insert_raw_list.py`, `run_pipeline.py`, `resolve_candidates.py`, `enrich_wikidata.py`, `generate_descriptions.py`, `geocode_cities.py`, `fetch_candidate_birthdates.py`, `fetch_candidate_wiki_urls.py`
- **HTTP API:** `src/app/api/elections/[...path]/route.ts` — review-queue, preview, insert, stage, resolve-review, update-candidate/party, enrich-candidate, geocode-map
- **Sources:** manually inserted candidate lists, Knesset OData, Wikidata, Hebrew Wikipedia summaries, Nominatim / OpenStreetMap
- **Tables:** `elections`, `election_parties`, `raw_candidate_lists`, `election_candidates`, `people`
- **Workflow:** prepare a `.txt` or `.csv` party-list file (plain names or numbered lines like `1. name`), preview it with `insert_raw_list.py --dry-run`, insert it into `raw_candidate_lists`, run `run_pipeline.py`, resolve `review_queue.json` if created, then verify `election_candidates`.
- **Behavior:** starts from `raw_candidate_lists.processed = false`, resolves candidate identity, enriches missing factual fields, generates a one-sentence Hebrew role summary (`[name] כיהן כ[roles]`), geocodes cities, retries missing birth dates and Wikipedia URLs from Wikidata, supports repeated list updates, and leaves party stats/map data to be computed from `election_candidates` at page load.

## Polls Pipeline (live)

- **Script:** `Layer 1 - Gathering Data/Polls/run_polls_pipeline.py`
- **API wrapper:** `Layer 1 - Gathering Data/Polls/run_polls_pipeline_api.py` — used by `/elections/polls/edit` in dev
- **HTTP API:** `src/app/api/polls/[...path]/route.ts` (status, stages, sync-full)
- **Dev UI:** `/elections/polls/edit` — password-gated pipeline runner (`ELECTIONS_EDIT_SECRET` / `NEXT_PUBLIC_ELECTIONS_EDIT_SECRET`)
- **Schedule:** `.github/workflows/polls-pipeline.yml` — twice daily UTC
- **Source:** Wikipedia MediaWiki API (English opinion polling pages)
- **Frontend:** `/elections/polls` — last-5 averages, bloc bar, bloc trend
- **Docs:** [PollsPage.md](./PollsPage.md)

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
            ├─ aside.piplines-sidebar — next/link per pipeline
            └─ div.piplines-main — PipelineDocView for active pipeline (from useParams slug)
```

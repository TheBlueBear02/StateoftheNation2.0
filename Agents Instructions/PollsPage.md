# PollsPage — סקרי מנדטים

> See [ProjectOverview.md](./ProjectOverview.md), [DesignLanguage.md](./DesignLanguage.md), and [Database.md](./Database.md).

Frontend and pipeline module for Knesset-26 opinion poll seat projections sourced from Wikipedia.

## Routes

| Route | Component | Purpose |
|-------|-----------|---------|
| `/elections/polls` | `src/pages/ElectionsPollsPage.tsx` | Last-5 bar chart, bloc bar, bloc trend |
| `/elections/polls/edit` | `src/pages/ElectionsPollsEditPage.tsx` | Password-gated pipeline runner (dev) |

Register `/elections/polls/edit` **before** `/elections/polls` and `/elections/:partyId` in `src/main.tsx`.

The elections index at `/elections` links to polls from the hero.

## Pipeline

Directory: `Layer 1 - Gathering Data/Polls/`

| Script | Stage | Role |
|--------|-------|------|
| `run_polls_pipeline.py` | orchestrator | CLI entry point |
| `run_polls_pipeline_api.py` | API wrapper | JSON status/sync for `/elections/polls/edit` |
| `fetch_wikipedia.py` | 1 | MediaWiki API, revid cache |
| `parse_poll_tables.py` | 2 | wikitable → `raw_poll_rows` |
| `resolve_poll_parties.py` | 3 | `poll_party_aliases` lookup |
| `normalize_polls.py` | 4 | `polls` + `poll_results` |
| `compute_aggregates.py` | 5 | `last3` + `weighted` |
| `validate_polls.py` | 6 | hard gates + ops alerts |
| `seed_parties.py` | one-off | historical + polled_only parties |
| `seed_party_aliases.py` | one-off | English labels + lineage |

Schema: `schema_polls.sql` (apply manually in Supabase).

Scheduling: `.github/workflows/polls-pipeline.yml` — twice daily UTC.

## Dev Edit UI (`/elections/polls/edit`)

Password-gated with `VITE_ELECTIONS_EDIT_SECRET` (same as `/elections/edit`). Unlock stored in `sessionStorage` under `polls-edit-unlocked`.

Shows:
- Last UI pipeline run + last successful DB sync (`pipeline_sync_state`)
- Table counts (`polls`, `poll_results`, `raw_poll_rows`, `poll_aggregates`)
- Pending raw rows and `review_queue.json` size
- Per-page Wikipedia revid / last success
- Full sync button (**טען סקרים חדשים**) — incremental by default (main wiki page only; skips unchanged revids)
- Optional per-stage run, `--force`, and `--backfill` checkboxes

Requires `npm run dev`, `SUPABASE_SERVICE_KEY`, and `VITE_ELECTIONS_EDIT_SECRET`. Vite plugin: `vite-plugins/pollsEditApi.ts` → `/api/polls/*`.

## Frontend Files

| File | Role |
|------|------|
| `src/hooks/usePolls.ts` | Recent polls with joined results (includes party `bloc`) |
| `src/hooks/usePollAggregates.ts` | Weighted/last3 aggregates + trend series (used elsewhere; polls page uses client-side last-5) |
| `src/lib/pollChartData.ts` | Last-N average, per-party last-N trend, bloc totals, per-poll snapshots for charts |
| `src/lib/runPollsPipeline.ts` | Dev API client for status / sync / stage |
| `src/components/polls/LastPollsBarChart.tsx` | Vertical bar chart — average of last 5 polls |
| `src/components/polls/BlocDistributionBar.tsx` | Single horizontal stacked bar — coalition / unaligned / opposition |
| `src/components/polls/PartyStackedColumnChart.tsx` | 100% stacked columns per poll date + party legend (not currently shown on the page) |
| `src/components/polls/BlocTrendChart.tsx` | Horizontal stacked bars per poll date by bloc |
| `src/components/polls/PollsPipelinePanel.tsx` | Pipeline runner panel on edit page |
| `src/pages/ElectionsPollsPage.tsx` / `.css` | Polls page UI |
| `src/pages/ElectionsPollsEditPage.tsx` / `.css` | Password-gated pipeline edit UI |
| `src/content/pipelines/elections2026Polls.ts` | Pipeline docs content |
| `vite-plugins/pollsEditApi.ts` | Dev middleware for `/api/polls/*` |

## Page Layout (`/elections/polls`)

Vertical stack (RTL), matching the reference design:

1. **ממוצע N הסקרים האחרונים** — header row with title (start) and a dropdown (physical top-left / `margin-inline-start: auto`) to choose **3 / 5 / 7 / 10 / 15** latest polls (options capped by available regular polls; default **5**). Vertical bars colored by display bloc (`DISPLAY_BLOC_COLORS`: קואליציה blue, רע״ם green, חד״ש-תע״ל dark red, אופוזיציה red), seat count in white on each bar, party name below in a fixed-height label row. Under the chart: collapsible list (**closed by default**; click title to expand) of the N source polls (date, pollster, publisher, sample size, source link). Publisher labels strip Wikipedia footnotes via `cleanPollPublisher` (e.g. `Kan 11 [20]` → `Kan 11`).
2. **ממוצע החלוקה לגושים** — single horizontal bar (LTR direction): blue = קואליציה, green = רע״ם, red = חד״ש-תע״ל, light red = אופוזיציה (excluding רע״ם and חד״ש-תע״ל). Seat totals shown in each segment. חד״ש-תע״ל label stacks as two lines (`חד״ש` / `תע״ל`) so it fits narrow segments. Rendered in the **same section** as (1) — no horizontal rule between them.
3. **חלוקה לגושים לאורך זמן** — horizontal stacked bars for the **30 most recent** non-scenario polls whose seat projections **sum to 120** (**newest at top**) on a fixed **0–120** seat scale (so 50% = **60 מנדטים**). Incomplete polls (seat total ≠ 120) are hidden. Y-axis dates as `D.M` (e.g. `17.7`) with left margin so labels stay clear of the bars. All parties map into the four blocs (קואליציה / רע״ם / חד״ש-תע״ל / אופוזיציה); below-threshold parties are included in poll data with 0 seats. Sibling Wikipedia columns that resolve to the same party (e.g. RZP + Zionist Home) have seats **summed** in normalize. Hover tooltip shows fieldwork date, pollster, publisher, sample size, and bloc seats.
4. Wikipedia CC BY-SA 4.0 provenance footer.

Historical charts use individual poll results (not `poll_aggregates` snapshots). Scenario polls are excluded from averages and charts. No full poll metadata table on this page.

## Data Flow

1. Wikipedia MediaWiki `action=parse` → local `.cache/` HTML
2. Parser walks in-scope sections only: **Seat projections** + **Scenario polls**
3. Party labels resolved via time-scoped `poll_party_aliases` (never auto-created)
4. **Joint List group headers** on Wikipedia span Hadash–Ta'al / Balad sub-columns — parser uses sub-column names, not the group title (`הרשימה המשותפת`)
5. Aggregates recomputed for trailing 30 Jerusalem days
5. Frontend reads `polls`, `poll_results`, `poll_aggregates`, `party_lineage` via anon key

## Party Status Filter

All existing elections queries filter `election_parties.party_status = 'confirmed'` so historical and polled_only rows do not appear on `/elections`. Polls page reads all parties referenced in aggregates.

## Aggregation Notes

- **Header bar chart:** client-side mean of the N most recent non-scenario polls (`LAST_N_POLL_OPTIONS`: 3/5/7/10/15, default 5; user-selectable dropdown) with `fieldwork_end` on or before today (Jerusalem). If that filter would leave no rows (e.g. device clock behind the dataset), falls back to the latest regular polls. Average divides each party's seat total by the number of polls where that party appeared (not always N). Polls are deduped by logical identity (date + pollster + publisher + sample) so Wikipedia footnote renumbers do not double-count.
- **Bloc bar:** sums party averages from the last-N snapshot by `election_parties.bloc`
- **Historical charts:** one column/row per individual poll (`fieldwork_end`), seat share = seats ÷ 120; same identity dedupe as last-N
- Pipeline also computes **weighted** (14-day window) and **last3** in `poll_aggregates` — available via `usePollAggregates` but not shown on this page
- Scenario polls stored but excluded from averages and charts
- Seat averages are **not** forced to sum to 120 — documented on page and in pipeline docs
- House effects (`pollster_house_effects`) — schema exists; compute/UI deferred post-MVP
- **Natural key:** `parse_poll_tables` strips Wikipedia footnote markers (`[20]`) before hashing; regular seat tables share a stable section bucket. `normalize_polls` merges by identity and runs `dedupe_polls` after each normalize pass.

## Licensing

Wikipedia CC BY-SA 4.0 attribution on `/elections/polls` and pipeline docs page.

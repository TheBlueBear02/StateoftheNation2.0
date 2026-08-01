# PollsPage — סקרי מנדטים

> See [ProjectOverview.md](./ProjectOverview.md), [DesignLanguage.md](./DesignLanguage.md), and [Database.md](./Database.md).

Frontend and pipeline module for Knesset-26 opinion poll seat projections sourced from Wikipedia.

## Routes

| Route | Component | Purpose |
|-------|-----------|---------|
| `/elections/polls` | `src/views/ElectionsPollsPage.tsx` | Last-N bar chart, bloc bar, party trend lines, aggregate-history lines, bloc trend |
| `/elections/polls/edit` | `src/views/ElectionsPollsEditPage.tsx` | Password-gated pipeline runner (dev) |

Register `/elections/polls/edit` as a static App Router segment under `src/app/elections/polls/edit/` (alongside `/elections/polls`); views live in `src/views/…`.

The elections index at `/elections` links to polls and the lists game from the hero.

## Pipeline

Directory: `Layer 1 - Gathering Data/Polls/`

| Script | Stage | Role |
|--------|-------|------|
| `run_polls_pipeline.py` | orchestrator | CLI entry point |
| `run_polls_pipeline_api.py` | API wrapper | JSON status/sync for `/elections/polls/edit` |
| `fetch_wikipedia.py` | 1 | MediaWiki API, revid cache |
| `parse_poll_tables.py` | 2 | First Seat projections table → `raw_poll_rows` (incremental); all tables when `--backfill` |
| `resolve_poll_parties.py` | 3 | `poll_party_aliases` lookup |
| `normalize_polls.py` | 4 | `polls` + `poll_results` |
| `compute_aggregates.py` | 5 | `last3` + `weighted` |
| `validate_polls.py` | 6 | hard gates + ops alerts |
| (API stage 7) | 7 | `emit_polls_run_update` → homepage `site_updates` headline (editable in UI) |
| `seed_parties.py` | one-off | confirmed + historical + polled_only parties (ישר is confirmed; נועם and בית ציוני are polled_only). Matches by *normalized* `short_name` (quote/dash variants) so it never recreates ש״ס / ש"ס duplicates; merges any existing quote-variant dupes into the preferred row |
| `seed_party_aliases.py` | one-off | English labels + lineage |
| `seed_poll_publishers.sql` | one-off | Distinct `polls.publisher` → `poll_publishers` + `publisher_id` backfill |

Schema: `schema_polls.sql` (base polls DDL). `pollsters` / `people.wikidata_id` / numeric KPI values are live on Supabase.

Scheduling: `.github/workflows/polls-pipeline.yml` — daily at midnight Israel (`0 21 * * *` UTC; winter IST runs at 23:00 Israel). Needs `OPENAI_API_KEY` secret for homepage ticker emission (missing key skips emit). Review-queue alerts create a GitHub issue without a required label (`continue-on-error`). Validation: seat sum ±1 and ops alerts (staleness/volume) log warnings but exit 0 so scheduled runs stay green; harder data errors still fail and roll back that run’s aggregates.

After a successful non-error CLI run that inserted new polls, the orchestrator calls `emit_polls_run_update` (see [PiplinesPage.md](./PiplinesPage.md)) so the homepage news strip can link to `/elections/polls`. In the edit UI, that emit is **stage 7** (`יצירת עדכון`) instead of an invisible post-hook after stage 4.

## Dev Edit UI (`/elections/polls/edit`)

Password-gated with the shared pipeline secret (`NEXT_PUBLIC_PIPELINE_EDIT_SECRET` / `PIPELINE_EDIT_SECRET`, with fallbacks to elections/knesset edit secrets). Unlock stored in `sessionStorage` under `pipeline-unlocked` (shared with `/piplines` and other `/edit` pages).

Shows:
- Last UI pipeline run + last successful DB sync (`pipeline_sync_state`)
- Table counts (`polls`, `poll_results`, `raw_poll_rows`, `poll_aggregates`)
- Pending raw rows and `review_queue.json` size
- Per-page Wikipedia revid / last success
- Full sync button (**טען סקרים חדשים**) — runs stages 1–7 sequentially via `POST /api/polls/pipeline/stage` (incremental by default: main wiki page, **latest Seat projections table only**, insert new staging rows only). Active stage is highlighted with a live per-step timer plus total run time (`usePipelineRunProgress`). Stage 7 receives the sync start timestamp as `since` so it only considers polls inserted during that run
- Optional per-stage run, `--force` (re-fetch wiki), and `--backfill` (all seat + scenario tables on all four wiki pages; full validation). Standalone stage 7 uses the last `polls_run` ticker time (or a 48h lookback) when `since` is omitted
- **Site update editor** — after stage 7 creates a `site_updates` row, the panel shows the generated Hebrew headline in an editable textarea with word count and **שמור כותרת** (`POST /api/polls/site-update`)
- **Error / warning console** on the edit panel — shows stage diagnostics after each run (parse warnings, rejected `raw_poll_rows` with reason, validation errors). Fed by `diagnostics` / `recentRejected` from the polls pipeline API (`run_polls_pipeline_api.py`); rejected-row fetch uses `created_at` only (`raw_poll_rows` has no `updated_at`)

Requires `npm run dev` (or `ENABLE_PIPELINE_API`), `SUPABASE_SERVICE_KEY`, and `PIPELINE_EDIT_SECRET` / `NEXT_PUBLIC_PIPELINE_EDIT_SECRET` (or legacy elections/knesset secrets). Next.js route: `src/app/api/polls/[...path]/route.ts` → `/api/polls/*`.

## Frontend Files

| File | Role |
|------|------|
| `src/app/elections/polls/page.tsx` | Server fetch of a small poll window for last-5 average `ItemList` JSON-LD; charts still client-fetch via `usePolls(120)` |
| `src/lib/fetchPolls.ts` | Shared `fetchPolls(client, limit)` used by the Server Component and `usePolls` |
| `src/lib/supabaseServer.ts` | Anon server Supabase client for the App Router page |
| `src/hooks/usePolls.ts` | Thin hook over `fetchPolls`; accepts optional `initialPolls` and skips client refetch when set |
| `src/hooks/usePollAggregates.ts` | Weighted/last3 aggregates + daily trend series from `poll_aggregates` |
| `src/lib/pollChartData.ts` | Last-N average, per-party last-N trend, multi-party trend lines, bloc totals, per-poll snapshots for charts |
| `src/lib/runPollsPipeline.ts` | Dev API client for status / sync / stage / save site-update |
| `src/components/polls/LastPollsBarChart.tsx` | Vertical bar chart — average of last 5 polls (horizontal bars on mobile ≤720px) |
| `src/components/polls/BlocDistributionBar.tsx` | Single horizontal stacked bar — coalition / unaligned / opposition |
| `src/components/polls/PartyTrendChart.tsx` | Multi-party seat line chart for a publisher (random on load) |
| `src/components/polls/AggregateHistoryChart.tsx` | Daily weighted average lines from `poll_aggregates` (logo legend + party-color borders) |
| `src/components/polls/PartyStackedColumnChart.tsx` | 100% stacked columns per poll date + party legend (not currently shown on the page) |
| `src/components/polls/BlocTrendChart.tsx` | Horizontal stacked bars per poll date by bloc |
| `src/components/polls/PollsPipelinePanel.tsx` | Pipeline runner panel on edit page (stages 1–7, site-update editor, error/warning console) |
| `src/hooks/usePipelineRunProgress.ts` | Shared live total + per-step timers for pipeline panels |
| `src/views/ElectionsPollsPage.tsx` / `.css` | Polls page UI |
| `src/views/ElectionsPollsEditPage.tsx` / `.css` | Password-gated pipeline edit UI |
| `src/content/pipelines/elections2026Polls.ts` | Pipeline docs content |
| `src/app/api/polls/[...path]/route.ts` | Next.js App Router handlers for `/api/polls/*` (gated by `assertPipelineEnabled`) |
| `src/server/apiCommon.ts` | Shared pipeline API helpers (auth, Python spawn, JSON responses) |

## Page Layout (`/elections/polls`)

Vertical stack (RTL), matching the reference design:

Hero: shared `PageBreadcrumb` + page title **סקרי מנדטים לבחירות 2026** (no subtitle). The last-N bar chart and bloc distribution sit in the same hero block directly under the title (tight gap; no divider between title and charts).

1. **ממוצע N הסקרים האחרונים** — header row with title (start) and a dropdown (physical top-left / `margin-inline-start: auto`) to choose **3 / 5 / 7 / 10 / 15** latest polls (options capped by available regular polls; default **5**). On mobile (≤720px), the N dropdown sits centered below the title/logos. Under the title, a row of clickable channel logos from the N source polls (`poll_publishers.logo_url` when set), with hint text **לצפייה בסקר ספציפי לחצו על לוגו הערוץ** underneath the logos. In average mode all logos are full color; after selecting one poll, that logo stays colored and the others render grey (`grayscale` + reduced opacity). Clicking a logo filters sections (1) and (2) to that single poll’s seat bars and bloc distribution; click again to return to the average. Changing the N dropdown clears the selection. When a poll is selected, the bar-chart title reads **סקר {publisher_he} | {date}** with the date in smaller muted type. In average mode, the title reads **ממוצע N הסקרים האחרונים | {earliest} – {latest}** (same smaller date styling; single date when N=1 or all polls share the same fieldwork end). Vertical bars colored by display bloc (`DISPLAY_BLOC_COLORS`: קואליציה blue, רע״ם green, חד״ש-תע״ל dark red, אופוזיציה red) with a bottom→top darker gradient (`displayBlocBarGradientForParty`: darker `color-mix` toward black at 0%, fading into the base color by ~65% of bar height; bar color set via `--bar-color` CSS variable), seat count in white on each bar, party **`short_name`** (fallback to `name`) below in a fixed-height label row (desktop). Hovering a bar brightens it. **Clicking a bar navigates to `/elections/{partyId}`**. Displayed parties always have **≥ 4** seats and **sum to 120** (`finalizeDisplayedSeatAverages`: drop under-4, scale, largest-remainder integers). On mobile (≤720px), the chart switches to a **horizontal (sideways) bar layout**: party `short_name` labels on the left (LTR chart direction), bars grow right with a left→right darker gradient, seat count in white at the start of each bar, and a thin divider between labels and bars — no horizontal scroll. Publisher labels strip Wikipedia footnotes via `cleanPollPublisher` (e.g. `Kan 11 [20]` → `Kan 11`).
2. **ממוצע החלוקה לגושים** — single horizontal bar (LTR direction): blue = קואליציה, red = חד״ש-תע״ל, green = רע״ם, light red = אופוזיציה (excluding רע״ם and חד״ש-תע״ל). Segments use the same bottom→top darker gradient as the party bars (`displayBlocBarGradient`). Above the bar: color tags for **אופוזיציה**, **רע״ם**, **חד״ש-תע״ל**, and **קואליציה** (same set as the trend chart). A centered black **60 מנדטים** reference line marks the halfway point on the 0–120 seat scale; the label sits centered above that line (LTR positioning context on the bar wrap so RTL page direction does not offset it). When a source poll is selected via logo, totals reflect that poll instead of the last-N average and the title becomes **חלוקה לגושים** (no publisher/date suffix). Only rounded seat numbers are shown inside each segment. Rendered in the **same section** as (1) — no horizontal rule between them.
3. **מגמת מפלגות** — multi-party seat **line chart** for one publisher’s last **10** regular polls. On each page load a **random publisher** (from those with logos in the recent pool) is selected; logos stay available to switch channels (always one selected — no “all publishers” mode; hint **לבחירת ערוץ לחצו על הלוגו**). **Default view shows הליכוד, ישר, and ביחד** (`DEFAULT_PARTY_TREND_SHORT_NAMES`); legend chips let the user add/remove other parties (at least one must stay selected). Each chip is **logo-only** (party name on hover/`aria-label`); shows `election_parties.logo_url` when set, with fallback from other confirmed parties that normalize to the same `short_name` (e.g. ש״ס / ש"ס) or from linked `knesset_factions.logo_url`, otherwise a larger color swatch from `election_parties.color`. Selected chips use that party’s `color` as the button border. Selected parties draw colored lines (`election_parties.color`). Hover shows a vertical guide plus tooltip with fieldwork date, pollster, publisher, sample size, and visible parties’ seat counts for that poll. Time axis is chronological (oldest → newest, LTR plot). No last-N dropdown in this section.
4. **חלוקה לגושים לאורך זמן** — horizontal stacked bars for the **30 most recent** non-scenario polls whose seat projections **sum to 120** (**newest at top**) on a fixed **0–120** seat scale (so 50% = **60 מנדטים**). Incomplete polls (seat total ≠ 120) are hidden. SVG uses **equal left/right gutters** so the plot and **60 מנדטים** line stay page-centered (matching the centered legend); dates (`D.M`) and channel logos live in the left gutter, logo immediately beside each bar. Above the legend: unique clickable publisher logos from those 30 polls (`poll_publishers.logo_url` when set), with hint **לסינון לפי ערוץ לחצו על הלוגו**. Unfiltered: all logos full color; after selecting a publisher, that logo stays colored and the others render grey. Clicking a logo shows the **last 10 complete polls for that publisher** from the full loaded pool (not only those that fall inside the overall last 30); click again to return to the overall last 30. When `poll_publishers.logo_url` is set (via `polls.publisher_id` or matching `polls.publisher`), a small channel logo appears next to the date. Parties map into four blocs in the data (קואליציה / חד״ש-תע״ל / רע״ם / אופוזיציה); the centered legend and hover tooltip show **אופוזיציה**, **רע״ם**, **חד״ש-תע״ל**, and **קואליציה**. Below-threshold parties are included in poll data with 0 seats. Sibling Wikipedia columns that resolve to the same party (e.g. alternate spellings) have seats **summed** in normalize. **Zionist Home** / **Tropper** map to בית ציוני (Tropper/Hendel) — never to RZP / הציונות הדתית. Pre-rename **Reservists** / **Reserv.** columns stay on מילואימניקים, with a `party_lineage` rename event to בית ציוני on 2026-07-07. Hover tooltip shows fieldwork date, pollster, publisher, sample size, and bloc seats.
5. **מגמת ממוצע משוקלל** — line chart from `poll_aggregates` via `usePollAggregates` / `AggregateHistoryChart`, placed **last among charts** (above the provenance footer). Shows daily **weighted** seat averages for the trailing ~30 Jerusalem days (no method dropdown). Subtitle: rolling average over a 14-day window, newer polls weigh more (**ממוצע נע**). Party legend chips are **logo-only** like מגמת מפלגות, with each button bordered in that party’s `color` (swatch fallback when no logo). Defaults to הליכוד / ישר / ביחד when short names match. Empty state prompts running pipeline stage 5 if the table is empty. Lineage break dates split a party’s line into segments.
6. Wikipedia CC BY-SA 4.0 provenance footer.

Raw-poll historical charts use individual poll results. The aggregate-history chart uses `poll_aggregates` snapshots. Scenario polls are excluded from averages and charts. No full poll metadata table on this page.

## Data Flow

1. Wikipedia MediaWiki `action=parse` → local `.cache/` HTML
2. Parser walks in-scope sections: **Seat projections** (+ **Scenario polls** only with `--backfill`). Incremental default keeps **only the first Seat projections table** (newest polls); archived continuation tables and scenarios are skipped. Data rows whose fieldwork cell is a Wikipedia date range (`29–30 Jul`) are treated as poll rows (not header/event rows); `normalize_polls.parse_fieldwork` inherits month/year from the range end when the start token is day-only.
3. Party labels resolved via time-scoped `poll_party_aliases` (never auto-created)
4. **Joint List group headers** on Wikipedia span Hadash–Ta'al / Balad sub-columns — parser uses sub-column names, not the group title (`הרשימה המשותפת`)
5. Stage 2 inserts only rows whose `(natural_key, content_hash)` is new — does not reset already-processed staging rows to `pending`. Rows with no parseable party seat cells (Wikipedia event annotations) are skipped.
6. Aggregates recomputed for trailing 30 Jerusalem days
7. `/elections/polls` Server Component reads `polls` + `poll_results` (+ publishers/pollsters/parties) via anon key and hydrates the client view; aggregate-history chart still reads `poll_aggregates` / `party_lineage` client-side via `usePollAggregates`
8. Stage 6 validates recent regular polls (last 45 days) by default; `--backfill` validates full history

## Party Status Filter

All existing elections queries filter `election_parties.party_status = 'confirmed'` so historical and polled_only rows do not appear on `/elections`. Polls page reads all parties referenced in aggregates.

## Aggregation Notes

- **Header bar chart:** client-side mean of the N most recent non-scenario polls (`LAST_N_POLL_OPTIONS`: 3/5/7/10/15, default 5; user-selectable dropdown) with `fieldwork_end` on or before today (Jerusalem). If that filter would leave no rows (e.g. device clock behind the dataset), falls back to the latest regular polls. Each party’s seat total is divided by **N** (the size of the window); below-threshold / missing results count as **0 seats**. Parties with average **&lt; 4** seats are dropped, then remaining averages are scaled and allocated with largest-remainder so **integer seats sum to exactly 120**. Same finalize step applies when a single source poll is selected. Polls are deduped by logical identity (date + pollster + publisher + sample) so Wikipedia footnote renumbers do not double-count.
- **Bloc bar:** sums party averages from the last-N snapshot by `election_parties.bloc`
- **Party trend lines:** last 10 polls for a randomly chosen publisher on load (`selectRecentRegularPollsForPublisher`); user can switch publisher via logos; no last-N dropdown
- **Aggregate history chart:** daily `weighted` series from `poll_aggregates` (`AggregateHistoryChart`) with logo legend chips bordered by party color; for evaluating whether DB average history is useful
- **Historical charts:** one column/row per individual poll (`fieldwork_end`), seat share = seats ÷ 120; same identity dedupe as last-N
- Pipeline also computes **weighted** (14-day window) and **last3** in `poll_aggregates` — the polls page aggregate chart shows **weighted** only
- Scenario polls stored but excluded from averages and charts
- Seat averages on the header chart are forced to **integer seats summing to 120** after dropping parties under 4; other charts may still show raw poll seats
- House effects (`pollster_house_effects`) — schema exists; compute/UI deferred post-MVP
- **Natural key:** `parse_poll_tables` strips Wikipedia footnote markers (`[20]`) before hashing; regular seat tables share a stable section bucket. `normalize_polls` merges by identity and runs `dedupe_polls` after each normalize pass.
- **Party alias seeding:** `seed_party_aliases.py` maps Wikipedia English labels to `election_parties` via `short_name`. Matching uses `normalize_party_short_name` (and Hadash/Ra'am/Shas/Balad fallbacks) so elections-import spellings (`ש"ס`, `רע"ם`, `חד"ש תע"ל`, `בל"ד`) and older gershayim seed rows resolve to the same party. Missing aliases leave polls short of 120 seats and hide them from the bloc-trend chart (which only shows complete polls).
- **Party seed / duplicate guard:** `seed_parties.py` must not invent parallel rows for Hebrew quote variants. It updates existing parties by normalized `short_name`, preserves elections-import `name`/`short_name`, and merges any leftover dupes (reassigning `poll_results` / `poll_aggregates` / aliases) before inserting.
## Licensing

Wikipedia CC BY-SA 4.0 attribution on `/elections/polls` and pipeline docs page.

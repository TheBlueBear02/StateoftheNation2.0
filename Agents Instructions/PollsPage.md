# PollsPage — סקרי מנדטים

> See [ProjectOverview.md](./ProjectOverview.md), [DesignLanguage.md](./DesignLanguage.md), and [Database.md](./Database.md).

Frontend and pipeline module for Knesset-26 opinion poll seat projections sourced from Wikipedia.

## Routes

| Route | Component | Purpose |
|-------|-----------|---------|
| `/elections/polls` | `src/views/ElectionsPollsPage.tsx` | Last-N bar chart, bloc bar, party trend lines, bloc trend |
| `/elections/polls/edit` | `src/views/ElectionsPollsEditPage.tsx` | Password-gated pipeline runner (dev) |

Register `/elections/polls/edit` as a static App Router segment under `src/app/elections/polls/edit/` (alongside `/elections/polls`); views live in `src/views/…`.

The elections index at `/elections` links to polls from the hero.

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
| `seed_parties.py` | one-off | confirmed + historical + polled_only parties (ישר is confirmed; בית ציוני is polled_only) |
| `seed_party_aliases.py` | one-off | English labels + lineage |
| `seed_poll_publishers.sql` | one-off | Distinct `polls.publisher` → `poll_publishers` + `publisher_id` backfill |

Schema: `schema_polls.sql` (apply manually in Supabase).

Scheduling: `.github/workflows/polls-pipeline.yml` — twice daily UTC.

## Dev Edit UI (`/elections/polls/edit`)

Password-gated with `NEXT_PUBLIC_ELECTIONS_EDIT_SECRET` / `ELECTIONS_EDIT_SECRET` (same as `/elections/edit`; legacy `VITE_ELECTIONS_EDIT_SECRET` still read). Unlock stored in `sessionStorage` under `polls-edit-unlocked`.

Shows:
- Last UI pipeline run + last successful DB sync (`pipeline_sync_state`)
- Table counts (`polls`, `poll_results`, `raw_poll_rows`, `poll_aggregates`)
- Pending raw rows and `review_queue.json` size
- Per-page Wikipedia revid / last success
- Full sync button (**טען סקרים חדשים**) — incremental by default: main wiki page, **latest Seat projections table only**, insert new staging rows only (unchanged hashes skipped)
- Optional per-stage run, `--force` (re-fetch wiki), and `--backfill` (all seat + scenario tables on all four wiki pages; full validation)

Requires `npm run dev` (or `ENABLE_PIPELINE_API`), `SUPABASE_SERVICE_KEY`, and `ELECTIONS_EDIT_SECRET` / `NEXT_PUBLIC_ELECTIONS_EDIT_SECRET`. Next.js route: `src/app/api/polls/[...path]/route.ts` → `/api/polls/*`.

## Frontend Files

| File | Role |
|------|------|
| `src/hooks/usePolls.ts` | Recent polls with joined results (includes party `bloc`, logo/color with confirmed-party + faction branding fallback) |
| `src/hooks/usePollAggregates.ts` | Weighted/last3 aggregates + trend series (used elsewhere; polls page uses client-side last-5) |
| `src/lib/pollChartData.ts` | Last-N average, per-party last-N trend, multi-party trend lines, bloc totals, per-poll snapshots for charts |
| `src/lib/runPollsPipeline.ts` | Dev API client for status / sync / stage |
| `src/components/polls/LastPollsBarChart.tsx` | Vertical bar chart — average of last 5 polls |
| `src/components/polls/BlocDistributionBar.tsx` | Single horizontal stacked bar — coalition / unaligned / opposition |
| `src/components/polls/PartyTrendChart.tsx` | Multi-party seat line chart for a publisher (random on load) |
| `src/components/polls/PartyStackedColumnChart.tsx` | 100% stacked columns per poll date + party legend (not currently shown on the page) |
| `src/components/polls/BlocTrendChart.tsx` | Horizontal stacked bars per poll date by bloc |
| `src/components/polls/PollsPipelinePanel.tsx` | Pipeline runner panel on edit page |
| `src/views/ElectionsPollsPage.tsx` / `.css` | Polls page UI |
| `src/views/ElectionsPollsEditPage.tsx` / `.css` | Password-gated pipeline edit UI |
| `src/content/pipelines/elections2026Polls.ts` | Pipeline docs content |
| `src/app/api/polls/[...path]/route.ts` | Next.js App Router handlers for `/api/polls/*` (gated by `assertPipelineEnabled`) |
| `src/server/apiCommon.ts` | Shared pipeline API helpers (auth, Python spawn, JSON responses) |

## Page Layout (`/elections/polls`)

Vertical stack (RTL), matching the reference design:

Hero: shared `PageBreadcrumb` + page title **סקרי מנדטים לבחירות 2026** (no subtitle). The last-N bar chart and bloc distribution sit in the same hero block directly under the title (tight gap; no divider between title and charts).

1. **ממוצע N הסקרים האחרונים** — header row with title (start) and a dropdown (physical top-left / `margin-inline-start: auto`) to choose **3 / 5 / 7 / 10 / 15** latest polls (options capped by available regular polls; default **5**). Under the title, a row of clickable channel logos from the N source polls (`poll_publishers.logo_url` when set), with hint text **לצפייה בסקר ספציפי לחצו על לוגו הערוץ** underneath the logos. In average mode all logos are full color; after selecting one poll, that logo stays colored and the others render grey (`grayscale` + reduced opacity). Clicking a logo filters sections (1) and (2) to that single poll’s seat bars and bloc distribution; click again to return to the average. Changing the N dropdown clears the selection. When a poll is selected, the bar-chart title reads **סקר {publisher_he} | {date}** with the date in smaller muted type. In average mode, the title reads **ממוצע N הסקרים האחרונים | {earliest} – {latest}** (same smaller date styling; single date when N=1 or all polls share the same fieldwork end). Vertical bars colored by display bloc (`DISPLAY_BLOC_COLORS`: קואליציה blue, רע״ם green, חד״ש-תע״ל dark red, אופוזיציה red) with a bottom→top darker gradient (`displayBlocBarGradientForParty`: darker `color-mix` toward black at 0%, fading into the base color by ~65% of bar height), seat count in white on each bar, party name below in a fixed-height label row (desktop). Hovering a bar brightens it. **Clicking a bar navigates to `/elections/{partyId}`**. Bar height is based on **rounded** seat averages (same as the label), so parties showing the same seat count render at the same height even when raw averages differ slightly (e.g. 4.6 vs 5.2). On mobile (≤720px), party labels use `short_name` when available, render smaller in vertical `writing-mode`, and the chart scrolls horizontally when needed. Publisher labels strip Wikipedia footnotes via `cleanPollPublisher` (e.g. `Kan 11 [20]` → `Kan 11`).
2. **ממוצע החלוקה לגושים** — single horizontal bar (LTR direction): blue = קואליציה, red = חד״ש-תע״ל, green = רע״ם, light red = אופוזיציה (excluding רע״ם and חד״ש-תע״ל). Segments use the same bottom→top darker gradient as the party bars (`displayBlocBarGradient`). Above the bar: color tags for **אופוזיציה**, **רע״ם**, **חד״ש-תע״ל**, and **קואליציה** (same set as the trend chart). A centered black **60 מנדטים** reference line marks the halfway point on the 0–120 seat scale. When a source poll is selected via logo, totals reflect that poll instead of the last-N average and the title becomes **חלוקה לגושים** (no publisher/date suffix). Only rounded seat numbers are shown inside each segment. Rendered in the **same section** as (1) — no horizontal rule between them.
3. **מגמת מפלגות** — multi-party seat **line chart** for one publisher’s last **10** regular polls. On each page load a **random publisher** (from those with logos in the recent pool) is selected; logos stay available to switch channels (always one selected — no “all publishers” mode; hint **לבחירת ערוץ לחצו על הלוגו**). **Default view shows only the largest party** in that publisher window; legend chips let the user add/remove other parties (at least one must stay selected). Each chip is **logo-only** (party name on hover/`aria-label`); shows `election_parties.logo_url` when set, with fallback from other confirmed parties that normalize to the same `short_name` (e.g. ש״ס / ש"ס) or from linked `knesset_factions.logo_url`, otherwise a larger color swatch from `election_parties.color`. Selected parties draw colored lines (`election_parties.color`). Hover shows a vertical guide plus tooltip with fieldwork date, pollster, publisher, sample size, and visible parties’ seat counts for that poll. Time axis is chronological (oldest → newest, LTR plot). No last-N dropdown in this section.
4. **חלוקה לגושים לאורך זמן** — horizontal stacked bars for the **30 most recent** non-scenario polls whose seat projections **sum to 120** (**newest at top**) on a fixed **0–120** seat scale (so 50% = **60 מנדטים**). Incomplete polls (seat total ≠ 120) are hidden. SVG uses **equal left/right gutters** so the plot and **60 מנדטים** line stay page-centered (matching the centered legend); dates (`D.M`) and channel logos live in the left gutter, logo immediately beside each bar. Above the legend: unique clickable publisher logos from those 30 polls (`poll_publishers.logo_url` when set), with hint **לסינון לפי ערוץ לחצו על הלוגו**. Unfiltered: all logos full color; after selecting a publisher, that logo stays colored and the others render grey. Clicking a logo shows the **last 10 complete polls for that publisher** from the full loaded pool (not only those that fall inside the overall last 30); click again to return to the overall last 30. When `poll_publishers.logo_url` is set (via `polls.publisher_id` or matching `polls.publisher`), a small channel logo appears next to the date. Parties map into four blocs in the data (קואליציה / חד״ש-תע״ל / רע״ם / אופוזיציה); the centered legend and hover tooltip show **אופוזיציה**, **רע״ם**, **חד״ש-תע״ל**, and **קואליציה**. Below-threshold parties are included in poll data with 0 seats. Sibling Wikipedia columns that resolve to the same party (e.g. alternate spellings) have seats **summed** in normalize. **Zionist Home** / **Tropper** map to בית ציוני (Tropper/Hendel) — never to RZP / הציונות הדתית. Pre-rename **Reservists** / **Reserv.** columns stay on מילואימניקים, with a `party_lineage` rename event to בית ציוני on 2026-07-07. Hover tooltip shows fieldwork date, pollster, publisher, sample size, and bloc seats.
5. Wikipedia CC BY-SA 4.0 provenance footer.

Historical charts use individual poll results (not `poll_aggregates` snapshots). Scenario polls are excluded from averages and charts. No full poll metadata table on this page.

## Data Flow

1. Wikipedia MediaWiki `action=parse` → local `.cache/` HTML
2. Parser walks in-scope sections: **Seat projections** (+ **Scenario polls** only with `--backfill`). Incremental default keeps **only the first Seat projections table** (newest polls); archived continuation tables and scenarios are skipped.
3. Party labels resolved via time-scoped `poll_party_aliases` (never auto-created)
4. **Joint List group headers** on Wikipedia span Hadash–Ta'al / Balad sub-columns — parser uses sub-column names, not the group title (`הרשימה המשותפת`)
5. Stage 2 inserts only rows whose `(natural_key, content_hash)` is new — does not reset already-processed staging rows to `pending`
6. Aggregates recomputed for trailing 30 Jerusalem days
7. Frontend reads `polls`, `poll_results`, `poll_aggregates`, `party_lineage` via anon key
8. Stage 6 validates recent regular polls (last 45 days) by default; `--backfill` validates full history

## Party Status Filter

All existing elections queries filter `election_parties.party_status = 'confirmed'` so historical and polled_only rows do not appear on `/elections`. Polls page reads all parties referenced in aggregates.

## Aggregation Notes

- **Header bar chart:** client-side mean of the N most recent non-scenario polls (`LAST_N_POLL_OPTIONS`: 3/5/7/10/15, default 5; user-selectable dropdown) with `fieldwork_end` on or before today (Jerusalem). If that filter would leave no rows (e.g. device clock behind the dataset), falls back to the latest regular polls. Average divides each party's seat total by the number of polls where that party appeared (not always N). Polls are deduped by logical identity (date + pollster + publisher + sample) so Wikipedia footnote renumbers do not double-count.
- **Bloc bar:** sums party averages from the last-N snapshot by `election_parties.bloc`
- **Party trend lines:** last 10 polls for a randomly chosen publisher on load (`selectRecentRegularPollsForPublisher`); user can switch publisher via logos; no last-N dropdown
- **Historical charts:** one column/row per individual poll (`fieldwork_end`), seat share = seats ÷ 120; same identity dedupe as last-N
- Pipeline also computes **weighted** (14-day window) and **last3** in `poll_aggregates` — available via `usePollAggregates` but not shown on this page
- Scenario polls stored but excluded from averages and charts
- Seat averages are **not** forced to sum to 120 — documented on page and in pipeline docs
- House effects (`pollster_house_effects`) — schema exists; compute/UI deferred post-MVP
- **Natural key:** `parse_poll_tables` strips Wikipedia footnote markers (`[20]`) before hashing; regular seat tables share a stable section bucket. `normalize_polls` merges by identity and runs `dedupe_polls` after each normalize pass.
- **Party alias seeding:** `seed_party_aliases.py` maps Wikipedia English labels to `election_parties` via `short_name`. When the elections list import uses a different spelling (e.g. `חד"ש תע"ל` vs seed `חד״ש-תע״ל`), `_find_party_id` falls back to fuzzy Hebrew matching so Hadash–Ta'al / Ra'am aliases still resolve. Missing aliases leave polls short of 120 seats and hide them from the bloc-trend chart (which only shows complete polls).

## Licensing

Wikipedia CC BY-SA 4.0 attribution on `/elections/polls` and pipeline docs page.

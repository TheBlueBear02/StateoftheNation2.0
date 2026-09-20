# GovernmentDashboardPage

> See [ProjectOverview.md](./ProjectOverview.md) for repo structure and [Database.md](./Database.md) for `indexes` / `index_data`.

Office KPI/policy dashboard ported from the old Flask `/offices` page. Shows four curated ministries as a quadrant of bubbles; selecting an office opens an **inline detail panel** (not modals) with a scrollable icon-circle strip of indexes, an SVG trend chart, and a ministers eras bar under the chart. No RSS news feed.

Route: `/government/dashboard`  
Shareable chart deep links: `/government/dashboard?office=<officeId>&index=<indexId>` (updates as you switch office/index; **העתק קישור** copies the absolute URL).

## Page Structure

```
┌─────────────────────────────────────────────────────────┐
│  Header (shared SiteHeader)                             │
├─────────────────────────────────────────────────────────┤
│  Breadcrumb: הממשלה / דשבורד מדדים                       │
│  Title + legend (מדד / מדיניות / התראה)                 │
│  Layout (stacked, full width):                          │
│    ├─ Detail panel (when office selected, 100% width)   │
│    │     ├─ Office switcher (full width, ‹ / ›)         │
│    │     ├─ Scrollable icon-circle strip (indexes)      │
│    │     ├─ Large SVG trend chart (primary focus)       │
│    │     └─ Ministers eras bar (aligned to chart range) │
│    └─ Office picker (compact 4-across when open)        │
│          each: KPI/policy bubbles + minister portrait   │
├─────────────────────────────────────────────────────────┤
│  Footer (shared SiteFooter)                             │
└─────────────────────────────────────────────────────────┘
```

## Files

| File | Role |
|------|------|
| `src/app/government/dashboard/page.tsx` | Metadata + JSON-LD + view |
| `src/views/OfficeDashboardPage.tsx` | Page shell, quadrant, detail panel |
| `src/views/OfficeDashboardPage.css` | Layout, bubbles, index strip, panel |
| `src/components/government/IndexTrendChart.tsx` | SVG line/bar/pie chart; exports `CHART_WIDTH` / `CHART_MARGIN` |
| `src/components/government/IndexTrendChart.css` | Chart styles |
| `src/components/government/OfficeErasBar.tsx` | Ministers eras bar under the chart |
| `src/components/government/OfficeErasBar.css` | Eras bar styles |
| `src/hooks/useOfficeDashboard.ts` | Client fetch wrapper |
| `src/lib/fetchOfficeDashboard.ts` | Supabase queries + shaping + icon URL resolve + `ministerHistory` |
| `src/lib/officeIndexIconMap.ts` | Name→icon fallback map from source DB |
| `public/images/offices/` | Index icon SVGs/PNGs |
| `Layer 1 - Gathering Data/knesset/seed_office_dashboard.py` | Seed from old sn.db |
| `Layer 1 - Gathering Data/knesset/office_dashboard_source.db` | Source SQLite copy |
| `Layer 1 - Gathering Data/schema_office_dashboard.sql` | Anon RLS + unique `(index_id, recorded_at)` |

## Data Layer

### Tables

- `offices` — `is_shown=true` for the four dashboard ministries; curated `info`
- `indexes` — KPI (`is_kpi`) / policy metrics per office; `alert`, `chart_type`, `source`
- `index_data` — time series (`label`, `value`, `recorded_at`)
- `minister_appointments` + `people` — current minister portrait for the active government; full history across governments for the eras bar
- `knesset_memberships` + `knesset_factions` — party/faction name + color per minister term
- `governments` — active government for appointment snapshot

### Display order

Client-side via `OFFICE_DASHBOARD_DISPLAY_ORDER` in `fetchOfficeDashboard.ts` (name substring match): תחבורה → ביטחון לאומי → אוצר → חינוך (matches old desired order `[3,2,5,4]`). Display titles prefer `offices.name` over short `knesset_category_name` labels.

### Queries

1. `offices` where `is_shown=true`
2. `indexes` for those office ids where `is_shown=true`, ordered `is_kpi desc`
3. `index_data` for those index ids, ordered `recorded_at` — **paged** past PostgREST’s ~1000-row default (there are ~1300 points across shown offices; without paging the newest Ben Gvir–era points were truncated).
4. Active `governments` + `minister_appointments` joined to `people`/`offices` for minister photos. Matching prefers exact `office_id`, then falls back by portfolio name (Knesset OData keeps many duplicate office rows; dashboard indexes and current appointments often sit on different ids).
5. All `offices` (id/name) grouped by portfolio needle (+ aliases) → `minister_appointments` across governments for those ids → `knesset_memberships`/`knesset_factions` for faction colors. Built into `ministerHistory` per office (primary ministers only; consecutive same-person terms merged). Party labels prefer `short_name`, else compress Knesset list titles (`הליכוד - …` / `הליכוד בהנהגת …` → `הליכוד`). Memberships with a null `faction_id` (common on current terms) are skipped; resolution falls back to the latest membership that still has a party name. **ביטחון לאומי** aliases: `ביטחון הפנים` / `ביטחון פנים` / `בטחון הפנים` / `בטחון פנים` / `משטרה` so Public Security and National Security ministers render as one chronological eras strip. Era segment colors are keyed by party name (old-site palette + unify within the bar) so the same party keeps one color across different ministers / faction_ids.

Percent change on cards = latest vs previous data point (not minister-term averages from the old site).

## UI Specs

- Design language: flat white, square corners, blue accents, RTL (`DesignLanguage.md`).
- Breadcrumb required: `הממשלה` → `/government` / דשבורד מדדים.
- Bubbles: larger circles (40–56px) with per-index icons from `/images/offices/…` (bag fallback); blue = KPI, grey = policy, red = alert; minister avatar centered in each cluster.
- **No `<dialog>` modals** — detail is an inline full-width panel below the office picker (no bordered panel/chart box; chart is 100% width).
- Charts are the primary content: full width of the page `.container` content area, SVG aspect 960×460.
- Office switcher above the index strip/chart: full-width current office row with left/right buttons (no border); index circles centered in a scrollable strip. Only the top office box slides when switching (`prefers-reduced-motion` disables it); index circles and chart update without that animation.
- Charts are hand-rolled SVG (no Chart.js); supports `line`, `bar`, `pie`.
- **Deep links / share:** selection is mirrored to `?office=` + `?index=` (numeric ids). Opening a shared URL restores that office and chart. Chart header has **העתק קישור** next to מקור.
- **Eras bar** just under the chart x-axis with a small ~8px gap; chart + eras use the full `.container` content width. Extra gap (~40–64px) before the bottom office boxes. Width spans the first bar’s left edge → last bar’s right edge. Aligned to the selected index's date range. National Security also pulls historical `ביטחון הפנים` / `משטרה` appointments (ministry renames). For year-only series (labels `YYYY`), domain end is Dec 31 of the last year (old site `YYYY-12`) so late-year starts like בן גביר (29.12.2022) still cover 2023–2024 points. Short overlaps get a minimum segment width; if nothing overlaps the chart domain, falls back to the ministers' own timeline. Segments colored by **party name** (stable palette; same party = same color for every minister in the bar); photo only when the segment fits a full circle (≥~9%), centered when name/party are hidden (≥~9% and <~18%), photo+name+party when wide (≥~18%); missing photos use `/images/offices/minister_placeholder.svg`. Hover/focus tooltip overlays just above the eras. LTR time axis (oldest left).
- Charts: Y-axis left gutter is sized from the longest tick label (not a fixed wide pad) so the plot uses leftover horizontal space; chart SVG is forced `dir=ltr` so Y labels with `textAnchor=end` stay in the left gutter under page RTL; hover tooltip is anchored above the active bar/point.
- Homepage teaser: `SHOW_GOVERNMENT_DASHBOARD = true` in `App.tsx`, links to `/government/dashboard`.

## Seeding

```bash
python "Layer 1 - Gathering Data/knesset/seed_office_dashboard.py"
# optional: --dry-run
```

Requires `SUPABASE_URL` + `SUPABASE_SERVICE_KEY`. Idempotent upserts. If anon SELECT fails, apply `schema_office_dashboard.sql` in the Supabase SQL Editor.

## Verification

```bash
npm run lint
npm run build
npm run dev   # visit /government/dashboard and /
```

Ensure `NEXT_PUBLIC_SUPABASE_ANON_KEY` is set.

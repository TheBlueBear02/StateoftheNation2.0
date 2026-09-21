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
- Bubbles: larger circles (40–56px) with per-index icons from `/images/offices/…` (bag fallback); blue = KPI, grey = policy, red = alert; minister avatar centered in each cluster (right-aligned on mobile). Office cards split visually: a short tinted circles zone (~140px / ~128px when compact) ends just under the minister portrait and clips outer KPI/policy circles; office title / minister / counts sit on a white meta block below (selected/hover tint applies only to the circles zone, not the text). **Loading:** skeleton mirrors the top detail panel — office switcher (photo + office name / minister / blurb text bars), index-circle strip, chart title/info + chart block + eras bar — not the bottom office cards.
- **No `<dialog>` modals** — detail is an inline full-width panel below the office picker (no bordered panel/chart box; chart is 100% width).
- Charts are the primary content: full width of the page `.container` content area. Desktop SVG aspect is 960×460; under 960px the chart uses a taller 960×560 viewBox so chart+eras still fit a phone screen.
- **Responsive chart (`uiScale`):** `readChartLayoutWidth()` prefers the min of `innerWidth` / `clientWidth` / `visualViewport`, and when Chrome DevTools device mode leaves `screen.width` at the phone size after a spurious ~800px `innerWidth` jump, it keeps the phone width. Viewport width state initializes to the desktop breakpoint and only updates after mount (avoids SSR hydration mismatch on `office-dashboard-page--mobile`). `chartUiScaleForWidth` targets ~14px labels under 960px (capped at 2.35). Y-gutter grows at half the font scale so the plot stays wide enough. Dev console logs `[office-dashboard] layout: MOBILE|DESKTOP`. Page gets `office-dashboard-page--mobile` with compact chrome: hidden office blurb, smaller switcher, **1-col office cards at 100% width** (`minmax(0,1fr)` + `overflow:hidden`), minister portrait right-aligned, **index circles wrap to a second row** (sliding full-height marker hidden; active chip uses a ring), chart share/source actions on the **physical left** of the title row, clipped page overflow.
- **Touch / tap:** chart bars, line dots (with enlarged transparent hit targets), and pie slices toggle a value tooltip on tap; tapping empty chart area clears it. Eras segments also toggle the minister tooltip on tap so narrow color-only segments stay explorable.
- Office switcher above the index strip/chart: full-width current office row with left/right buttons (no border); index circles centered in a scrollable strip with top/bottom rules. Active index is marked by a filled grey bar at full strip height (edge to edge between the borders) that slides horizontally when selection changes (`prefers-reduced-motion` disables the slide). Only the top office box slides when switching offices; index circles and chart update without that office animation. Chart header actions (`dir=ltr`) keep the **share** control as the physical-left button, with **מקור** to its right, on both desktop and mobile.
- Charts are hand-rolled SVG (no Chart.js); supports `line` (with light-blue area under the series), `bar`, `pie`.
- **Deep links / share:** selection is mirrored to `?office=` + `?index=` (numeric ids). Opening a shared URL restores that office and chart. Chart header has a **share icon** that exports a PNG of title + description + chart + eras (`exportOfficeChartImage`: site logo top-left, index circle icon top-right of the titles, larger title/description, extra top margin, locked SVG width from the live `viewBox` so taller mobile charts export without distortion, inlined paint, minister photos; action controls and tooltips are excluded). Capture always prefers an offscreen `.office-dashboard__chart-block--export` shell rendered at **desktop** proportions (`uiScale=1`, `tall=false`, fixed **960px** width / 960×460 viewBox + desktop eras sizing) so mobile shares match PC layout. Delivery uses shared `sharePngImage` (same as dream-government poster): **Android / Samsung / mobile** prefer the native Web Share sheet (skip unreliable image clipboard); **iOS / desktop** use Safari-safe `ClipboardItem(Promise)` clipboard write; fallback opens the image tab / `<a download>`. Mobile share `text` is the index description (when present), then `מאתר מצב האומה`, then the absolute chart deep link (`/government/dashboard?office=&index=`) — no office name / “מדדי משרדי הממשלה”.
- **Eras bar** (~62px tall desktop / ~52px mobile) just under the chart x-axis with a small ~8px gap; chart + eras use the full `.container` content width. Extra gap (~40–64px) before the bottom office boxes. Segment left/width are absolute % of the same chart viewBox width as the SVG bars (shared Y-gutter scaled by `uiScale` + bar geometry). Hovering or tapping an era paints a low-opacity vertical band on the chart in that era’s party color for the term’s start→end. Year-only bar charts map each date through that year’s bar (Jan 1 → left edge, mid-year → center, Dec 31 → right edge) so `05.2015` sits mid-2015 bar; domain still clips Jan 1 first year → Dec 31 last year. National Security also pulls historical `ביטחון הפנים` / `משטרה` appointments (ministry renames). Short overlaps get a minimum segment width; if nothing overlaps the chart domain, falls back to the ministers' own timeline. Segments colored by **party name** (stable palette; same party = same color for every minister in the bar); **photos only when the segment is wide enough in CSS px for a perfect circle** (photo diameter + padding — ~38px on mobile / ~50px on desktop); if too narrow, hide the image entirely (color bar only — never squeeze into an ellipse). Name/party when wide (≥~14% chart width); missing photos use `/images/offices/minister_placeholder.svg`. Under each minister-switch border (start of each era after the series left edge), a compact `MM.YYYY` tick; labels closer than ~7% of chart width are dropped to avoid overlap. Hover/focus/tap tooltip overlays just above the eras. LTR time axis (oldest left).
- Charts: Y-axis left gutter is sized from the longest tick label (not a fixed wide pad) and scaled softly by `uiScale` so the plot stays usable; on mobile the bottom gutter also grows with `uiScale` so x-axis labels sit below the bars instead of overlapping them. Chart SVG is forced `dir=ltr` so Y labels with `textAnchor=end` stay in the left gutter under page RTL; hover/tap tooltip is anchored above the active bar/point and wraps with a max-width on narrow screens.
- Homepage teaser: `SHOW_GOVERNMENT_DASHBOARD = true` in `App.tsx`, links to `/government/dashboard`; media is the static PNG `/government-offices-homepage.png` (no live fetch on the homepage).

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

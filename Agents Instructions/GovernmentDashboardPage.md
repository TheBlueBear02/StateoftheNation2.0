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
│  Layout (stacked, full width):                          │
│    ├─ Detail panel (when office selected, 100% width)   │
│    │     ├─ Office switcher (office h1; subtitle + legend row, ‹ / ›) │
│    │     ├─ Scrollable icon-circle strip (indexes)      │
│    │     ├─ Large SVG trend chart (primary focus)       │
│    │     ├─ Ministers eras bar (click to select)        │
│    │     └─ Selected-era detail (avg · Δ · name/party)  │
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
- `indexes` — KPI (`is_kpi`) / policy metrics per office; `alert`, `higher_is_better`, `chart_type`, `source`
- `index_data` — time series (`label`, `value`, `recorded_at`)
- `minister_appointments` + `people` — current minister portrait for the active government (plus `partyName` from Knesset membership); full history across governments for the eras bar
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
- Breadcrumb required: `הממשלה` → `/government` / דשבורד מדדים. Top chrome is compact: small main `padding-block` and inner `gap` so the breadcrumb sits close under the site header and above the office title switcher.
- Bubbles: larger circles (40–56px) with per-index icons from `/images/offices/…` (**white** glyph on blue/red circles; `white_bag.png` fallback); blue = KPI and policy, red = alert; minister avatar centered in each cluster (right-aligned on mobile). Office cards split visually: a short tinted circles zone (~140px / ~128px when compact) ends just under the minister portrait and clips outer KPI/policy circles; office title / minister / counts sit on a white meta block below (selected/hover tint applies only to the circles zone, not the text). **Loading:** skeleton mirrors the top detail panel — office switcher (office name / minister text bars), index-circle strip, chart title/info + chart block + eras bar — not the bottom office cards.
- **No `<dialog>` modals** — detail is an inline full-width panel below the office picker (no bordered panel/chart box; chart is 100% width).
- Charts are the primary content: full width of the page `.container` content area. Desktop SVG aspect is 960×400; under 960px the chart uses a taller 960×500 viewBox so chart+eras still fit a phone screen.
- **Responsive chart (`uiScale`):** `readChartLayoutWidth()` prefers the min of `innerWidth` / `clientWidth` / `visualViewport`, and when Chrome DevTools device mode leaves `screen.width` at the phone size after a spurious ~800px `innerWidth` jump, it keeps the phone width. Viewport width state initializes to the desktop breakpoint and only updates after mount (avoids SSR hydration mismatch on `office-dashboard-page--mobile`). `chartUiScaleForWidth` targets ~14px labels under 960px (capped at 2.35). Y-gutter grows at half the font scale so the plot stays wide enough. Dev console logs `[office-dashboard] layout: MOBILE|DESKTOP`. Page gets `office-dashboard-page--mobile` with compact chrome: smaller switcher, **1-col office cards at 100% width** (`minmax(0,1fr)` + `overflow:hidden`), minister portrait right-aligned, **index circles stay in one horizontally scrollable row** (sliding full-height marker kept), chart share/source actions on the **physical left** of the title row, clipped page overflow.
- **Touch / tap:** chart bars, line dots (with enlarged transparent hit targets), and pie slices toggle a value tooltip on tap; tapping empty chart area clears it. Eras segments also toggle the minister tooltip on tap so narrow color-only segments stay explorable.
- Office switcher above the index strip/chart: full-width row with left/right buttons; the **page main title lives here** — selected office name as `h1`, then a bottom row with minister subtitle `שם · תפקיד · מפלגה` and the legend (`מדד` / `התראה`) on the **physical left** of that same subtitle row. Index circles (~52px desktop / ~40px mobile) centered in a scrollable strip with top/bottom rules. Active index is marked by a filled grey bar at full strip height (edge to edge between the borders) that slides horizontally when selection changes (`prefers-reduced-motion` disables the slide). **Office title and index circles both slide** in the same direction when switching offices (`office-dashboard__slide--from-left|from-right`); chart updates without that animation. Chart header actions (`dir=ltr`) keep the **share** control as the physical-left button, with **מקור** to its right, on both desktop and mobile.
- Charts are hand-rolled SVG (no Chart.js); supports `line` (with light-blue area under the series), `bar` (rounded tops, white side/top stroke (no baseline edge), soft SVG side/top drop-shadow (bottom clipped)), `pie`.
- **Deep links / share:** selection is mirrored to `?office=` + `?index=` (numeric ids). Opening a shared URL restores that office and chart. Chart header has a **share icon** that exports a PNG of title + description + chart + eras + **selected-era detail / compare panel** (`exportOfficeChartImage`: site logo top-left with left-aligned watermark **לעוד מידע חפשו אתר מצב האומה** + blue `stateofthenation.co.il` slightly lower beside it, index circle icon top-right with the **office name on a line above both** the index name/description and the index circle, ~28px side / ~32–24px top–bottom padding with site-blue border (~4px) with thin white outer margin (~10px) composited after capture (SVG filters stripped; clone captured on-screen at near-zero opacity), locked SVG width from the live `viewBox` so taller mobile charts export without distortion, inlined paint + Heebo bold preload/reinforcement for compare text; SVG bar drop-shadows stripped for capture (html-to-image blanks on feDropShadow), minister photos; action controls and tooltips are excluded). Era selection is **lifted** in the detail panel and shared with the offscreen export `OfficeErasBar` (plus chart highlight bands) so the PNG mirrors the live compare picks. Capture always prefers an offscreen `.office-dashboard__chart-block--export` shell rendered at **desktop** proportions (`uiScale=1`, `tall=false`, fixed **960px** width / 960×400 viewBox + desktop eras sizing + side-by-side compare layout) so mobile shares match PC layout. Delivery uses shared `sharePngImage` (same as dream-government poster): **Android / Samsung / mobile** prefer the native Web Share sheet (skip unreliable image clipboard); **iOS / desktop** use Safari-safe `ClipboardItem(Promise)` clipboard write; fallback opens the image tab / `<a download>`. Mobile share `text` is the index description (when present), then `מאתר מצב האומה`, then the absolute chart deep link (`/government/dashboard?office=&index=`) — no office name / “מדדי משרדי הממשלה”.
- **Eras bar** (~64px desktop / ~54px mobile) just under the chart x-axis; chart + eras use the full `.container` content width. Segment left/width are absolute % of the same chart viewBox width as the SVG bars (shared Y-gutter scaled by `uiScale` + bar geometry). Empty left/right gutters (Y-axis pad / right pad) are **white** so only the colored era segments show as the bar. **Click selects up to 2 eras** for comparison (defaults to the **latest two** eras on page load and when opening/changing an **office** (export shell is read-only for selection so it cannot clear the live picks); swapping indexes in the same office **keeps** the chosen eras when they still overlap the chart; second click adds; clicking a selected era deselects it — including clearing the last one so none are selected; a third click while two are selected replaces the earlier pick). Every segment has a **4px party-color top strip** at high opacity (~88% unselected, solid when selected), a **1px white hairline** under it, then a **lower-opacity** mix of that color (~38% → white), rising on hover (~50%) and **higher when selected** (~82%). Selected eras also paint low-opacity vertical bands on the chart and a **dashed party-color average line** across each selected band with the **avg value centered above the line** (black text, white halo). **Hover / tap** still shows the minister tooltip (photo, name, party, full date range) above the bar; tap toggles it on touch. Year-only bar charts map each date through that year’s bar (Jan 1 → left edge, mid-year → center, Dec 31 → right edge); domain still clips Jan 1 first year → Dec 31 last year. Year-only **era averages** only include years where the minister served at least half the calendar year (short tenures fall back to the longest-overlap year), so a December start does not pull that annual total into the new era. National Security also pulls historical `ביטחון הפנים` / `משטרה` appointments. Short overlaps get a minimum segment width; if nothing overlaps the chart domain, falls back to the ministers' own timeline. Segments colored by **party name**; **photos ~48px desktop / ~40px mobile** (shown when wide enough in CSS px for a perfect circle); name/party when wide (≥~14% chart width). Under each minister-switch border, a compact `MM.YYYY` tick (drop labels closer than ~7%). LTR time axis (oldest left). **Below the bar:** compare panel — **older era on the left**, **newer on the right**; each half has minister photo/info on the **outer** edge (name as title, party as muted subtitle, then dates as **end – start** / `היום – start`) and **period average** (number above, ממוצע בתקופה below) toward the **middle**, with a **spread party-color top-down gradient** wash and **rounded bottom corners (44px)** under a **5px** top accent; when two are selected, a centered circular badge (**3px** black border; hard offset shadow matching homepage hero buttons but centered downward `0 6px 0 #000814`; black copy with a much larger red/green delta number (~2.15rem desktop / ~1.7rem mobile) and slightly smaller lead/tail text (~0.7rem / ~0.62rem)) straddles both halves with **עלייה/ירידה של X בממוצע בין התקופות**. On mobile the compare stack is vertical (older above, newer below); the newer half’s party-color accent moves to a **bottom** border (**5px** accents). Badge color follows indexes.higher_is_better: rise is green when higher is better, red when lower is better (and the reverse for a fall).
- Charts: Y-axis left gutter is sized from the longest tick label (not a fixed wide pad) and scaled softly by `uiScale` so the plot stays usable; on mobile the bottom gutter also grows with `uiScale` so x-axis labels sit below the bars instead of overlapping them. **Y domain:** all-non-negative series floor at **0** (bars sit on the baseline — no floating gap from padding below the data min); all-non-positive series ceiling at 0; mixed series pad both sides. Chart SVG is forced `dir=ltr` so Y labels with `textAnchor=end` stay in the left gutter under page RTL; hover/tap tooltip is anchored above the active bar/point and wraps with a max-width on narrow screens.
- Homepage teaser: `SHOW_GOVERNMENT_DASHBOARD = true` in `App.tsx`, links to `/government/dashboard`; media is the static PNG `/government-offices-homepage.png` (no live fetch on the homepage).

## Seeding

```bash
python "Layer 1 - Gathering Data/knesset/seed_office_dashboard.py"
# optional: --dry-run
```

Requires `SUPABASE_URL` + `SUPABASE_SERVICE_KEY`. Idempotent upserts. If anon SELECT fails or `higher_is_better` is missing, apply `schema_office_dashboard.sql` in the Supabase SQL Editor (adds the column and backfills alert metrics as lower-is-better).

## Verification

```bash
npm run lint
npm run build
npm run dev   # visit /government/dashboard and /
```

Ensure `NEXT_PUBLIC_SUPABASE_ANON_KEY` is set.

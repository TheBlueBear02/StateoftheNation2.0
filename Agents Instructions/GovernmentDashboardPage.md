# GovernmentDashboardPage

> See [ProjectOverview.md](./ProjectOverview.md) for repo structure and [Database.md](./Database.md) for `indexes` / `index_data`.

Office KPI/policy dashboard ported from the old Flask `/offices` page. Shows four curated ministries as a quadrant of bubbles; selecting an office opens an **inline detail panel** (not modals) with KPI/policy cards and an SVG trend chart. No RSS news feed.

Route: `/government/dashboard`

## Page Structure

```
┌─────────────────────────────────────────────────────────┐
│  Header (shared SiteHeader)                             │
├─────────────────────────────────────────────────────────┤
│  Breadcrumb: הממשלה / דשבורד מדדים                       │
│  Title + legend (מדד / מדיניות / התראה)                 │
│  Layout:                                                │
│    ├─ Quadrant (2×2 office clusters)                    │
│    │     each: KPI/policy bubbles + minister portrait   │
│    └─ Detail panel (when office selected)               │
│          ├─ Office + minister header                    │
│          ├─ Office info                                 │
│          ├─ Index cards (latest value + % change)       │
│          └─ SVG trend chart for selected index          │
├─────────────────────────────────────────────────────────┤
│  Footer (shared SiteFooter)                             │
└─────────────────────────────────────────────────────────┘
```

## Files

| File | Role |
|------|------|
| `src/app/government/dashboard/page.tsx` | Metadata + JSON-LD + view |
| `src/views/OfficeDashboardPage.tsx` | Page shell, quadrant, detail panel |
| `src/views/OfficeDashboardPage.css` | Layout, bubbles, cards, panel |
| `src/components/government/IndexTrendChart.tsx` | SVG line/bar/pie chart |
| `src/components/government/IndexTrendChart.css` | Chart styles |
| `src/hooks/useOfficeDashboard.ts` | Client fetch wrapper |
| `src/lib/fetchOfficeDashboard.ts` | Supabase queries + shaping |
| `Layer 1 - Gathering Data/knesset/seed_office_dashboard.py` | Seed from old sn.db |
| `Layer 1 - Gathering Data/knesset/office_dashboard_source.db` | Source SQLite copy |
| `Layer 1 - Gathering Data/schema_office_dashboard.sql` | Anon RLS + unique `(index_id, recorded_at)` |

## Data Layer

### Tables

- `offices` — `is_shown=true` for the four dashboard ministries; curated `info`
- `indexes` — KPI (`is_kpi`) / policy metrics per office; `alert`, `chart_type`, `source`
- `index_data` — time series (`label`, `value`, `recorded_at`)
- `minister_appointments` + `people` — current minister portrait for the active government
- `governments` — active government for appointment snapshot

### Display order

Client-side via `OFFICE_DASHBOARD_DISPLAY_ORDER` in `fetchOfficeDashboard.ts` (name substring match): תחבורה → ביטחון לאומי → אוצר → חינוך (matches old desired order `[3,2,5,4]`).

### Queries

1. `offices` where `is_shown=true`
2. `indexes` for those office ids where `is_shown=true`, ordered `is_kpi desc`
3. `index_data` for those index ids, ordered `recorded_at`
4. Active `governments` + `minister_appointments` joined to `people` for minister photos

Percent change on cards = latest vs previous data point (not minister-term averages from the old site).

## UI Specs

- Design language: flat white, square corners, blue accents, RTL (`DesignLanguage.md`).
- Breadcrumb required: `הממשלה` → `/government` / דשבורד מדדים.
- Bubbles: blue radial = KPI, grey = policy, red = alert; minister avatar centered in each cluster.
- **No `<dialog>` modals** — detail is an inline side panel (stacks below on ≤960px).
- Charts are hand-rolled SVG (no Chart.js); supports `line`, `bar`, `pie`.
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

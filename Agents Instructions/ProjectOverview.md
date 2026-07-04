# Project Overview — מצב האומה (State of the Nation)

Central reference for agents working on this repository. Use this file to understand **what the project is**, **how it is organized**, and **where to look next**. Feature-specific behavior lives in the per-page docs listed at the end.

## Purpose

**מצב האומה** is a Hebrew (RTL) civic-data web app that helps Israelis understand the state of the country through technology. The product vision spans several modules; only a subset is implemented today.

| Module (Hebrew) | Route / anchor | Status |
|-----------------|----------------|--------|
| Homepage hub | `/` | Live |
| הכנסת — Knesset hemicycle | `/knesset` | Live |
| צינורות נתונים — Data pipelines docs | `/piplines` | Live |
| דשבורד ממשלה — Government dashboard | `/government` | Live |
| בחירות 2026 — Elections 2026 | `#elections-2026` | Planned |
| ציר זמן — Timeline | `#timeline` | Planned |
| מיפוי סוגיות פוליטיות — Political issues map | `#political-issues` | Planned |

Live pages fetch parliamentary data from **Supabase** (backed by the official Knesset OData API, seeded via Python scripts). Static homepage content (news ticker, hero copy) is hard-coded until APIs are wired.

## Tech Stack

| Layer | Choice |
|-------|--------|
| UI | React 19 + TypeScript |
| Build | Vite 8 |
| Routing | `react-router-dom` v7 |
| Data | Supabase (`@supabase/supabase-js`) |
| Lint | Oxlint |
| Language / layout | Hebrew, `dir="rtl"`, Heebo font |

## Repository Layout

```
StateoftheNation2.0/
├── Agents Instructions/     # Agent-facing docs (this folder)
│   ├── ProjectOverview.md   # ← start here
│   ├── HomePage.md
│   ├── KnessetPage.md
│   └── PiplinesPage.md
├── src/                     # React application
│   ├── main.tsx             # Router entry
│   ├── App.tsx              # Homepage (/)
│   ├── App.css              # Homepage + shared .container styles
│   ├── index.css            # Global reset, CSS variables, typography
│   ├── pages/               # Route-level page components
│   ├── components/          # Shared + feature components
│   ├── hooks/               # Data-fetching hooks
│   └── lib/                 # Pure logic, Supabase client, types
├── public/                  # Static assets (logos, MK photos, favicon)
├── knesset-db-scripts/      # Python one-off / maintenance scripts for Supabase
├── index.html               # `lang="he"`, `dir="rtl"`
├── package.json
├── vite.config.ts
└── .env                     # VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY (not committed)
```

### `src/` breakdown

| Path | Role |
|------|------|
| `main.tsx` | `BrowserRouter`, route table (`/` → `App`, `/government` → `GovernmentPage`, `/knesset` → `KnessetPage`, `/piplines/*` → `PiplinesPage`) |
| `App.tsx` | Homepage sections: hero, news strip, government-dashboard teaser |
| `pages/GovernmentPage.tsx` | Government picker, hierarchy pyramid, office list |
| `pages/KnessetPage.tsx` | Knesset term picker, hemicycle, faction list |
| `pages/KnessetPage.css` | Knesset-specific layout, tooltip, MK dot animation |
| `pages/PiplinesPage.tsx` | Data-pipeline docs hub (sidebar + main column) |
| `pages/PiplinesPage.css` | Pipelines docs layout and typography |
| `content/pipelines/` | Pipeline registry and per-pipeline doc content |
| `components/SiteHeader.tsx` | Shared header with home logo, Israel-time civil/Hebrew-numeral date labels, and current government/Knesset context — used on all pages |
| `components/SiteFooter.tsx` | Shared footer — primary blue background, white logo, social links, and copyright |
| `components/SiteLayout.tsx` | Header + `{children}` + footer shell for all routes |
| `components/knesset/` | Hemicycle visualization subtree (see below) |
| `components/government/` | Government hierarchy and office-list subtree |
| `hooks/useKnessetList.ts` | Loads all Knesset terms for the picker dropdown |
| `hooks/useKnessetMembers.ts` | Members, counts, faction groups for selected term |
| `hooks/useGovernmentList.ts` | Loads all governments for the picker dropdown |
| `hooks/useGovernmentMinisters.ts` | Ministers, pyramid tiers, office groups for selected government |
| `lib/supabase.ts` | Supabase client, env guard, shared DB row types |
| `lib/hemicycle.ts` | 17×15 seat grid, bloc/faction layout, colors, reveal order |
| `lib/governmentStructure.ts` | Government role classification, pyramid tiers, office grouping |
| `lib/knessetTenure.ts` | Cumulative tenure stats per MK |
| `lib/memberRoles.ts` | Formats minister appointments and membership duty into tooltip roles |
| `lib/memberSort.ts` | `MemberSortMode` enum + Hebrew sort labels |

### `components/knesset/` subtree

| Component | Responsibility |
|-----------|----------------|
| `KnessetHemicycle.tsx` | SVG shell, hover coordination, tooltip trigger |
| `MKDot.tsx` | Single seat circle (photo or initials, faction border) |
| `CenterCounter.tsx` | Coalition/opposition donut or neutral total |
| `FactionList.tsx` | Sortable party cards with MK thumbnails below hemicycle |
| `Tooltip.tsx` | Desktop-only floating member info overlay |

### `components/government/` subtree

| Component | Responsibility |
|-----------|----------------|
| `GovernmentPyramid.tsx` | PM/deputy/ministers hierarchy diagram with hover tooltips |
| `OfficeList.tsx` | Office cards with ministers and deputy ministers |

### `public/` assets

- `header-logo 3.svg`, `hero-bear-image.svg`, `favicon.svg` — branding
- `images/KM Images/הכנסת ה25/{party}/{name}.jpeg` — local MK headshots (also referenced in DB `people.image_url`)

### `knesset-db-scripts/` (Python, not part of the web build)

| Script | Purpose |
|--------|---------|
| `knesset_api.py` | One-time seed from official Knesset OData API into Supabase (`knessets`, `people`, `knesset_factions`, `knesset_memberships`, etc.) |
| `km_images.py` | Match local JPEG filenames to `people` rows and set `image_url` |
| `fix_faction_links.py` / `fix_faction_links_all.py` | Backfill `faction_id` on memberships |
| `check.py` | Ad-hoc data validation |

These scripts use `SUPABASE_SERVICE_KEY` (service role). The frontend uses only the public anon key.

## Application Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  index.html (RTL, Hebrew)                                   │
│    └─ main.tsx (React Router)                               │
│         ├─ /           → App.tsx (static homepage)          │
│         ├─ /government → GovernmentPage.tsx                 │
│         ├─ /knesset    → KnessetPage.tsx                    │
│         └─ /piplines/* → PiplinesPage.tsx                   │
│              ├─ SiteLayout (header + footer)              │
│              ├─ useKnessetList → Supabase knessets          │
│              ├─ useKnessetMembers → Supabase memberships    │
│              ├─ useGovernmentList → Supabase governments    │
│              ├─ useGovernmentMinisters → Supabase roles     │
│              └─ lib/ pure layout/grouping logic             │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    Supabase (PostgreSQL)
                    seeded from Knesset API
```

**State management pattern:** no global store. Each page owns local UI state (`useState`). Data hooks (`useKnessetList`, `useKnessetMembers`) encapsulate Supabase fetching, loading, and error handling. Layout algorithms in `lib/` are pure functions.

## Data Model (Supabase)

Tables consumed by the live app:

| Table | Used by | Key fields |
|-------|---------|------------|
| `knessets` | Knesset picker | `knesset_number`, `start_date`, `end_date`, `is_active` |
| `knesset_memberships` | Member list + hemicycle | `person_id`, `faction_id`, `start_date`, `end_date`, `knesset_id`, `duty_desc` |
| `knesset_factions` | Party names, colors, coalition flag | `name`, `short_name`, `color`, `is_coalition`, `logo_url` |
| `people` | MK display | `full_name`, `image_url` |
| `governments` | Government picker | `government_number`, `knesset_id`, `start_date`, `end_date`, `is_active` |
| `minister_appointments` | MK tooltip government roles + Government page | `person_id`, `government_id`, `duty_desc`, `is_acting`, `office_id`, dates |
| `offices` | Ministry names (joined from appointments) | `name`, `knesset_category_name` |

Env vars required for live data:

```
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

## Design Conventions

- **Design language source:** read [DesignLanguage.md](./DesignLanguage.md) before creating or updating UI. New cards and buttons must use square corners (`border-radius: 0`).
- **RTL first:** `dir="rtl"` on `<html>` and `.site`; grid DOM order places primary content in the right column.
- **Layout primitive:** `.container` (`max-width: 1120px`, fluid `clamp()` padding) centers section content; section backgrounds are full-bleed.
- **CSS variables** in `index.css` (`--color-blue`, `--container-max`, etc.).
- **Accessibility:** `prefers-reduced-motion` disables marquee and seat-pop animations.
- **Agent doc rule:** when changing a feature, update the matching file in `Agents Instructions/` so docs stay the single source of truth.

## Scripts & Verification

```bash
npm install
npm run dev      # local dev server
npm run build    # tsc + vite production build
npm run lint     # oxlint
```

## Agent Documentation Index

Read the overview first, then the doc for the area you are changing:

| Doc | Scope |
|-----|-------|
| [ProjectOverview.md](./ProjectOverview.md) | This file — structure, stack, data model |
| [DesignLanguage.md](./DesignLanguage.md) | Project color palette and UI rules for new pages/components |
| [GovernmentPage.md](./GovernmentPage.md) | `/government` — government hierarchy, ministers, offices |
| [HomePage.md](./HomePage.md) | `/` — hero, news strip, dashboard teaser, `.container`, routing |
| [KnessetPage.md](./KnessetPage.md) | `/knesset` — hemicycle grid, coalition layout, hooks, animations |
| [PiplinesPage.md](./PiplinesPage.md) | `/piplines` — data pipeline documentation hub |

When adding a new major page or module, create a matching `Agents Instructions/{Feature}.md` and link it from this index.

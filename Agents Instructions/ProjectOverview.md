# Project Overview — מצב האומה (State of the Nation)

Central reference for agents working on this repository. Use this file to understand **what the project is**, **how it is organized**, and **where to look next**. Feature-specific behavior lives in the per-page docs listed at the end.

## Purpose

**מצב האומה** is a Hebrew (RTL) civic-data web app that helps Israelis understand the state of the country through technology. The product vision spans several modules; only a subset is implemented today.

| Module (Hebrew) | Route / anchor | Status |
|-----------------|----------------|--------|
| Homepage hub | `/` | Live |
| אודות | `/about` | Live |
| תנאי שימוש | `/terms` | Live |
| הכנסת — Knesset hemicycle | `/knesset` | Live |
| צינורות נתונים — Pipelines dashboard | `/piplines` | Live (password-gated, noindex) |
| תיעוד צינורות | `/piplines/docs` | Live (noindex) |
| דשבורד ממשלה — Government dashboard | `/government` | Live |
| בחירות 2026 — Elections 2026 | `/elections`, `/elections/polls`, `/elections/lists` | Live |
| סקרי מנדטים — Poll averages | `/elections/polls` | Live |
| משחק הרשימות — List rating game | `/elections/lists` | Live |
| עדכון סקרים (dev) | `/elections/polls/edit` | Live (password-gated, noindex) |
| עריכת מועמדים (dev) | `/elections/edit` | Live (password-gated, noindex) |
| סנכרון כנסת (dev) | `/knesset/edit` | Live (password-gated, noindex) |
| ציר זמן — Timeline | `#timeline` | Planned |

Live pages fetch data from **Supabase**. Static homepage content (news ticker, hero copy) is hard-coded until APIs are wired.

## Tech Stack

| Layer | Choice |
|-------|--------|
| UI | React 19 + TypeScript |
| Framework | **Next.js 16** (App Router) |
| Routing | File-based `src/app/**` |
| Data | Supabase (`@supabase/supabase-js`) |
| Lint | `next lint` (eslint-config-next); Oxlint available |
| Language / layout | Hebrew, `dir="rtl"`, Heebo via `next/font` |
| SEO | `metadata` / `generateMetadata`, `sitemap.ts`, `robots.ts`, JSON-LD |

## Repository Layout

```
StateoftheNation2.0/
├── Agents Instructions/     # Agent-facing docs (this folder)
├── src/
│   ├── app/                 # Next.js App Router (routes, layout, SEO, API)
│   ├── views/               # Client page bodies (not Next "pages" router)
│   ├── components/          # Shared + feature components
│   ├── hooks/               # Data-fetching hooks
│   ├── lib/                 # Pure logic, Supabase client, runtimeEnv
│   ├── server/              # Shared API helpers (Python spawn, secrets)
│   ├── content/pipelines/   # Pipeline registry for /piplines dashboard + docs
│   ├── App.tsx              # Homepage body
│   ├── App.css
│   └── index.css            # Global tokens (Heebo via next/font)
├── public/                  # Static assets (logos, MK photos, site_icon.png favicon)
├── Layer 1 - Gathering Data/
│   ├── Elections/           # Candidate enrichment pipeline
│   ├── knesset/             # Knesset OData sync
│   └── Polls/               # Wikipedia polls → aggregates
├── .github/workflows/       # Scheduled polls pipeline
├── next.config.ts
├── package.json
└── .env                     # Secrets (not committed)
```

### `src/app/` routes

| URL | App file |
|-----|----------|
| `/` | `src/app/page.tsx` |
| `/about` | `src/app/about/page.tsx` |
| `/terms` | `src/app/terms/page.tsx` |
| `/elections` | `src/app/elections/page.tsx` |
| `/elections/polls` | `src/app/elections/polls/page.tsx` |
| `/elections/polls/edit` | `src/app/elections/polls/edit/page.tsx` |
| `/elections/edit` | `src/app/elections/edit/page.tsx` |
| `/elections/lists` | `src/app/elections/lists/page.tsx` |
| `/elections/[partyId]` | `src/app/elections/[partyId]/page.tsx` |
| `/government` | `src/app/government/page.tsx` |
| `/knesset` | `src/app/knesset/page.tsx` |
| `/knesset/edit` | `src/app/knesset/edit/page.tsx` |
| `/piplines` | `src/app/piplines/page.tsx` |
| `/piplines/docs/[[...slug]]` | `src/app/piplines/docs/[[...slug]]/page.tsx` |
| `/piplines/[slug]` | `src/app/piplines/[slug]/page.tsx` (legacy → docs) |
| `/api/elections/[...path]` | Local-dev pipeline / edit API |
| `/api/knesset/[...path]` | Local-dev pipeline / faction API |
| `/api/polls/[...path]` | Local-dev polls pipeline API |
| `/sitemap.xml` | `src/app/sitemap.ts` |
| `/robots.txt` | `src/app/robots.ts` |

Page UI lives in `src/views/*` (and `src/App.tsx` for home). App Router `page.tsx` files own metadata and thin wrappers.

### `Layer 1 - Gathering Data/` (Python, not part of the web build)

| Folder | Purpose |
|--------|---------|
| `knesset/` | OData sync (`load_all_knesset_data.py`), faction fixes, images |
| `Elections/` | Candidate list pipeline + `run_party_pipeline_api.py` |
| `Polls/` | Wikipedia scrape → normalize → aggregates; GitHub Actions cron |
| (shared) | `record_pipeline_run.py` (ops log) · `emit_site_updates.py` (homepage ticker) |

These scripts use `SUPABASE_SERVICE_KEY`. The public site uses the anon key. Local Next Route Handlers spawn Python only when `NODE_ENV=development` or `ENABLE_PIPELINE_API=1`.

**Pipeline finish hooks:** after successful non-dry-run work, orchestrators call `record_pipeline_run` (ops) and `emit_site_updates` collectors (homepage news strip). See [PiplinesPage.md](./PiplinesPage.md). Required for every existing and future pipeline.

## Application Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  src/app/layout.tsx (RTL, Heebo, root metadata, Analytics)  │
│    └─ App Router pages                                      │
│         ├─ /           → App.tsx                            │
│         ├─ /about      → views/AboutPage.tsx                │
│         ├─ /terms      → views/TermsPage.tsx                │
│         ├─ /government → views/GovernmentPage.tsx           │
│         ├─ /knesset    → views/KnessetPage.tsx              │
│         ├─ /elections… → views/Elections*.tsx               │
│         ├─ /piplines     → PipelinesDashboardPage.tsx       │
│         └─ /piplines/docs → PiplinesDocsPage.tsx            │
│              ├─ SiteLayout (header + footer)                │
│              └─ hooks → Supabase (anon)                     │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    Supabase (PostgreSQL)
                    seeded by Layer 1 + Actions
```

**State management:** no global store. Each view owns local UI state. Data hooks encapsulate Supabase fetching. Layout algorithms in `lib/` are pure functions.

## Env vars

```
NEXT_PUBLIC_SUPABASE_URL=...          # or VITE_SUPABASE_URL / SUPABASE_URL (mapped in next.config)
NEXT_PUBLIC_SUPABASE_ANON_KEY=...     # or VITE_SUPABASE_ANON_KEY
NEXT_PUBLIC_SITE_URL=https://...      # canonical / OG / sitemap base (bare domain ok; https:// added)
NEXT_PUBLIC_PIPELINE_EDIT_SECRET=...  # shared unlock for /piplines + all /edit pages
NEXT_PUBLIC_ELECTIONS_EDIT_SECRET=... # fallback alias (or VITE_ / ELECTIONS_EDIT_SECRET)
NEXT_PUBLIC_KNESSET_EDIT_SECRET=...   # fallback alias (or VITE_ / KNESSET_EDIT_SECRET)
SUPABASE_SERVICE_KEY=...              # pipelines + local edit APIs
OPENAI_API_KEY=...                    # elections enrichment + homepage site_updates headlines
ENABLE_PIPELINE_API=1                 # optional: allow Python APIs outside development
```

`next.config.ts` maps legacy `VITE_*` names into `NEXT_PUBLIC_*` for the client bundle.

## Design Conventions

- **Design language:** [DesignLanguage.md](./DesignLanguage.md) — square corners, breadcrumbs, palette.
- **SEO:** [SeoAndWebStandards.md](./SeoAndWebStandards.md).
- **RTL first:** `lang="he"` `dir="rtl"` on `<html>`.
- **Agent doc rule:** when changing a feature, update the matching file in `Agents Instructions/`.

## Scripts & Verification

```bash
npm install
npm run dev      # http://localhost:3000
npm run build
npm run start
npm run lint
```

## Agent Documentation Index

| Doc | Scope |
|-----|-------|
| [ProjectOverview.md](./ProjectOverview.md) | This file — structure, stack, data model |
| [Database.md](./Database.md) | Full Supabase schema |
| [DesignLanguage.md](./DesignLanguage.md) | UI rules |
| [SeoAndWebStandards.md](./SeoAndWebStandards.md) | Metadata, sitemap, robots, JSON-LD |
| [GovernmentPage.md](./GovernmentPage.md) | `/government` |
| [HomePage.md](./HomePage.md) | `/` |
| [LegalPages.md](./LegalPages.md) | `/about`, `/terms` (footer only) |
| [KnessetPage.md](./KnessetPage.md) | `/knesset` + `/knesset/edit` |
| [PiplinesPage.md](./PiplinesPage.md) | `/piplines` dashboard + `/piplines/docs` |
| [ElectionsPage.md](./ElectionsPage.md) | `/elections` module |
| [PollsPage.md](./PollsPage.md) | `/elections/polls` |

When adding a new major page or module, create a matching `Agents Instructions/{Feature}.md` and link it from this index.

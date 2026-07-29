# מצב האומה (State of the Nation)

Hebrew RTL civic-data site: Knesset, government, elections 2026, and poll averages.

## Stack

- **Next.js 16** (App Router) + React 19 + TypeScript
- **Supabase** (PostgreSQL) for live data
- **Python pipelines** under `Layer 1 - Gathering Data/` (plus GitHub Actions for polls)

## Setup

```bash
npm install
```

Copy or edit `.env` (never commit it). Minimum for the public site:

```
SUPABASE_URL=...
SUPABASE_ANON_KEY=...          # or VITE_ / NEXT_PUBLIC_ equivalents
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

`next.config.ts` maps legacy `VITE_SUPABASE_*` / `VITE_*_EDIT_SECRET` into the client bundle, so existing Vite-style `.env` keys still work.

For local pipeline / edit APIs also set:

```
SUPABASE_SERVICE_KEY=...
VITE_ELECTIONS_EDIT_SECRET=...   # or NEXT_PUBLIC_ELECTIONS_EDIT_SECRET
VITE_KNESSET_EDIT_SECRET=...
OPENAI_API_KEY=...               # elections enrichment
```

## Scripts

```bash
npm run dev      # http://localhost:3000
npm run build
npm run start
npm run lint
```

## Docs for agents

Start at [`Agents Instructions/ProjectOverview.md`](./Agents%20Instructions/ProjectOverview.md). SEO rules: [`SeoAndWebStandards.md`](./Agents%20Instructions/SeoAndWebStandards.md). Schema: [`Database.md`](./Agents%20Instructions/Database.md).

## Note on edit APIs

`/api/elections/*`, `/api/knesset/*`, and `/api/polls/*` spawn local Python and are enabled in development (or with `ENABLE_PIPELINE_API=1`). Production data updates should use Layer 1 scripts / GitHub Actions, not serverless Python spawn.

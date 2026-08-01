# SEO and Web Standards — מצב האומה

> See [ProjectOverview.md](./ProjectOverview.md) for stack and routes.

Professional SEO and web standards for the Next.js App Router site.

## Principles

1. Every **public** URL has a unique Hebrew `title` + `description` (via `metadata` or `generateMetadata`).
2. Crawlers get real HTML from the App Router shell (not an empty SPA root). High-traffic elections routes **server-fetch** Supabase data and pass it as `initial*` props so Client Components SSR with party names, seat averages, and candidate lists in the first HTML.
3. Edit / pipeline tools are **noindex** and excluded from the sitemap.
4. Absolute URLs use `NEXT_PUBLIC_SITE_URL` (`getSiteUrl()` in `src/lib/runtimeEnv.ts`). Prefer `https://stateofthenation.co.il`; a bare host is normalized with `https://`. On Vercel, unset falls back to `https://${VERCEL_URL}`.
5. Optional Facebook App ID: set `NEXT_PUBLIC_FACEBOOK_APP_ID` so root metadata emits `facebook.appId` / `fb:app_id` (Sharing Debugger). Create an app at developers.facebook.com → App settings → App ID.

## Files

| File | Role |
|------|------|
| `src/app/layout.tsx` | Root metadata, Open Graph defaults (incl. default share image), Twitter card, Heebo via `next/font`, `lang="he"` `dir="rtl"`, Vercel Analytics (`@vercel/analytics/next`). Default title **מצב האומה \| State of the Nation IL**; favicon/apple icon from `/site_icon.png` |
| `public/site_icon.png` | Site favicon and Apple touch icon |
| `public/website-preview-thumbnail.png` | Default Open Graph / Twitter share image (`summary_large_image`) |
| `src/app/page.tsx` (+ other `page.tsx`) | Per-route metadata |
| `src/lib/supabaseServer.ts` | Shared anon `createServerSupabaseClient()` for Server Components / sitemap |
| `src/lib/fetchPolls.ts` | Shared polls + results fetch (server + client hooks) |
| `src/lib/fetchElectionParties.ts` | Shared confirmed parties fetch (safe for client hooks) |
| `src/lib/loadElectionPartyPage.ts` | Server-only React `cache` loader for party metadata + body |
| `src/lib/fetchElectionCandidates.ts` | Shared candidates / stats / map-pin builders |
| `src/app/elections/page.tsx` | Metadata + `ItemList` JSON-LD + SSR parties → `ElectionsPage` |
| `src/app/elections/polls/page.tsx` | Metadata + seat-average `ItemList` JSON-LD + SSR polls → `ElectionsPollsPage` |
| `src/app/elections/[partyId]/page.tsx` | `generateMetadata` + party/candidate JSON-LD + SSR party body |
| `src/app/sitemap.ts` | Public routes + confirmed `election_parties` |
| `src/app/robots.ts` | Allow `/`; disallow edit routes, `/piplines`, `/api/` |
| `src/app/not-found.tsx` | Hebrew 404 |
| `src/components/seo/JsonLd.tsx` | JSON-LD script helper |

## noindex routes

Set `robots: { index: false, follow: false }` on:

- `/elections/edit`
- `/elections/polls/edit`
- `/knesset/edit`
- `/piplines` (internal docs)

## JSON-LD

- Home: `WebSite` + nested `Organization` publisher.
- Elections index: `WebPage` + `BreadcrumbList` + `ItemList` of confirmed parties.
- Polls: `WebPage` + `BreadcrumbList` + `ItemList` of last-N seat averages (links to party URLs).
- Party pages: `WebPage` with `about: PoliticalParty`, `BreadcrumbList`, and candidate `ItemList` when loaded.

When adding a content page, prefer matching `BreadcrumbList` JSON-LD to the visible `PageBreadcrumb`.

## SSR data (elections)

`/elections` and `/elections/[partyId]` load anon Supabase data in their Server Component `page.tsx` and pass `initialParties` / `party` + `initialCandidates` into the client views so the first HTML includes names and lists. `/elections/polls` server-fetches a small poll window (15) only to build seat-average JSON-LD; the interactive charts still load via `usePolls(120)` on the client (passing the full poll payload through RSC froze the Next server). Hooks skip the browser refetch when initial data is provided. `/government` and `/knesset` are still client-fetched.

## Fonts and images

- **Heebo** via `next/font/google` in root layout (`display: swap`). Do not re-add Google Fonts `@import` in CSS.
- Prefer `next/image` for new image work; remote hosts must be listed in `next.config.ts` `images.remotePatterns`.
- Default social preview: `public/website-preview-thumbnail.png` wired in root `openGraph.images` / `twitter.images`. Child routes inherit it unless they set their own.

## Checklist for new public pages

1. Add `src/app/.../page.tsx` with Hebrew `metadata` (title, description, `alternates.canonical`).
2. Add the path to `src/app/sitemap.ts` (or dynamic query if DB-backed).
3. Do **not** list password-gated tools in the sitemap.
4. Update the matching Agents Instructions doc and [ProjectOverview.md](./ProjectOverview.md) route table.

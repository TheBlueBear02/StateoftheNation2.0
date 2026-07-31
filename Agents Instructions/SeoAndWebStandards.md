# SEO and Web Standards — מצב האומה

> See [ProjectOverview.md](./ProjectOverview.md) for stack and routes.

Professional SEO and web standards for the Next.js App Router site.

## Principles

1. Every **public** URL has a unique Hebrew `title` + `description` (via `metadata` or `generateMetadata`).
2. Crawlers get real HTML from the App Router shell (not an empty SPA root).
3. Edit / pipeline tools are **noindex** and excluded from the sitemap.
4. Absolute URLs use `NEXT_PUBLIC_SITE_URL` (`getSiteUrl()` in `src/lib/runtimeEnv.ts`). Prefer `https://stateofthenation.co.il`; a bare host is normalized with `https://`. On Vercel, unset falls back to `https://${VERCEL_URL}`.

## Files

| File | Role |
|------|------|
| `src/app/layout.tsx` | Root metadata, Open Graph defaults, Twitter card, Heebo via `next/font`, `lang="he"` `dir="rtl"`, Vercel Analytics (`@vercel/analytics/next`). Default title **מצב האומה \| State of the Nation IL**; favicon/apple icon from `/site_icon.png` |
| `public/site_icon.png` | Site favicon and Apple touch icon |
| `src/app/page.tsx` (+ other `page.tsx`) | Per-route metadata |
| `src/app/elections/[partyId]/page.tsx` | `generateMetadata` + party JSON-LD from Supabase |
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
- Party pages: `WebPage` with `about: PoliticalParty` and `BreadcrumbList`.

When adding a content page, prefer matching `BreadcrumbList` JSON-LD to the visible `PageBreadcrumb`.

## Fonts and images

- **Heebo** via `next/font/google` in root layout (`display: swap`). Do not re-add Google Fonts `@import` in CSS.
- Prefer `next/image` for new image work; remote hosts must be listed in `next.config.ts` `images.remotePatterns`.

## Checklist for new public pages

1. Add `src/app/.../page.tsx` with Hebrew `metadata` (title, description, `alternates.canonical`).
2. Add the path to `src/app/sitemap.ts` (or dynamic query if DB-backed).
3. Do **not** list password-gated tools in the sitemap.
4. Update the matching Agents Instructions doc and [ProjectOverview.md](./ProjectOverview.md) route table.

# HomePage

> See [ProjectOverview.md](./ProjectOverview.md) for repo structure, tech stack, and shared conventions.

Homepage for **מצב האומה** (State of the Nation). RTL Hebrew layout with five visible sections (government dashboard teaser temporarily hidden).

## Page Structure

```
┌─────────────────────────────────────────────────────────┐
│  Header (white, full-bleed)                             │
│    └─ .container — logo RTL start + date/context block  │
├─────────────────────────────────────────────────────────┤
│  Hero (blue, full-bleed)                                │
│    └─ .container — 2-col grid: text | bear            │
├─────────────────────────────────────────────────────────┤
│  News strip (black, full-bleed) — edge-to-edge ticker   │
├─────────────────────────────────────────────────────────┤
│  Project: משחק הרשימות (white, full-bleed)             │
│    └─ .container — tag + title | media                  │
├─────────────────────────────────────────────────────────┤
│  Project: סקרי מנדטים (#fafafa, full-bleed)            │
│    └─ .container — tag + title | media                  │
├─────────────────────────────────────────────────────────┤
│  Footer (blue, full-bleed) — logo + social + legal links + copyright│
│    └─ .container — 3-column grid (end column: אודות / תנאי שימוש) │
└─────────────────────────────────────────────────────────┘
```

## Files

| File | Role |
|------|------|
| `src/app/page.tsx` | Homepage route + metadata |
| `src/app/layout.tsx` | RTL (`lang="he"` `dir="rtl"`), Heebo via `next/font`, root metadata, Vercel Analytics |
| `src/App.tsx` | Homepage body — section markup and static content arrays |
| `src/hooks/useSiteUpdates.ts` | Loads `site_updates` for the news strip (static fallback if empty) |
| `src/components/SiteHeader.tsx` | Shared header; hidden on homepage mobile (≤900px) |
| `src/components/SiteFooter.tsx` | Shared footer (primary blue); legal links to `/about` and `/terms` only |
| `src/components/SiteLayout.tsx` | Wraps header, page content, and footer on all routes |
| `src/App.css` | `.container` primitive and section-specific styles |
| `src/index.css` | Global reset, CSS variables |
| `public/header-logo 3.svg` | Header logo (desktop / non-home) |
| `public/while-logo-nobg.svg` | White logo used as homepage hero title |
| `public/white logo.svg` | White footer logo |
| `public/hero-bear-image.svg` | Hero video poster + load-error fallback |
| Supabase `site-assets/bear-hero-video2.mp4` | Desktop hero bear video (not in git) |

## Layout primitive: `.container`

All section content (except the news ticker) lives inside a shared centered container:

```css
.container {
  width: 100%;
  max-width: var(--container-max);
  margin-inline: auto;
  padding-inline: var(--container-pad);
}
```

- **Full-bleed backgrounds** on sections (`hero`, `site-header`, `project-section`) span the viewport.
- **Centered content** via `margin-inline: auto` guarantees the container is exactly centered.
- **Fluid side padding** via `clamp()` scales gutters with viewport width.

Applied on: `site-header__inner`, `hero__inner`, `project-section` content shell, `site-footer__inner`.

## Design tokens

| Token | Value | Purpose |
|-------|-------|---------|
| `--container-max` | `1120px` | Max width of centered content shell |
| `--container-pad` | `clamp(20px, 6vw, 80px)` | Fluid horizontal inset on both sides |
| `--hero-text-max` | `640px` | Inner cap for hero title/subtitle/buttons |

## Sections

### 1. Header (`site-header`)

- White full-bleed background with bottom border (desktop and non-home routes).
- Inner wrapper (`site-header__inner container`): logo at RTL start (top-right), metadata block at the opposite side.
- Logo path: `/header-logo%203.svg` (URL-encoded space in filename).
- Date block: client-side `Intl.DateTimeFormat` using `Asia/Jerusalem`; Gregorian label is `DD.MM.YYYY`, Hebrew label uses `he-IL-u-ca-hebrew` civil-day behavior and formats day/year as Hebrew numerals (for example `י״ח בתמוז תשפ״ו`).
- Context line below the date is static copy: `ממשלת ישראל ה37 | הכנסת ה25`.
- **Homepage mobile (≤900px):** `site-header--home` is hidden so the blue hero is the first surface; brand is carried by the larger hero title logo.

### 2. Hero (`hero`)

- Blue background (`#3083F0`).
- Taller section: `min-height: clamp(460px, 64vh, 600px)` with `48px` vertical padding.
- `.hero__inner.container`: balanced `1fr 1fr` grid. DOM order is content first, visual second — in RTL this places text on the right and bear on the left.
- Text column: `align-items: flex-start` (RTL right-aligned), capped at `--hero-text-max`, `justify-self: end` (faces toward center), nudged up with `translateY(-20px)` (video column stays put). Column `gap: 16px` between title logo, subtitle, and nav; buttons add `12px` top margin so spacing below the subtitle stays unchanged.
- Bear column: `justify-content: flex-start` (faces toward center).
- **Visual (desktop):** muted `<video>` from Supabase Storage (`site-assets/bear-hero-video2.mp4`), plays once (no loop). Poster `/hero-bear-image.svg`. Video stays `opacity: 0` until ready (`onLoadedMetadata` / `onLoadedData` / `onCanPlay` / `onPlaying`, plus a mount-time `readyState` check so cached videos do not miss the event). On load error, falls back to the poster `<img>`. Explicit `play()` on mount/`loadeddata` so autoplay is reliable. File is large (~17MB), so first paint can take a moment. Autoplay + `playsInline` + `preload="auto"`. Sized larger than the grid column (`width: min(110%, 560px)`, `scale(1.12) translateX(28px)` + light `clip-path` inset) with `object-fit: cover` and hero-blue video background so scaled/narrow viewports do not show black letterbox edges on the right/bottom. Overflow visible on `.hero__visual`. Still hidden on mobile via `.hero__visual` (`display: none` at ≤900px).
- **Title:** `/while-logo-nobg.svg` inside the `h1` (desktop and mobile) — brand mark replaces the text headline; `alt="מצב האומה"`.
- **Subtitle:** הבית של המידע הפוליטי בישראל
- **Nav buttons** (`HERO_BUTTONS` in `App.tsx`): 2×2 grid; each `.hero__button` is `min-height: 56px`, `padding: 12px 24px`, `font-size: 1.125rem`, `border-radius: 14px`. Text column capped at `--hero-text-max` (640px) so buttons read wider.

| Label | Destination |
|-------|--------|
| בחירות 2026 | `/elections` (route) |
| סקרי מנדטים | `/elections/polls` (route) |
| הממשלה | `/government` (route) |
| הכנסת | `/knesset` (route) |

**בחירות 2026** links to the live Elections page, **סקרי מנדטים** links to weighted poll averages, **הממשלה** links to the live Government page, and **הכנסת** links to the live Knesset hemicycle page.

### 3. News strip (`news-strip`)

- Black background, white text, blue dot separators.
- Full-bleed edge-to-edge (no `.container`) — intentional marquee effect.
- Headlines from `site_updates` via `useSiteUpdates` (written by pipeline finish hooks in `emit_site_updates.py`). Each item is a `Link` to its `href` (e.g. `/elections/polls`, `/knesset`).
- DB items show a Jerusalem local stamp before the headline: `HH:mm | …` for updates from today, otherwise `D.M | …` with no time (e.g. `15:00 | כותרת` / `30.7 | כותרת`). Static defaults have no timestamp.
- Feed composition: up to **10** latest DB rows (`occurred_at` desc), then pad with the static default headlines until 10 total (or until defaults run out). Defaults are skipped when their headline already appears in the DB set. On query failure (or missing Supabase config), the strip shows defaults only.
- The track renders `newsItems` twice for a seamless CSS marquee loop — that is intentional duplication for animation, not a second fetch.
- Dot separators (`.news-strip__item::after`) use equal `margin-inline: 24px` on both sides so each dot sits centered in the gap between two headlines.
- CSS marquee animation (`ticker` keyframes); disabled when `prefers-reduced-motion: reduce`.

### 4. Lists game project (`#lists-game`)

- Rendered by shared `src/components/elections/ListsGamePromo.tsx` (also used at the bottom of `/elections/[partyId]`).
- White section placed **above** the polls teaser, with a bottom border divider.
- News-block layout: title **משחק הרשימות: שחקו וגלו איזו רשימה הכי מתאימה לכם** + category tag **בחירות 2026** below it (no description / meta line).
- Whole section is a link (`.project-section__link`) to `/elections/lists`.
- Media (`.project-section__media`): screenshot from `public/election-game-homepage.png`.

### 5. Mandate polls project (`#mandate-polls`)

- Uses `.project-section--alt` (`#fafafa`) so it sits below the white lists-game teaser.
- Same news-block layout: title **ניתוח כל סקרי המנדטים במקום אחד** + category tag **בחירות 2026** below it (no description / meta line).
- Whole section is a link (`.project-section__link`) to `/elections/polls`.
- Media (`.project-section__media`): screenshot from `public/polls-page-homepage.png`.

### 6. Government Dashboard project (`#government-dashboard`) — hidden

- Markup kept in `App.tsx` behind `SHOW_GOVERNMENT_DASHBOARD = false`; flip to `true` to restore.
- Same news-block layout: title **דשבורד ממשלה** + category tag **הממשלה** below it (no description / meta line).
- `.project-section__inner.container`: ~`0.95fr / 1.2fr` grid (media larger). DOM order is content first, media second — text right, preview left in RTL.
- Hover on `.project-section__inner`: light grey background on the whole content box. Hover on title or media: title underline. Whole section remains clickable; focus-visible outline on the link.
- Tag (`.project-section__tag`): square corners, `--color-blue` fill / white text.
- Media is still a CSS dashboard placeholder (`.dashboard-preview`).

### 7. Footer (`site-footer`)

- Blue background (`--color-blue: #4890FD`), white text.
- Full-bleed; inner wrapper (`site-footer__inner container`) uses a 3-column grid: white logo brand (RTL start), centered social links, end column with legal links + copyright (RTL end).
- Footer logo path: `/white%20logo.svg` (URL-encoded space in filename).
- Legal links (`FOOTER_LINKS` in `SiteFooter.tsx`): **אודות** → `/about`, **תנאי שימוש** → `/terms` — footer only (see [LegalPages.md](./LegalPages.md)).
- Social nav (`site-footer__social`): icon links to X, Instagram, and Facebook — icons from `public/icons.svg` (`x-icon`, `instagram-icon`, `facebook-icon`), opened in a new tab.
- URLs are defined in `SOCIAL_LINKS` at the top of `SiteFooter.tsx`.
- Rendered via `SiteLayout` on every page (homepage and Knesset).

## RTL & Typography

- `dir="rtl"` on `.site` via `SiteLayout` and on `<html>` in `src/app/layout.tsx`.
- Font: **Heebo** via `next/font` in `src/app/layout.tsx` (not a Google CSS `@import`).
- Grid columns flow right-to-left; first DOM child lands in the right column.

## State Management

- Homepage project teasers remain static in `App.tsx`.
- News strip loads live rows from `site_updates` (`src/hooks/useSiteUpdates.ts`); see [PiplinesPage.md](./PiplinesPage.md) for the mandatory pipeline finish-hook.
- The **בחירות 2026** hero CTA routes to the `/elections` module documented in `Agents Instructions/ElectionsPage.md`.
- Knesset page uses `useKnessetMembers` hook with Supabase (see `Agents Instructions/KnessetPage.md`).

## Routing

- Next.js App Router + `next/link` (`href`), not `react-router-dom`
- `/` → homepage (`src/app/page.tsx` → `App.tsx`)
- `/elections` → Elections 2026 party index
- `/elections/[partyId]` → Elections 2026 party detail page
- `/elections/polls` → Mandate poll averages
- `/elections/lists` → Lists matching game
- `/government` → Government page
- `/knesset` → Knesset hemicycle page
- `/about` → About (footer link only)
- `/terms` → Terms of use (footer link only)

## Responsive Behavior

- **≤900px:** Homepage header is hidden. Hero collapses to a single centered column — bear video is hidden (`display: none` on `.hero__visual`); title logo is enlarged (`clamp(300px, 82vw, 480px)`), and subtitle/button grid are centered. Content capped at `--hero-text-max`. Project sections keep the desktop side-by-side layout (text RTL-start / right, media left); gap and type scale down. Container padding remains fluid via `clamp()`.
- **≤480px:** Hero buttons become single column; header height, logo, and date text scale down (non-home / desktop-style header).

## Future Work

- Wire remaining placeholder hero buttons to real routes.
- Restore the government dashboard homepage teaser (`SHOW_GOVERNMENT_DASHBOARD`) and replace its CSS placeholder with a final screenshot/asset.

## Verification

```bash
npm run lint
npm run build
```

# HomePage

> See [ProjectOverview.md](./ProjectOverview.md) for repo structure, tech stack, and shared conventions.

Homepage for **מצב האומה** (State of the Nation). RTL Hebrew layout with four visible sections.

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
│  Project: דשבורד ממשלה (white, full-bleed)             │
│    └─ .container — 2-col grid: text | dashboard preview │
├─────────────────────────────────────────────────────────┤
│  Footer (blue, full-bleed) — logo + social + copyright│
│    └─ .container — 3-column grid                      │
└─────────────────────────────────────────────────────────┘
```

## Files

| File | Role |
|------|------|
| `src/App.tsx` | Section markup and static content arrays |
| `src/main.tsx` | React Router — `/` homepage, `/elections` Elections page, `/elections/:partyId` party detail page, `/government` Government page, `/knesset` Knesset page |
| `src/components/SiteHeader.tsx` | Shared header with logo link home, Israel-time Hebrew-numeral/civil date labels, and current government/Knesset context |
| `src/components/SiteFooter.tsx` | Shared footer (primary blue background) |
| `src/components/SiteLayout.tsx` | Wraps header, page content, and footer on all routes |
| `src/App.css` | `.container` primitive and section-specific styles |
| `src/index.css` | Global reset, CSS variables, Heebo font |
| `index.html` | `lang="he"`, `dir="rtl"`, page title |
| `public/header-logo 3.svg` | Header logo |
| `public/white logo.svg` | White footer logo |
| `public/hero-bear-image.svg` | Hero bear illustration |

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

Applied on: `site-header__inner`, `hero__inner`, `project-section__inner`, `site-footer__inner`.

## Design tokens

| Token | Value | Purpose |
|-------|-------|---------|
| `--container-max` | `1120px` | Max width of centered content shell |
| `--container-pad` | `clamp(20px, 6vw, 80px)` | Fluid horizontal inset on both sides |
| `--hero-text-max` | `460px` | Inner cap for hero title/subtitle/buttons |

## Sections

### 1. Header (`site-header`)

- White full-bleed background with bottom border.
- Inner wrapper (`site-header__inner container`): logo at RTL start (top-right), metadata block at the opposite side.
- Logo path: `/header-logo%203.svg` (URL-encoded space in filename).
- Date block: client-side `Intl.DateTimeFormat` using `Asia/Jerusalem`; Gregorian label is `DD.MM.YYYY`, Hebrew label uses `he-IL-u-ca-hebrew` civil-day behavior and formats day/year as Hebrew numerals (for example `י״ח בתמוז תשפ״ו`).
- Context line below the date is static copy: `ממשלת ישראל ה37 | הכנסת ה25`.

### 2. Hero (`hero`)

- Blue background (`--color-blue: #4890FD`).
- Taller section: `min-height: clamp(460px, 64vh, 600px)` with `48px` vertical padding.
- `.hero__inner.container`: balanced `1fr 1fr` grid. DOM order is content first, visual second — in RTL this places text on the right and bear on the left.
- Text column: `align-items: flex-start` (RTL right-aligned), capped at `--hero-text-max`, `justify-self: end` (faces toward center). Column `gap: 16px` between title, subtitle, and nav; buttons add `12px` top margin so spacing below the subtitle stays unchanged.
- Bear column: `justify-content: flex-start` (faces toward center).
- **Title:** מצב האומה
- **Subtitle:** להבין מה באמת המצב של ישראל באמצעות טכנולוגיה
- **Nav buttons** (`HERO_BUTTONS` in `App.tsx`):

| Label | Destination |
|-------|--------|
| בחירות 2026 | `/elections` (route) |
| הממשלה | `/government` (route) |
| מיפוי סוגיות פוליטיות | `#political-issues` |
| הכנסת | `/knesset` (route) |

Buttons with `#` anchors are placeholders until dedicated routes exist. **בחירות 2026** links to the live Elections page, **הממשלה** links to the live Government page, and **הכנסת** links to the live Knesset hemicycle page.

### 3. News strip (`news-strip`)

- Black background, white text, blue dot separators.
- Full-bleed edge-to-edge (no `.container`) — intentional marquee effect.
- Headlines from `NEWS_ITEMS` in `App.tsx` (static placeholder copy).
- Dot separators (`.news-strip__item::after`) use equal `margin-inline: 24px` on both sides so each dot sits centered in the gap between two headlines.
- CSS marquee animation (`ticker` keyframes); disabled when `prefers-reduced-motion: reduce`.

### 4. Government Dashboard project (`#government-dashboard`)

- White section with title, description, and CTA **לדשבורד >>**.
- `.project-section__inner.container`: balanced `1fr 1fr` grid. DOM order is content first, preview second — text right, dashboard preview left in RTL.
- CTA links to `/government`.

### 5. Footer (`site-footer`)

- Blue background (`--color-blue: #4890FD`), white text.
- Full-bleed; inner wrapper (`site-footer__inner container`) uses a 3-column grid: white logo brand (RTL start), centered social links, copyright (RTL end).
- Footer logo path: `/white%20logo.svg` (URL-encoded space in filename).
- Social nav (`site-footer__social`): icon links to X, Instagram, and Facebook — icons from `public/icons.svg` (`x-icon`, `instagram-icon`, `facebook-icon`), opened in a new tab.
- URLs are defined in `SOCIAL_LINKS` at the top of `SiteFooter.tsx`.
- Rendered via `SiteLayout` on every page (homepage and Knesset).

## RTL & Typography

- `dir="rtl"` on `.site` via `SiteLayout` and on `<html>` in `index.html`.
- Font: **Heebo** (Google Fonts) via `index.css`.
- Grid columns flow right-to-left; first DOM child lands in the right column.

## State Management

- Homepage content is static arrays in `App.tsx`.
- The **בחירות 2026** hero CTA routes to the `/elections` module documented in `Agents Instructions/ElectionsPage.md`.
- Knesset page uses `useKnessetMembers` hook with Supabase (see `Agents Instructions/KnessetPage.md`).

## Routing

- `react-router-dom` in `src/main.tsx`
- `/` → homepage
- `/elections` → Elections 2026 party index
- `/elections/:partyId` → Elections 2026 party detail page
- `/government` → Government page
- `/knesset` → Knesset hemicycle page

## Responsive Behavior

- **≤900px:** Hero and project 2-col grids collapse to single column; container padding remains fluid via `clamp()`.
- **≤480px:** Hero buttons become single column; header height, logo, and date text scale down.

## Future Work

- Wire remaining placeholder hero buttons and dashboard CTA to real routes.
- Replace `NEWS_ITEMS` with live news feed API.
- Replace dashboard CSS placeholder with final dashboard screenshot/asset.
- Add remaining project sections below the first one.

## Verification

```bash
npm run lint
npm run build
```

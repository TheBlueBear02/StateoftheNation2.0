# Design Language

Project-wide visual guidance for agents creating or updating UI in **מצב האומה**.
Read this file before building new pages, shared components, cards, buttons, or page-level CSS.

## Visual Direction

- Keep the site clean, civic, and information-first.
- Default to a white, spacious interface with restrained blue accents.
- Avoid decorative complexity unless it directly improves comprehension.
- Prefer clear hierarchy, readable spacing, and strong alignment over visual ornament.
- The product is Hebrew and RTL-first; layouts should feel natural in RTL.

## Page And Section Backgrounds

- Page mains, heroes, and full-bleed sections use a flat white background (`var(--color-white)`).
- **Do not** add soft blue gradient washes on pages, heroes, or panels (e.g. `linear-gradient(... rgba(72, 144, 253, …) …)` fading into white).
- Blue is reserved for accents, CTAs, selected states, and links — not page-level atmospheric backgrounds.
- Adjacent panels may use `#fafafa` when a light neutral surface is needed; keep it flat (no blue tint gradient).

## Color Palette

Use the existing CSS variables in `src/index.css` whenever possible.

| Token | Hex | Use |
|-------|-----|-----|
| `--color-blue` | `#4890fd` | Primary brand accent, key CTA backgrounds, selected states |
| `--color-blue-dark` | `#3b7ae6` | Hover/active blue, emphasized links, stronger selected states |
| `--color-white` | `#ffffff` | Page backgrounds, card surfaces, content panels |
| `--color-black` | `#0a0a0a` | Rare high-contrast graphic details |
| `--color-text` | `#1a1a1a` | Primary text |
| `--color-text-muted` | `#4a4a4a` | Secondary text, helper copy, metadata |
| `--color-border` | `#1a1a1a` | High-contrast borders when a strong frame is required |
| `--color-alert` | `#e74c3c` | Error, warning, alert, or negative state |

Approved neutral tints:

| Value | Use |
|-------|-----|
| `#fafafa` | Very light section/sidebar background |
| `#f6f8fa` | Code blocks or technical documentation surfaces |
| `rgba(0, 0, 0, 0.06)` | Subtle dividers |
| `rgba(0, 0, 0, 0.08)` | Standard light borders |
| `rgba(72, 144, 253, 0.10)` / `0.12` | Soft blue status/selected backgrounds |

## Shape Rules

- New cards and buttons must use **no border radius**.
- Prefer square corners: `border-radius: 0`.
- Do not introduce pill buttons, rounded cards, rounded panels, or rounded badges in new UI.
- If an existing component already has rounded corners, do not refactor it only for this rule unless the user asks for a site-wide cleanup.
- If modifying an existing rounded component for functional reasons, consider removing the radius only when it is local, low-risk, and visually consistent with the surrounding page.

## Page Breadcrumb (required on new pages)

Every new content page under a section must open with the shared **page breadcrumb** (“URL path”) at the top of the page content — RTL start / visual top-right in the content column.

**Component:** `src/components/PageBreadcrumb.tsx` (+ `PageBreadcrumb.css`)

### Pattern

```
Parent section / Current page
Parent section / Section page / Current item
```

- Ancestor segments are **links** (`to`) using `--color-blue-dark`.
- The current leaf is plain muted text (no link).
- Separator is ` / ` (spaces around the slash).
- Place it above the page `<h1>` / hero title (or as the sole top chrome when the title is visually hidden).
- Do **not** invent a separate back-link row when the breadcrumb already links to the parent.

### Examples in the product

| Page | Breadcrumb |
|------|------------|
| `/elections/polls` | `בחירות 2026` → `/elections` / סקרי מנדטים |
| `/elections/lists` | `בחירות 2026` → `/elections` / `משחק הרשימות` → `/elections/lists` |
| `/elections/lists` (party selected) | … / משחק הרשימות / {party} |
| `/elections/:partyId` | `בחירות 2026` → `/elections` / {party} |
| `/piplines` | `צינורות נתונים` |
| `/piplines/docs/{id}` | `צינורות נתונים` → `/piplines` / תיעוד |
| `/about` | `אודות` |
| `/terms` | `תנאי שימוש` |

### Usage

```tsx
import { PageBreadcrumb } from '../components/PageBreadcrumb'

<PageBreadcrumb
  items={[
    { label: 'בחירות 2026', to: '/elections' },
    { label: 'שם העמוד' },
  ]}
/>
```

Optional `onClick` on a linked item is allowed when staying on the same route but resetting client state (e.g. returning from a sub-step to a picker).

### Agent rule

When creating a **new page**, always include `PageBreadcrumb` with at least the parent section link and the current page label. Prefer this component over one-off eyebrow markup.

## Typography

- Use the global Heebo stack from `--font-sans`.
- Heebo is loaded with `next/font` in `src/app/layout.tsx`; prefer `next/image` for new images; see [SeoAndWebStandards.md](./SeoAndWebStandards.md).
- Keep headings bold and direct.
- Prefer short explanatory copy over dense paragraphs.
- Use muted text for context, metadata, and helper descriptions.
- Technical blocks may use a monospace stack and `direction: ltr` for code, commands, and URLs.

## Buttons And Links

- Buttons should be simple, rectangular, and high-contrast.
- Primary actions may use `--color-blue`; hover/active states may use `--color-blue-dark`.
- Secondary actions should usually be text links or white buttons with a thin border.
- Do not add shadows, gradients, or rounded corners to buttons by default.
- Make clickable targets comfortable on touch screens.
- For RTL native selects, remove native appearance and use a custom arrow inset from the physical left edge; reserve extra `padding-inline-end` so labels do not overlap the arrow.

## Cards And Panels

- Cards should be rectangular with square corners.
- Prefer subtle borders over heavy shadows.
- Use whitespace, dividers, and typography to group information.
- Avoid nested card stacks unless the data hierarchy requires it.
- Keep card backgrounds white; use `#fafafa` sparingly for adjacent panels or sidebars.

## Tables, Docs, And Data Pages

- Tables should be readable before decorative.
- Use light dividers, clear headers, and enough padding for Hebrew text.
- Documentation pages should look like clean project documentation: sidebar navigation, main content column, code blocks where useful.
- Code blocks should use a light technical surface (`#f6f8fa`), square corners, and LTR direction.

## Motion And Accessibility

- Respect `prefers-reduced-motion`.
- Do not rely on animation to explain data.
- Maintain strong text contrast.
- Ensure focus states are visible.
- Use semantic HTML before custom ARIA.

## Agent Checklist

Before finishing a UI change:

- Confirm new cards/buttons have `border-radius: 0`.
- Confirm page/hero backgrounds are flat white (no soft blue gradient washes).
- Confirm colors come from the approved palette or a justified local neutral.
- Confirm new content pages include `PageBreadcrumb` (`Parent / Current`).
- Confirm the layout works in RTL and mobile widths.
- Confirm affected agent docs are updated.

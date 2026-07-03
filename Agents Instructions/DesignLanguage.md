# Design Language

Project-wide visual guidance for agents creating or updating UI in **מצב האומה**.
Read this file before building new pages, shared components, cards, buttons, or page-level CSS.

## Visual Direction

- Keep the site clean, civic, and information-first.
- Default to a white, spacious interface with restrained blue accents.
- Avoid decorative complexity unless it directly improves comprehension.
- Prefer clear hierarchy, readable spacing, and strong alignment over visual ornament.
- The product is Hebrew and RTL-first; layouts should feel natural in RTL.

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

## Layout

- Use `.container` for standard centered page content unless a page needs a dedicated docs/dashboard layout.
- Keep full-page sections generous and uncluttered.
- Use clear two-column layouts for documentation, dashboards, and detail pages when helpful.
- For RTL pages, the primary reading/content column should feel dominant on the right unless the page pattern clearly calls for another structure.
- Preserve responsive behavior: single-column layout on narrow screens, with navigation stacked above content when needed.

## Typography

- Use the global Heebo stack from `--font-sans`.
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
- Confirm colors come from the approved palette or a justified local neutral.
- Confirm the layout works in RTL and mobile widths.
- Confirm affected agent docs are updated.

# Timeline Page — ציר זמן

Full-screen Israeli history timeline told through key figures’ life events, plus state-level events. Route: `/timeline`.

> See [ProjectOverview.md](./ProjectOverview.md) for stack and conventions.

## Purpose

Show overlapping political biographies on a shared time axis so users can see personal careers and national events together. Data is JSON-only (no Supabase) for the first version.

## Layout

- **No `SiteLayout`** — the page is `100vw × 100dvh`, fixed, with its own chrome.
- **Top chrome:** home link → `/`, title “ציר זמן”, zoom controls (`+`, `−`, הצג הכל).
- **Left column:** portraits (or a flag badge for state events), one per row. Click toggles visibility (grayscale + collapsed row when hidden).
- **Main canvas:** horizontal rows (state on top, then people in computed order). Events are absolutely positioned blocks.
- **Bottom axis:** black line with year labels, left → right (`dir="ltr"` on the timeline body; Hebrew text stays RTL).

## Files

| File | Role |
|------|------|
| `src/app/timeline/page.tsx` | Route + metadata; loads JSON via `loadTimelineData()` |
| `src/views/TimelinePage.tsx` | Client shell: toggles, viewport, layout |
| `src/views/TimelinePage.css` | Full-screen styles (square corners) |
| `src/content/timeline/types.ts` | `Person`, `TimelineEvent`, `SharedEvent`, `LaidOutEvent` |
| `src/content/timeline/people/*.json` | One file per person + their solo events |
| `src/content/timeline/state-events.json` | National events |
| `src/content/timeline/shared-events.json` | Events with `personIds` (length ≥ 2) |
| `src/content/timeline/index.ts` | Static imports + validation → `loadTimelineData()` |
| `src/lib/timeline/dates.ts` | Partial dates → fractional years |
| `src/lib/timeline/layout.ts` | `orderRows`, `buildRows`, `assignLanes`, `computeDataRange` |
| `src/lib/timeline/ticks.ts` | Adaptive year tick step |
| `src/hooks/useTimelineViewport.ts` | Fit / zoom / pan / pinch |
| `src/components/timeline/*` | Canvas, EventBlock, PortraitColumn, YearAxis, EventModal, ZoomControls |
| `public/timeline/portraits/*.svg` | Placeholder drawn portraits |

## JSON schema

### Person (`people/{id}.json`)

```json
{
  "id": "ben-gurion",
  "name": "דוד בן-גוריון",
  "nameEn": "David Ben-Gurion",
  "color": "#1e5aa8",
  "portrait": "/timeline/portraits/ben-gurion.svg",
  "birthDate": "1886-10-16",
  "deathDate": "1973-12-01",
  "events": [ /* TimelineEvent[] */ ]
}
```

### Event

| Field | Required | Notes |
|-------|----------|-------|
| `id` | yes | Unique across all people / state / shared |
| `title` | yes | Hebrew |
| `description` | yes | Short Hebrew copy |
| `image` | no | Path under `/public` |
| `startDate` | yes | `"1948"`, `"1948-05"`, or `"1948-05-14"` |
| `endDate` | no | Same formats; omit for point events (min visual width ~0.25 year) |
| `location` | no | `{ name, lat?, lng? }` |

### Shared event

Same as event plus `personIds: string[]` (at least 2 valid person ids).

## How to add content

1. Add a portrait under `public/timeline/portraits/`.
2. Create `src/content/timeline/people/{id}.json`.
3. Import it in `src/content/timeline/index.ts` and append to the `people` array.
4. Add state / shared events to the corresponding JSON files.
5. Run the app — `loadTimelineData()` throws on duplicate ids, bad dates, or unknown `personIds`.

## Layout rules

- **Row order:** birth-year order, then reorder so shared-event participants are contiguous (brute-force ≤8 people; greedy neighbor swaps otherwise). Order stays fixed when toggling visibility.
- **Collapsed rows:** hidden people/state keep a short row so portraits stay aligned; events for them are omitted.
- **Lanes:** overlapping events in a row get sub-lanes; a shared block uses the same lane index across all covered rows.
- **Shared blocks:** one tall striped block from the top participant row to the bottom participant row (including rows in between).
- **State color:** `#0038b8` (`STATE_COLOR`).

## Viewport

- Starts fitted to the full data range (+ padding) — “show all”.
- Wheel zooms around cursor; drag pans; two-finger pinch zooms on touch.
- Min span ≈ 1 month; max span = full data range.
- Year tick step adapts (1 / 2 / 5 / 10 / 25 / …) from pixels-per-year.

## Interaction

- Hover: native `title` tooltip (title + dates).
- Click event: modal with image (or color placeholder), kind label, title, dates, location, description, participant portraits.
- Modal closes on Esc or backdrop click.
- Portrait click: toggle that row’s events.

## SEO

- Metadata title “ציר זמן”, canonical `/timeline`.
- Listed in `src/app/sitemap.ts`.
- Homepage hero button links to `/timeline`.

## Seed people

Ben-Gurion, Golda Meir, Menachem Begin, Yitzhak Rabin — plus state events (independence, wars, peace agreements) and a few shared events.

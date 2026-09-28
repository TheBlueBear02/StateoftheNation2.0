# Timeline Page — ציר זמן

Full-screen Israeli history timeline told through key figures’ life events, plus state-level events. Route: `/timeline`.

> See [ProjectOverview.md](./ProjectOverview.md) for stack and conventions.

## Purpose

Show overlapping political biographies on a shared time axis so users can see personal careers and national events together. Data is JSON-only (no Supabase) for the first version.

## Layout

- **No `SiteLayout`** — the page is `100vw × 100dvh`, fixed, with its own chrome.
- **Top chrome:** zoom controls on the **left**, title “בזכותם | ציר זמן למדינת ישראל” + subtitle centered, site logo (links home) on the **right**.
- **Left column:** portrait / state filters for entities that have at least one event intersecting the **current viewport** (zoom/pan). Only people with a **PNG** portrait appear (SVG placeholders are hidden entirely, including their solo events). People with no events in the visible window are omitted from the bar. Click toggles visibility (grayscale when hidden). Toggle state is kept when they leave/re-enter the view.
- **Era band (top of canvas):** a single row of non-overlapping colored era blocks (`name`, `startDate`, `endDate`, `color`). Clicking an era zooms the viewport to that era’s range.
- **Main canvas (below eras):** a **shared pool of horizontal event layers** (default 16). Any person’s or state’s events can sit on any layer; visual min-width collisions force a different layer. The track has a faint Tel Aviv 1950s line-drawing background (`/timeline/timeline-bg-telaviv50s.jpg`, 5% opacity, centered).
- **Bottom axis:** black line with year labels, left → right (`dir="ltr"` on the timeline body; Hebrew text stays RTL).

## Files

| File | Role |
|------|------|
| `src/app/timeline/page.tsx` | Route + metadata; loads JSON via `loadTimelineData()` |
| `src/app/timeline/edit/page.tsx` | Edit route (dev-only 404 in production); loads JSON into `TimelineEditPage` |
| `src/app/api/timeline/events/route.ts` | Persist upsert/delete into timeline JSON files |
| `src/app/api/timeline/geocode/route.ts` | Nominatim lookup for city/country → lat/lng |
| `src/views/TimelinePage.tsx` | Client shell: toggles, viewport, layout |
| `src/views/TimelineEditPage.tsx` | Edit shell: mutable data, add/edit form, save API |
| `src/views/TimelinePage.css` | Full-screen styles; event blocks use light rounding + subtle texture; track uses low-opacity Tel Aviv 1950s sketch bg |
| `src/content/timeline/types.ts` | `Person`, `TimelineEvent`, `SharedEvent`, `TimelineEra`, `LaidOutEvent` |
| `src/content/timeline/people/*.json` | One file per person + their solo events |
| `src/content/timeline/state-events.json` | National events |
| `src/content/timeline/shared-events.json` | Events with `personIds` (length ≥ 2) |
| `src/content/timeline/eras.json` | Contiguous eras for the top band |
| `src/content/timeline/index.ts` | Static imports + validation → `loadTimelineData()` |
| `src/lib/timeline/dates.ts` | Partial dates → fractional years |
| `src/lib/timeline/layout.ts` | Layout helpers + `EVENT_*` / `ERA_BAND_HEIGHT` constants |
| `src/lib/timeline/validate.ts` | Shared event/person/era validation |
| `src/lib/timeline/persistEvent.ts` | Server JSON write helpers for the edit API |
| `src/lib/timeline/mutateData.ts` | Client-side data patch + `saveTimelineEventApi` |
| `src/lib/timeline/ticks.ts` | Adaptive year tick step |
| `src/hooks/useTimelineViewport.ts` | Fit / zoom / pan / pinch / `zoomToRange` |
| `src/components/timeline/*` | Canvas, EraBand, EventBlock, PortraitColumn, YearAxis, EventModal, EventMap, EventEditForm, EventMediaPanel, ZoomControls |
| `public/timeline/portraits/*.svg` | Placeholder drawn portraits |

## JSON schema

### Person (`people/{id}.json`)

```json
{
  "id": "ben-gurion",
  "name": "דוד בן-גוריון",
  "nameEn": "David Ben-Gurion",
  "color": "#1e5aa8",
  "portrait": "/timeline/portraits/ben-gurion.png",
  "birthDate": "1886-10-16",
  "deathDate": "1973-12-01",
  "events": [ /* TimelineEvent[] */ ]
}
```

Portrait paths are public URLs under `/timeline/portraits/`. The public timeline (`peopleWithPngPortraits`) only shows people whose `portrait` ends in `.png`; SVG placeholders stay in JSON for editing but are omitted from the canvas and portrait bar. The left sidebar only lists people/state with events in the current viewport.
### Event

| Field | Required | Notes |
|-------|----------|-------|
| `id` | yes | Unique across all people / state / shared |
| `title` | yes | Hebrew |
| `description` | yes | Short Hebrew copy |
| `image` | no | Path/URL for the modal image panel |
| `video` | no | Video URL (direct file or YouTube); preferred over `image` when set |
| `startDate` | yes | Stored as `"1948"`, `"1948-05"`, or `"1948-05-14"`; shown/edited as `1948` / `05.1948` / `14.05.1948` |
| `endDate` | no | Same formats; omit for point events (min visual width ~0.25 year) |
| `location` | no | `{ name, country?, lat?, lng? }` — include both `lat`/`lng` (WGS84) to show the modal map |

### Location

```json
"location": { "name": "תל אביב", "country": "ישראל", "lat": 32.085, "lng": 34.781 }
```

If `lat` or `lng` is set, both are required and validated. The event modal shows a light gray Esri basemap (no API key) via Leaflet, pinned to those coordinates with a permanent place label (`עיר, מדינה` when `country` is set). Without coords, a dashed map placeholder is shown.

### Shared event

Same as event plus `personIds: string[]` (at least 2 valid person ids). Rendered as one block on a single layer with striped participant colors.

### Era (`eras.json`)

| Field | Required | Notes |
|-------|----------|-------|
| `id` | yes | Unique |
| `name` | yes | Hebrew label shown on the band |
| `startDate` | yes | Partial date |
| `endDate` | yes | Partial date; must be ≥ start |
| `color` | yes | CSS color for the block |

**Constraint:** eras must not overlap (only one era at a time). Gaps between eras are allowed. Validated in `loadTimelineData()`.

## How to add content

1. Add a **PNG** portrait under `public/timeline/portraits/` (SVG placeholders will not appear on the public timeline).
2. Create `src/content/timeline/people/{id}.json` and set `"portrait"` to that public path (e.g. `/timeline/portraits/ben-gurion.png`).
3. Import it in `src/content/timeline/index.ts` and append to the `people` array.
4. Add state / shared events / eras to the corresponding JSON files.
5. Run the app — `loadTimelineData()` throws on duplicate ids, bad dates, overlapping eras, or unknown `personIds`.

## Layout rules

- **Era band:** fixed height `ERA_BAND_HEIGHT` (32px) at the top of the canvas, then `ERA_TO_EVENTS_GAP` (10px) before event layers start. Era blocks use the same lightly lifted color + aged paper grain as event blocks.
- **Shared layers:** pack from the **middle** layer outward (`middleOutLaneOrder`). Same-person events prefer that person's existing lanes, then neighboring layers (`personClusterLaneOrder`); shared events pull toward any participant cluster. State events use middle-out only. Earliest start first; no *visual* overlap. Overflow grows downward past `EVENT_LAYER_COUNT`.
- **Layer count:** at least `EVENT_LAYER_COUNT` (16). Grows only if more concurrent overlaps are needed.
- **Compact blocks:** each layer is a fixed slot (`EVENT_BLOCK_HEIGHT` 36px + `EVENT_LAYER_GAP` 16px top/bottom margin), packed from the top under the era band. Blocks keep person colors, lightly lifted toward white (~18%), with an aged paper grain + warm wash texture and a soft drop shadow.
- **Min click width:** event blocks are at least `MIN_EVENT_WIDTH_PX` (28px) wide. Lane packing expands each event’s collision span to that min width plus `EVENT_H_GAP_PX` (3px) at the current zoom, so nearby short events that would touch move to different layers. Drawn blocks also leave that horizontal gap on the same layer. Re-packs on zoom/pan.
- **No person rows on the canvas:** portraits are filters only; event color still encodes who the event belongs to.
- **Portrait order:** birth-year order, with shared-event participants kept near each other when cheap (≤8 people).
- **Portrait bar (viewport-aware):** only people/state with events overlapping `[viewStart, viewEnd]` appear. Solo and shared events both count. Zooming/panning updates the bar live.
- **Filters:** hiding a person/state removes their events and re-packs remaining events into layers. Cannot hide the last entity that still has events in the current view.
- **PNG-only people:** `peopleWithPngPortraits` filters the public/edit canvas so people with non-PNG portraits (e.g. Begin, Rabin with `.svg`) and their solo events are hidden. Shared events still appear if at least one remaining PNG participant is visible.
- **Event media:** state color `#0038b8` (`STATE_COLOR`) with emblem `STATE_EMBLEM` (`/timeline/israel-logo.png`); person/shared blocks use participant **PNG** portraits. Media sits on the left when the full title fits, otherwise centered with title hidden. Portraits render as plain images (no circular white frame).

## Viewport

- Starts fitted to the full data range (+ padding), including era bounds — “show all”.
- Wheel zooms around cursor; drag pans; two-finger pinch zooms on touch.
- Clicking an era calls `zoomToRange` for that era’s year span (small padding, clamped to data bounds).
- Min span ≈ 1 month; max span = full data range.
- Year tick step adapts (1 / 2 / 5 / 10 / 25 / …) from pixels-per-year.

## Interaction

- Hover: native `title` tooltip (title + dates).
- Click event: modal with left media panel (video if `video` is set — YouTube embed or `<video>` — else image or “תמונה” placeholder), right column for person+title, dates, description (`white-space: pre-wrap` so newlines/tabs are kept), and a light gray map under the text (Esri/Leaflet when `location.lat`/`lng` exist; otherwise placeholder).
- Modal footer: centered text prev/next titles with chevron heads (‹ ›) for that person’s chronological sequence (solo + shared) or state events; ArrowLeft/ArrowRight also navigate; missing side shows a spacer.
- Desktop (`min-width: 900px`): two-column grid — tall image column left (~42%), text + map column right (~58%); mobile stacks image above content.
- Click era: zoom timeline to that era only.
- Modal closes on Esc or backdrop click (fade/scale exit before unmount).
- Modal open/close: backdrop fade + panel scale/slide. Respects `prefers-reduced-motion`.
- Portrait click: toggle that person’s (or state’s) events on the shared layers. Portraits only appear when they have events in the current zoom window.

## Edit mode (`/timeline/edit`)

- **Local development only** (`NODE_ENV === 'development'`). On production the route returns 404; write/geocode APIs are blocked the same way.
- Edit page loads JSON **from disk** each request (`loadTimelineDataFromDisk`) so saves are not lost to webpack-cached imports.
- Same canvas/chrome as the public timeline, plus **הוסף אירוע** and a link back to `/timeline`.
- Clicking an event opens `EventEditForm` (title, description, dates, person checkboxes, location, image URL, video URL). **חשב קואורדינטות** geocodes city+country via Nominatim with Hebrew→English country fallbacks (`GET /api/timeline/geocode`) and fills lat/lng.
- Unsaved form drafts are kept in `localStorage` when the form is closed or fields change; reopening Add / the same event restores them. Successful save/delete clears the draft. New-event person checkboxes default to the last saved selection.
- 0 people → state event; 1 → person file; 2+ → shared event. Save/Delete call `POST /api/timeline/events` and update local state.
- API writes JSON under `src/content/timeline/`.
- Route is `noindex`.

## SEO

- Metadata title “בזכותם | ציר זמן למדינת ישראל”, canonical `/timeline`.
- Listed in `src/app/sitemap.ts`.
- Homepage hero button links to `/timeline`.

## Seed people

Ben-Gurion, Golda Meir, Menachem Begin, Yitzhak Rabin, Theodor Herzl, Chaim Weizmann, Ze'ev Jabotinsky — plus state events (independence, wars, peace agreements), shared events, and eras (העלייה הראשונה → … → החמישית → שנות היסוד → אחרי ששת הימים → עידן המהפך → תהליך אוסלו). Gaps are intentional (e.g. WWI between העלייה השנייה and השלישית; 1940–1948 before independence).

# KnessetPage

Hemicycle visualization of all **120 current Knesset members** (Knesset 25), arranged on a fixed **19×14 parliament grid** with coalition on the left and opposition on the right.

Route: `/knesset`

## Page Structure

```
┌─────────────────────────────────────────────────────────┐
│  Header (shared SiteHeader)                             │
├─────────────────────────────────────────────────────────┤
│  Title + subtitle                                       │
│  KnessetHemicycle (single responsive SVG)               │
│    ├─ 120 MKDot circles                                 │
│    └─ CenterCounter (donut + coalition/opposition)      │
│  Error message (if fetch fails)                         │
│  FactionList (party cards: name + seats + MK photos)    │
└─────────────────────────────────────────────────────────┘
│  Tooltip (desktop only, HTML overlay)                   │
└─────────────────────────────────────────────────────────┘
```

## Files

| File | Role |
|------|------|
| `src/pages/KnessetPage.tsx` | Page shell, title, error state |
| `src/pages/KnessetPage.css` | Hemicycle, tooltip, MK dot styles |
| `src/components/knesset/KnessetHemicycle.tsx` | SVG container, hover state |
| `src/components/knesset/MKDot.tsx` | Individual MK circle (photo/initials) |
| `src/components/knesset/CenterCounter.tsx` | Donut ring + coalition/opposition counts |
| `src/components/knesset/Tooltip.tsx` | Desktop-only floating tooltip |
| `src/components/knesset/FactionList.tsx` | Party cards below the hemicycle (name, seat count, MK photo circles) |
| `src/hooks/useKnessetMembers.ts` | Supabase fetch + derived counts + `factionGroups` |
| `src/lib/hemicycle.ts` | Seat positions + bloc assignment math + `buildFactionGroups` |
| `src/lib/supabase.ts` | Supabase client + types |
| `src/components/SiteHeader.tsx` | Shared header (logo links home) |
| `knesset-db-scripts/fix_faction_links.py` | One-time backfill for `faction_id` links |

## Data Layer

### Tables

- `knesset_memberships` — one row per MK per Knesset; filter `end_date IS NULL` for current members
- `knesset_factions` — party name, `color`, `is_coalition`
- `people` — `full_name`, `image_url`

### Query (on mount, once)

```ts
supabase
  .from('knesset_memberships')
  .select('id, faction_id, person:people(full_name, image_url), faction:knesset_factions(name, color, is_coalition)')
  .eq('knesset_id', 26)
  .is('end_date', null)
  .order('faction_id')
```

### Derived client-side

- `coalitionCount` — members where `faction.is_coalition === true`
- `oppositionCount` — the rest
- Faction bloc order — coalition factions first (by seat count desc), then opposition (by seat count desc)
- `factionGroups` — same grouped/sorted structure (`buildFactionGroups`), consumed by `FactionList`

### Prerequisite backfill

Before the page shows colored faction groups, run:

```bash
python knesset-db-scripts/fix_faction_links.py
```

This links `knesset_memberships.faction_id` for all 120 current MKs via oknesset CSV data. Coalition/opposition is read from `knesset_factions.is_coalition` (not copied to membership rows).

## Parliament Grid Layout

### Grid mask (19 × 14)

Fixed `SEAT_GRID` in `src/lib/hemicycle.ts`: 14 rows × 19 columns. Each cell is `'X'` (seat) or `'.'` (empty).

- **Left wing** — columns 0–3, tapered at top-left (corner aisle)
- **Top arc** — rows 0–3, columns 4–14, narrowing toward center
- **Right wing** — columns 15–18, tapered at top-right (corner aisle)
- **Center void** — rows 4–13, columns 4–14 (holds `CenterCounter`)
- **Total seats** — 120 (`'X'` cells)

```
Row  0: X...XXXXXXXXXXX...X
Row  1: XX...XXXXXXXXX...XX
Row  2: XXX...XXXXXXX...XXX
Row  3: XXXX...XXXXX...XXXX   ← top arc extends to 5 seats; wing inner cols connect
Row  4: XXXX...........XXXX
...
Row 10: XXX............XXXX   ← left inner col shortened at bottom
Row 12: XXX.............X.X   ← right 2nd-col shortened at bottom
Row 13: X.................X   ← outer bottom corners trimmed
```

### Positioning

- `CELL = 40` px spacing between grid centers
- `viewBox = "0 0 760 560"` (`19 × 40` by `14 × 40`)
- Seat at grid cell `(row, col)`: `x = col × CELL + CELL/2`, `y = row × CELL + CELL/2`
- `DOT_RADIUS = 16` (32px diameter at full scale)

### Bloc assignment

1. Group MKs by faction
2. Sort factions: coalition first, then by seat count descending; same for opposition
3. Order all 120 seats left-to-right (`x` asc) and split into two regions: the leftmost `coalitionCount` seats are the **coalition** side, the rest the **opposition** side (keeps coalition left / opposition right)
4. Within each side, order seats **cluster-first**: the physical wing (cols `0–3` left / `15–18` right) comes before the shared top arc (cols `4–14`). The **wing** fills **bottom-up in horizontal bands** — `y` descending (bottom rows first), then across the row (`x` asc left / `x` desc right). The **arc** fills **side-to-middle in vertical columns** — `x` from the outer edge toward the center (`x` asc left / `x` desc right), then `y` top-to-bottom
5. Fill each side sequentially by faction (largest first). Because the wing is one contiguous cluster filled before the arc, the **largest** faction lands on the **bottom** wing rows, smaller factions stack upward, and only leftover (small) factions spill into the arc — so factions stay contiguous instead of one straddling the wing↔arc aisle
6. Each faction reads as a horizontal band; wings visually build from the bottom up

## Component Specs

### MKDot

- ~32px diameter on desktop (`DOT_RADIUS = 16`, scales via SVG viewBox on mobile)
- Border: `2.5px solid faction.color` (grey when unknown)
- Interior: clipped `<image>` when `image_url` exists
- Fallback: initials on 20% tint of faction color
- Desktop hover: scale 1.15×, triggers tooltip
- Mobile: no hover, no tooltip

### CenterCounter

- White circle + drop shadow at grid center (`width/2`, `height/2 + 8`)
- SVG donut ring: coalition `#4890fd`, opposition `#ff6200`
- Text: `{coalition} / {opposition}` over `{120}`
- Label below donut: **הכנסת**

### Tooltip (desktop ≥768px)

- Shared component used by both the hemicycle (`MKDot`) and `FactionList` circles
- Props: `fullName`, `factionName`, `factionColor`, `x`, `y` (not the full `PlacedMember`)
- Single fixed-position HTML `<div>` at cursor + offset
- Line 1: colored dot + faction name
- Line 2: MK full name
- `border-radius: 0` (square), `pointer-events: none`, hidden below 768px

### FactionList

- HTML (non-SVG) vertical stack of factions below the hemicycle — no cards, plain white background, one faction under the other
- Order matches `factionGroups` (coalition first, then by seat count desc)
- Name swatch tinted with `faction.color` (grey fallback); header divided by a thin bottom border
- Header: faction name (title) + seat count (`מנדט אחד` / `{n} מנדטים`)
- Body: one large circle per MK (`clamp(60px, 9vw, 76px)`) — cover-fit `image_url` photo, or initials on 20% color tint when no photo
- Hovering a circle shows the shared `Tooltip` (faction name + MK name) at the cursor
- Loading: 6 skeleton blocks; hidden entirely on fetch error

## State Management

| State | Source |
|-------|--------|
| `members`, counts | `useKnessetMembers` hook |
| `hoveredMember`, tooltip position | `KnessetHemicycle` local state |
| Loading | 120 grey skeleton dots in final positions |
| Error | Hebrew message: `לא ניתן לטעון את נתוני הכנסת` |

## Env / Supabase Client

Vite reads from [.env](../.env):

| Variable | Used by |
|----------|---------|
| `SUPABASE_URL` | Mapped to `VITE_SUPABASE_URL` via `vite.config.ts` |
| `VITE_SUPABASE_ANON_KEY` | React client (public anon key — **not** the service role key) |
| `SUPABASE_SERVICE_KEY` | Python scripts only |

## Responsive Behavior

- Single `<svg viewBox="0 0 760 560" width="100%">` — full viewport width on desktop; on mobile (`≤767px`) `.knesset-hemicycle` uses `padding-inline: var(--container-pad)` to match the faction list below
- Header and faction list remain inside `.container` with standard page padding
- SVG centered; dots shrink proportionally on narrow screens
- Tooltip hidden below 768px (`@media (max-width: 767px)`)

## Routing

- `react-router-dom` in `src/main.tsx`
- `/` → homepage (`App.tsx`)
- `/knesset` → `KnessetPage`
- Homepage hero nav includes **הכנסת** → `/knesset`

## Verification

```bash
python knesset-db-scripts/fix_faction_links.py   # if faction_id not yet linked
npm run lint
npm run build
npm run dev   # visit /knesset
```

Ensure `VITE_SUPABASE_ANON_KEY` is set in `.env` before testing live data.

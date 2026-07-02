# KnessetPage

Hemicycle visualization of Knesset members for any selected term, arranged on a fixed **19×14 parliament grid**. When coalition data exists for the selected term, seats split coalition (left) vs opposition (right); otherwise factions fill the chamber left-to-right by size.

Route: `/knesset`

## Page Structure

```
┌─────────────────────────────────────────────────────────┐
│  Header (shared SiteHeader)                             │
├─────────────────────────────────────────────────────────┤
│  Title (selected Knesset) + Knesset picker dropdown     │
│  KnessetHemicycle (single responsive SVG)               │
│    ├─ 120 MKDot circles                                 │
│    └─ CenterCounter (split donut OR neutral total)      │
│  Error message (if fetch fails)                         │
│  FactionList (party cards: name + seats + MK photos)    │
│    └─ Sort selector (default: by party)                 │
└─────────────────────────────────────────────────────────┘
│  Tooltip (desktop only, HTML overlay)                   │
└─────────────────────────────────────────────────────────┘
```

## Files

| File | Role |
|------|------|
| `src/pages/KnessetPage.tsx` | Page shell, Knesset picker, title, error state |
| `src/pages/KnessetPage.css` | Hemicycle, picker, tooltip, MK dot styles |
| `src/components/knesset/KnessetHemicycle.tsx` | SVG container, hover state |
| `src/components/knesset/MKDot.tsx` | Individual MK circle (photo/initials) |
| `src/components/knesset/CenterCounter.tsx` | Donut ring (coalition/opposition) or neutral total count |
| `src/components/knesset/Tooltip.tsx` | Desktop-only floating tooltip |
| `src/components/knesset/FactionList.tsx` | Member list below the hemicycle with sort modes (party groups, flat sorted, bloc groups) |
| `src/hooks/useKnessetList.ts` | Loads all Knesset terms for the picker |
| `src/hooks/useKnessetMembers.ts` | Supabase fetch for selected term + derived counts + `factionGroups` |
| `src/lib/hemicycle.ts` | Seat positions, bloc/faction layout, `factionColorFromId` |
| `src/lib/memberSort.ts` | `MemberSortMode` type and Hebrew sort option labels |
| `src/lib/supabase.ts` | Supabase client + types (`KnessetOption`, etc.) |
| `src/components/SiteHeader.tsx` | Shared header (logo links home) |
| `knesset-db-scripts/fix_faction_links.py` | One-time backfill for `faction_id` links (current Knesset) |

## Knesset Picker

- Dropdown in the page header lists all rows from `knessets`, newest first.
- Title (`h1`): `הכנסת ה-{n}` via `formatKnessetTitle()`.
- Dropdown label: `הכנסת ה-{n} ({startYear}–{endYear})` via `formatKnessetLabel()`; active term uses `היום` when `end_date` is null.
- Default selection: `is_active = true`, else highest `knesset_number`.
- Changing the selection re-fetches members for that term.

## Data Layer

### Tables

- `knessets` — term metadata (`knesset_number`, `start_date`, `end_date`, `is_active`)
- `knesset_memberships` — one row per MK per Knesset term (may include mid-term replacements)
- `knesset_factions` — party `name`, optional `short_name`, optional `logo_url`, `color`, `is_coalition`
- `people` — `full_name`, `image_url`

### Queries

**1. Knesset list** (on mount, once)

```ts
supabase
  .from('knessets')
  .select('id, knesset_number, knesset_name, start_date, end_date, is_active')
  .order('knesset_number', { ascending: false })
```

**2. Term snapshot members** (when selected Knesset changes)

Reference date: `refDate = term.endDate ?? today` (ISO `YYYY-MM-DD`).

```ts
supabase
  .from('knesset_memberships')
  .select('id, person_id, faction_id, start_date, person:people(...), faction:knesset_factions(...), knesset:knessets(...)')
  .eq('knesset_id', term.id)
  .lte('start_date', refDate)
  .or(`end_date.is.null,end_date.gte.${refDate}`)
  .order('faction_id')
```

Client-side: dedupe by `person_id`, keeping the row with the latest `start_date` (final-composition snapshot, ~120 seats).

**3. Cumulative tenure rows** (for all `person_id`s from query 2)

```ts
supabase
  .from('knesset_memberships')
  .select('person_id, start_date, end_date, knesset:knessets(knesset_number)')
  .in('person_id', personIds)
```

### Derived client-side

- `factionName` — `short_name` when present, otherwise `name`
- `factionColor` — DB `color` when set (non-empty), else stable hash from `faction_id` via `resolveFactionColor()` / `factionColorFromId()` (HSL); falls back to faction name hash when `faction_id` is null
- `hasCoalitionData` — `true` when any loaded member has `faction.is_coalition === true`
- `coalitionCount` / `oppositionCount` — only meaningful when `hasCoalitionData`
- Layout mode — `buildHemicycleLayout(..., { splitByBloc: hasCoalitionData })`
- Faction sort — coalition-first when `splitByBloc`, else by seat count desc only
- Per-MK tenure stats (`computeMemberTenureStats` in `src/lib/knessetTenure.ts`):
  - `knessetNumber`, `firstElectedYear`, `totalDaysInKnesset`, `totalYearsInKnesset`

### Coalition data (future)

Historical terms typically lack `knesset_factions.is_coalition`. Until backfilled:
- Hemicycle uses faction-only layout (no left/right bloc split)
- Center counter shows neutral ring + loaded member count
- `bloc` sort option is hidden in the member list

When coalition flags are added per faction per term, the page auto-detects them and restores the split layout + donut.

## Parliament Grid Layout

### Grid mask (19 × 14)

Fixed `SEAT_GRID` in `src/lib/hemicycle.ts`: 14 rows × 19 columns. Each cell is `'X'` (seat) or `'.'` (empty).

- **Total seats** — 120 (`'X'` cells)

### Bloc assignment (when `hasCoalitionData`)

1. Group MKs by faction
2. Sort factions: coalition first, then by seat count descending; same for opposition
3. Split seats left-to-right: leftmost `coalitionCount` seats = coalition, rest = opposition
4. Fill each side wing-first, bottom-up, keeping factions contiguous

### Faction-only assignment (when `!hasCoalitionData`)

1. Group MKs by faction, sort by seat count descending
2. Split factions into two halves by cumulative seat count (~50/50)
3. Fill left half with the same wing/arc ordering as coalition side; fill right half with opposition-side ordering (identical geometry to the current Knesset layout, without coalition labels)

## Component Specs

### MKDot

- Border: `2.5px solid factionColor` (DB color or hash-derived HSL)
- Interior: clipped `<image>` when `image_url` exists; else initials on 20% tint

### CenterCounter

- **With coalition data:** split donut (coalition `#4890fd`, opposition `#ff6200`), `{coalition} / {opposition}` over total
- **Without coalition data:** single neutral grey ring, loaded member count only, label **הכנסת**

### FactionList

- Section title: **חברי הכנסת ה-{n}** via `formatKnessetMembersTitle()` (updates with header picker)
- Sort options: `parties`, `tenure`, `name`, `firstElected`; `bloc` only when `hasCoalitionData`
- If user had `bloc` selected and switches to a term without coalition data, sort resets to `parties`

## State Management

| State | Source |
|-------|--------|
| `knessets` | `useKnessetList` hook |
| `selectedKnesset` | `KnessetPage` local state (defaults to active term) |
| `members`, counts, `hasCoalitionData`, `factionGroups` | `useKnessetMembers(selectedKnesset)` |
| `sortMode` | `KnessetPage` local state (`useState<MemberSortMode>('parties')`) |
| `hoveredMember`, tooltip position | `KnessetHemicycle` / `FactionList` local state |
| Loading | skeleton dots + faction skeletons while list or members load |
| Error | Hebrew message: `לא ניתן לטעון את נתוני הכנסת` |

## Verification

```bash
npm run lint
npm run build
npm run dev   # visit /knesset — switch Knesset terms in the header dropdown
```

Ensure `VITE_SUPABASE_ANON_KEY` is set in `.env` before testing live data.

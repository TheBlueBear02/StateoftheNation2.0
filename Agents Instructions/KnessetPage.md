# KnessetPage

> See [ProjectOverview.md](./ProjectOverview.md) for repo structure, tech stack, and data model.

Hemicycle visualization of Knesset members for any selected term, arranged on a fixed **17×15 parliament grid**. When coalition data exists for the selected term, seats split coalition (left) vs opposition (right); otherwise factions fill the chamber left-to-right by size.

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
├─────────────────────────────────────────────────────────┤
│  Footer (shared SiteFooter — blue + white logo)         │
└─────────────────────────────────────────────────────────┘
│  Tooltip (desktop only, HTML overlay)                   │
└─────────────────────────────────────────────────────────┘
```

## Files

| File | Role |
|------|------|
| `src/views/KnessetPage.tsx` | Page shell, Knesset picker, title, error state |
| `src/views/KnessetPage.css` | Hemicycle, picker, tooltip, MK dot styles |
| `src/components/knesset/KnessetHemicycle.tsx` | SVG container, hover state |
| `src/components/knesset/MKDot.tsx` | Individual MK circle (photo/initials) |
| `src/components/knesset/CenterCounter.tsx` | Donut ring (coalition/opposition) or neutral total count |
| `src/components/knesset/Tooltip.tsx` | Desktop-only floating tooltip |
| `src/components/knesset/FactionList.tsx` | Member list below the hemicycle with sort modes (party groups, flat sorted, bloc groups) |
| `src/hooks/useKnessetList.ts` | Loads all Knesset terms for the picker |
| `src/hooks/useKnessetMembers.ts` | Supabase fetch for selected term + derived counts + `factionGroups` |
| `src/lib/hemicycle.ts` | Seat positions, bloc/faction layout, `factionColorFromId`, `SEAT_REVEAL_ORDER` entrance sequence |
| `src/lib/memberRoles.ts` | Formats minister appointments and membership `duty_desc` into display roles |
| `src/lib/memberSort.ts` | `MemberSortMode` type and Hebrew sort option labels |
| `src/lib/supabase.ts` | Supabase client + types (`KnessetOption`, etc.) |
| `src/components/SiteHeader.tsx` | Shared header (logo links home, Israel-time Hebrew-numeral/civil date labels, live government/Knesset context line) |
| `src/hooks/useCurrentTermLabel.ts` | Client fetch of `governments.is_active` + `knessets.is_active` for the header line |
| `src/lib/termLabel.ts` | `ממשלת ישראל ה{n} \| הכנסת ה{n}` formatter |
| `Layer 1 - Gathering Data/knesset/fix_faction_links_all.py` | Backfill for `faction_id` links across Knessets |

## Knesset Picker

- Dropdown in the page header lists all rows from `knessets`, newest first.
- Title (`h1`): `הכנסת ה-{n}` via `formatKnessetTitle()`.
- Dropdown label: `הכנסת ה-{n} ({startYear}–{endYear})` via `formatKnessetLabel()`; active term uses `היום` when `end_date` is null.
- Default selection: `is_active = true`, else highest `knesset_number`.
- Changing the selection re-fetches members for that term.
- Native select appearance is removed and replaced with a custom arrow positioned `14px` from the physical left edge; extra `padding-inline-end` keeps long labels clear of the arrow.

## Data Layer

### Tables

- `knessets` — term metadata (`knesset_number`, `start_date`, `end_date`, `is_active`)
- `knesset_memberships` — one row per MK per Knesset term (may include mid-term replacements); optional `duty_desc` for non-generic roles (e.g. יו"ר הכנסת)
- `knesset_factions` — party `name`, optional `short_name`, optional `logo_url`, `color`, `is_coalition`
- `people` — `full_name`, `image_url`
- `minister_appointments` — government roles active at the term snapshot date (ministers, PM, deputies, etc.)
- `offices` — ministry/office names joined from minister appointments

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
  .select('id, person_id, faction_id, start_date, duty_desc, person:people(...), faction:knesset_factions(...), knesset:knessets(...)')
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

**4. Active government roles** (parallel with query 3, same `person_id`s, filtered to `refDate`)

```ts
supabase
  .from('minister_appointments')
  .select('person_id, duty_desc, is_acting, office:offices(name, knesset_category_name)')
  .in('person_id', personIds)
  .lte('start_date', refDate)
  .or(`end_date.is.null,end_date.gte.${refDate}`)
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
- Per-MK `additionalRoles` (`src/lib/memberRoles.ts`):
  - Non-generic `duty_desc` from the membership snapshot (excludes plain "חבר כנסת" / "חברת כנסת")
  - Active minister/government titles from `minister_appointments` at `refDate` (uses `duty_desc`, else office name; prefixes `מ"מ` when `is_acting`)
  - Shown in the desktop tooltip below the faction name, joined with ` · ` when multiple

### Coalition data (future)

Historical terms typically lack `knesset_factions.is_coalition`. Until backfilled:
- Hemicycle uses faction-only layout (no left/right bloc split)
- Center counter shows neutral ring + loaded member count
- `bloc` sort option is hidden in the member list

When coalition flags are added per faction per term, the page auto-detects them and restores the split layout + donut.

## Parliament Grid Layout

### Grid mask (17 × 15)

Fixed `SEAT_GRID` in `src/lib/hemicycle.ts`: 15 rows × 17 columns. Each cell is `'X'` (seat) or `'.'` (empty). Seat pitch is **40×33** px (width × height) so the SVG silhouette is wider than tall. Wing vs arc regions use `LEFT_WING_MAX_COL = 3` and `RIGHT_WING_MIN_COL = GRID_COLS - 4` (outer four columns on each side).

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
- Hover: scales to 1.15× for every dot in the hovered member’s faction (`factionName` match); tooltip still shows the individual member under the cursor
- **Loading / entrance animation:** while the Knesset list or selected-term members are loading, `KnessetHemicycle` shows the standard page skeleton shimmer panel instead of rendering animated placeholder seats. When member data finishes loading, the real SVG mounts and each dot fades/scales in sequentially via CSS (`mk-dot-reveal`, 520ms, stagger 14ms). Reveal order from `SEAT_REVEAL_ORDER` in `hemicycle.ts` — left wing bottom-up (starting bottom-left), then the shared top arc left-to-right, then the right wing top-to-bottom. Respects `prefers-reduced-motion`.

### CenterCounter

- **With coalition data:** white disc with drop shadow; two-tone ring starting at 6 o'clock (coalition `#5C63E3` left arc, opposition `#FFC25E` right arc); fraction-style text — colored `{coalition}/{opposition}` on top (coalition num larger, italic black slash, opposition num slightly smaller), black divider line, large bold total below
- **Without coalition data:** single neutral grey ring, large total count, label **הכנסת**
- **Hemicycle hover:** when the user hovers an MK dot and coalition data exists, a blurred halo behind the white disc glows in the hovered member's bloc color (coalition or opposition); fades out when hover ends
- **Entrance animation:** gently scales/fades in when the top-arc reveal pass begins (`ARC_REVEAL_START_INDEX × SEAT_REVEAL_STAGGER_MS` delay)

### Tooltip

- Desktop only (HTML overlay, not shown on touch)
- Header: photo/initials, name, faction
- When `additionalRoles` is non-empty: role line below faction (e.g. שר האוצר, ראש הממשלה, יו"ר הכנסת)
- Details: cumulative tenure summary, first elected year

### FactionList

- Section title: **חברי הכנסת ה-{n}** via `formatKnessetMembersTitle()` (updates with header picker)
- Sort options: `parties`, `tenure`, `name`, `firstElected`; `bloc` only when `hasCoalitionData`
- Sort select uses the same custom inset arrow and RTL inline-end padding as the header picker.
- If user had `bloc` selected and switches to a term without coalition data, sort resets to `parties`

## State Management

| State | Source |
|-------|--------|
| `knessets` | `useKnessetList` hook |
| `selectedKnesset` | `KnessetPage` local state (defaults to active term) |
| `members`, counts, `hasCoalitionData`, `factionGroups` | `useKnessetMembers(selectedKnesset)` |
| `loadedTermId` | `useKnessetMembers` guard that keeps the selected term in loading state until its own fetch resolves |
| `sortMode` | `KnessetPage` local state (`useState<MemberSortMode>('parties')`) |
| `hoveredMember`, tooltip position | `KnessetHemicycle` / `FactionList` local state; hemicycle hover highlights all MKs sharing `hoveredMember.factionName` |
| Loading | standard hemicycle shimmer panel + faction skeletons while the Knesset list loads, member data loads, or the selected term does not match `loadedTermId` |
| Error | Hebrew message: `לא ניתן לטעון את נתוני הכנסת` |

## Edit Page (`/knesset/edit`)

Password-gated private tool for running the Knesset OData sync pipeline, editing MK person and faction links, and editing manually curated faction metadata. App Router file order handles `/knesset/edit` vs `/knesset` (static `edit/` segment vs `src/app/knesset/page.tsx`).

### Routes & files

| Route | File | Role |
|-------|------|------|
| `/knesset/edit` | `src/views/KnessetPipelineEditPage.tsx` | Password gate, status panel, pipeline runner, MK editor, faction editor |
| | `src/views/KnessetPipelineEditPage.css` | Status grid, pipeline stage rows, faction edit styles |
| | `src/app/knesset/edit/page.tsx` | App Router wrapper + metadata |
| | `src/components/knesset/KnessetPipelinePanel.tsx` | Dev-only sync stages 1–6 + post-sync scripts |
| | `src/hooks/useKnessetFactions.ts` | Faction list for selected Knesset term |
| | `src/lib/runKnessetPipeline.ts` | Dev API client for status, stages, faction links, images |
| | `src/components/knesset/KnessetMemberEditor.tsx` | MK list, search, no-faction filter, person + faction form |
| | `src/hooks/useKnessetMembershipEdits.ts` | Memberships + person fields for the selected term |
| | `src/lib/updateKnessetMember.ts` | Dev API client for MK saves and photo upload |
| | `src/lib/updateKnessetFaction.ts` | Dev API client for faction metadata saves |
| | `src/app/api/knesset/[...path]/route.ts` | Next.js App Router handlers spawning Python in `Layer 1 - Gathering Data/knesset/` (gated by `assertPipelineEnabled`) |
| | `src/server/apiCommon.ts` | Shared pipeline API helpers (auth, Python spawn, JSON responses) |
| | `Layer 1 - Gathering Data/knesset/run_knesset_pipeline_api.py` | JSON API for pipeline subcommands |

### Auth

- Env: `KNESSET_EDIT_SECRET` / `NEXT_PUBLIC_KNESSET_EDIT_SECRET` (legacy `VITE_KNESSET_EDIT_SECRET` still read)
- Client compares password in-browser; unlock stored in `sessionStorage` under `knesset-edit-unlocked`
- API calls send header `x-knesset-edit-secret`
- Lightweight private-tool gate — not production auth; routes require `pipelineApisEnabled()` (dev or `ENABLE_PIPELINE_API`)

### Status panel

On unlock, loads table row counts, `membershipsMissingFaction`, last pipeline run time, and **last run summary** (inserted vs updated per stage/table) via `GET /api/knesset/status`. Summary is persisted in `pipeline_last_run.json` when sync stages, faction-link apply, or image sync complete. **רענן סטטוס** refetches after pipeline runs.

### Pipeline panel (dev only)

When `isDev` is true, the **צינור נתונים** panel runs OData sync:

| Stage | Label | Script step |
|-------|-------|-------------|
| 1 | כנסות | `sync_knessets` |
| 2 | אנשים | `sync_people` |
| 3 | סיעות | `sync_factions` |
| 4 | משרדים | `sync_offices` |
| 5 | ממשלות | `sync_governments` — creates a missing `GovernmentNum`, sets `is_active`, closes the previous row |
| 6 | חברויות ומינויים | `sync_positions` — snapshots diffs into `pending_site_update.json` |
| 7 | יצירת עדכון | `emit_knesset_run_update` from pending diffs → homepage `site_updates` (editable in UI) |

- **התחל סנכרון מלא** runs stages 1–7 sequentially via `POST /api/knesset/pipeline/stage`
- Stage 6 no longer emits the ticker itself in the edit UI — it only records membership/appointment field diffs. Stage 7 generates the Hebrew headline and shows an editable textarea (**שמור כותרת** → `POST /api/knesset/site-update`). CLI / GitHub Actions `load_all_knesset_data.py` (`sync_all`) still emits immediately after positions sync when membership/appointment fields changed (see [PiplinesPage.md](./PiplinesPage.md))
- Production schedule: daily midnight Israel via `.github/workflows/knesset-pipeline.yml` (writes are insert/update-only; unchanged rows skipped; curated faction fields never overwritten). `knessets.is_active` follows OData `IsCurrent` (the previous active row is cleared first because only one active knesset is allowed). `governments.is_active` follows the highest `GovernmentNum` on an `IsCurrent` ministerial position. There is no `KNS_Government` entity. A missing number is inserted (`start_date` = earliest ministerial `StartDate`, `knesset_id` = that appointment's Knesset). An existing `knesset_id`, `start_date`, or `end_date` is not overwritten; a null `end_date` is filled when that government is no longer current. Offices mirror `KNS_GovMinistry` (`name` on insert only; a ministry missing from a non-empty feed is closed). Minister appointments copy official dates and `IsCurrent`; `is_acting` is set only on insert. OData uses `https://knesset.gov.il/Odata/ParliamentInfo.svc` via `odata_client.py` (`curl_cffi` Chrome TLS impersonation to reduce WAF blocks from GitHub Actions IPs). If OData still returns HTML, falls back to matching Hasadna CSV dumps (cached per run)
- When `KNS_PersonToPosition.FactionID` is null, the sync fills `knesset_memberships.faction_id` for the active Knesset from the election that seats that Knesset (`election_candidates` → `election_parties` → current-Knesset `knesset_factions`) and sets `faction_id_provisional`. Faction titles match across final letters, punctuation (`ישר!`), leadership phrases, and a shared leading name (ש״ס / התאחדות הספרדים). If the membership person is a second `people` row for the same list name, and the list row has no different `knesset_person_id`, that list is used. A later OData `FactionID` overwrites the value, clears the flag, and logs when the official faction differs. An official (non-provisional) `faction_id` is never replaced by the fallback. A row with `faction_id_manual` (set from the MK editor) is also left alone, including a deliberate null; the official `FactionID` still overwrites it and clears the manual flag. Apply `schema_knesset_membership_faction_provisional.sql` before the first run that should store the provisional flag, and `schema_knesset_member_edits.sql` before manual MK saves.
- While running, the active stage row is highlighted with a spinner; each stage shows its own elapsed time, and the status line also shows total run time (`usePipelineRunProgress`)
- Per-stage **הרץ** buttons run a single stage. Standalone stage 7 needs a prior stage 6 that left pending changes
- Post-sync: **בדוק קישורי סיעות** / **החל קישורי סיעות** (`fix_faction_links_all` logic)
- **עדכן תמונות** runs `km_images` logic for the active Knesset folder `public/images/KM Images/הכנסת ה{n}` (also accepts `הכנסת ה-{n}`)

Requires `npm run dev`, `SUPABASE_SERVICE_KEY`, and `KNESSET_EDIT_SECRET` / `NEXT_PUBLIC_KNESSET_EDIT_SECRET` in `.env`.

### MK editor

After unlock, a **חברי כנסת** section lists every membership of the selected Knesset. The picker defaults to the active term (K26 today) and uses the same Hebrew `<select>` as the faction editor. Search matches `full_name`. **ללא סיעה** keeps only rows whose `faction_id` is null.

Each card edits the person (`full_name`, `gender`, `birth_date`, `email`, `twitter_handle`, `wikipedia_url`, `image_url`) and that membership's faction. The faction dropdown is the factions of the selected Knesset, plus **ללא סיעה**. There is no separate bio column on `people`.

A photo can be pasted as a URL or uploaded (JPEG, PNG, or WebP, up to 4MB). Uploads go to the public Supabase Storage bucket `mk-images`. The public site already renders `people.image_url`, so the hemicycle, committees, and government pages use the new URL with no extra preference logic. Static files under `public/images/KM Images` stay the bulk source; **עדכן תמונות** skips a person whose `manual_fields` includes `image_url`.

Saving a faction sets `faction_id`, `faction_id_provisional=false`, and `faction_id_manual=true`. The nightly provisional matcher and **החל קישורי סיעות** leave that row alone, including a deliberate null. When OData later publishes a `FactionID`, that official value overwrites the manual one and clears `faction_id_manual`. Changed person columns are added to `people.manual_fields` so the person sync does not overwrite them. `is_current` still follows OData.

Apply `schema_knesset_member_edits.sql` before the first save or photo upload. Without it the list still loads and the save returns that instruction.

Saves use the same gate as faction edits: password in `PipelineUnlockGate`, header `x-knesset-edit-secret`, and `POST /api/knesset/update-member` / `upload-member-image` with the service key. The client allows this in `npm run dev` only, same as `updateKnessetFaction`.

### Faction editor

After unlock, pick a Knesset term (same `<select>` as public page). Each faction card edits **manually curated** fields only:

- `short_name`, `color`, `is_coalition`, `logo_url`

OData-synced `name` and dates are display-only. Saves via `POST /api/knesset/update-faction` (service key). Active term cards highlight missing `color` or `is_coalition`.

## Verification

```bash
npm run lint
npm run build
npm run dev   # visit /knesset — switch Knesset terms in the header dropdown
npm run dev   # visit /knesset/edit — pipeline + faction editing (dev + secret)
```

Ensure `NEXT_PUBLIC_SUPABASE_ANON_KEY` is set in `.env` before testing live data (legacy `VITE_SUPABASE_ANON_KEY` still mapped in `next.config`). For `/knesset/edit`, also set `KNESSET_EDIT_SECRET` / `NEXT_PUBLIC_KNESSET_EDIT_SECRET` and `SUPABASE_SERVICE_KEY`.

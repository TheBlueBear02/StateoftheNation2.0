# GovernmentPage

> See [ProjectOverview.md](./ProjectOverview.md) for repo structure, tech stack, and data model.

Government structure page for a selected government term. Mirrors the Knesset page pattern: picker, visual diagram, loading/error states, hover tooltips, and a detailed list below the diagram.

Route: `/government`

## Page Structure

```
┌─────────────────────────────────────────────────────────┐
│  Header (shared SiteHeader)                             │
├─────────────────────────────────────────────────────────┤
│  Title (selected government) + government picker         │
│  GovernmentPyramid                                      │
│    ├─ Top-left: government start/end dates               │
│    ├─ Top-right: ministers + deputy ministers count      │
│    ├─ Leadership tier (PM centered)                      │
│    └─ Ministers tier (all ministers together)            │
│  Error message (if fetch fails)                         │
│  OfficeList (office cards: ministers + deputy ministers)│
├─────────────────────────────────────────────────────────┤
│  Footer (shared SiteFooter — blue + white logo)         │
└─────────────────────────────────────────────────────────┘
│  Tooltip (desktop only, HTML overlay)                   │
└─────────────────────────────────────────────────────────┘
```

## Files

| File | Role |
|------|------|
| `src/pages/GovernmentPage.tsx` | Page shell, government picker, title, error state |
| `src/pages/GovernmentPage.css` | Pyramid, office cards, tooltip, loading skeletons |
| `src/components/government/GovernmentPyramid.tsx` | Hierarchy diagram with circular minister avatars |
| `src/components/government/OfficeList.tsx` | Office cards with ministers and deputy ministers |
| `src/hooks/useGovernmentList.ts` | Loads all governments for the picker |
| `src/hooks/useGovernmentMinisters.ts` | Supabase fetch for selected government + faction lookup |
| `src/lib/governmentStructure.ts` | Role classification, pyramid tiers, office grouping |
| `src/lib/supabase.ts` | Supabase client + government row types |
| `src/components/SiteHeader.tsx` | Shared header (logo links home, Israel-time Hebrew-numeral/civil date labels, government/Knesset context line) |
| `src/components/knesset/Tooltip.tsx` | Shared desktop person tooltip |

## Government Picker

- Dropdown lists rows from `governments`, newest first.
- Title (`h1`): `הממשלה ה-{n}` via `formatGovernmentTitle()`.
- Dropdown label: `הממשלה ה-{n} ({endYear|היום}–{startYear})`; active term uses `היום` when `end_date` is null.
- Default selection: `is_active = true`, else highest `government_number`.
- Changing selection re-fetches minister appointments for that government.
- Native select appearance is removed and replaced with a custom arrow positioned `14px` from the physical left edge; extra `padding-inline-end` keeps long labels clear of the arrow.

## Data Layer

### Tables

- `governments` — government metadata (`government_number`, `knesset_id`, `start_date`, `end_date`, `is_active`)
- `minister_appointments` — one row per ministerial appointment (`person_id`, `government_id`, `office_id`, dates, `duty_desc`, `is_acting`)
- `offices` — ministry / office names joined from appointments
- `people` — `full_name`, `image_url`
- `knesset_memberships` + `knesset_factions` — faction name and color for ministers who are also MKs

### Queries

**1. Government list** (on mount, once)

```ts
supabase
  .from('governments')
  .select('id, government_number, knesset_id, start_date, end_date, is_active')
  .order('government_number', { ascending: false })
```

**2. Active appointments** (when selected government changes)

Reference date: `refDate = government.endDate ?? today` (ISO `YYYY-MM-DD`).

```ts
supabase
  .from('minister_appointments')
  .select('id, person_id, government_id, office_id, start_date, end_date, duty_desc, is_acting, person:people(...), office:offices(...)')
  .eq('government_id', government.id)
  .lte('start_date', refDate)
  .or(`end_date.is.null,end_date.gte.${refDate}`)
```

Client-side: dedupe by `person_id + office_id`, keeping the row with latest `start_date`.

**3. Faction snapshot** (for appointment `person_id`s, when `government.knessetId` exists)

```ts
supabase
  .from('knesset_memberships')
  .select('person_id, faction_id, start_date, end_date, faction:knesset_factions(...)')
  .eq('knesset_id', government.knessetId)
  .in('person_id', personIds)
  .lte('start_date', refDate)
  .or(`end_date.is.null,end_date.gte.${refDate}`)
```

## Derived Client-Side

- `officeName` — `offices.knesset_category_name`, else `offices.name`, else `משרד ללא שם`
- `roleTitle` — `duty_desc`, else office name; prefixes `מ"מ` when `is_acting`
- `roleKind` from `src/lib/governmentStructure.ts`:
  - actual `ראש הממשלה` / `ראש הממשלה החלופי`
  - `שר/שרה במשרד ראש הממשלה` stays a normal minister, not a Prime Minister role
  - `סגן ראש הממשלה`, `סגנית ראש הממשלה`, `משנה לראש הממשלה`
  - `סגן שר`, `סגנית שר`
  - all other appointments are treated as ministers
- `pyramidTiers` — deduped by `person_id`; deputy ministers excluded from the pyramid and shown under offices only; `סגן ראש הממשלה`, alternate PM, and ministers in `משרד ראש הממשלה` remain in the top leadership tier at non-PM avatar size
- `officeGroups` — office cards with `ministers` and `deputies`, PM office first, then Hebrew office-name sort
- `ministerAndDeputyCount` — unique `person_id` count across all active minister and deputy-minister appointments, so multi-office holders are not double-counted

## Visual Specs

- Page uses `.container`, white surfaces, restrained blue accents, RTL-first layout, and square-cornered cards per `DesignLanguage.md`.
- Pyramid is an HTML/flex hierarchy, not SVG:
  - government period value appears at the physical top-left of the diagram panel in end-to-start order (`end_date|היום` to `start_date`), without a label
  - unique ministers + deputy ministers count appears at the physical top-right of the diagram panel, without a label
  - the leadership tier keeps the actual Prime Minister fixed in the visual center; alternate PM / deputy PMs / ministers in the PM office alternate between the physical left and right sides of the PM and bottom-align with the row
  - leadership first row is capped at five people total (PM + four non-PM roles); any additional leadership members move to a second centered row to prevent overflow outside the panel
  - leadership members use a fixed avatar slot and natural name/role rows so circle alignment stays stable while the text remains tightly stacked
  - only actual PM avatars are largest; every other leadership role uses the normal minister avatar size
  - all remaining ministers appear together in a single `שרים` tier, with no `שרים נוספים` split
  - there is no bottom count caption under the diagram; only the top-right ministers + deputy ministers count is shown
  - skeleton rows display while data loads
  - staggered entrance animation respects `prefers-reduced-motion`
- Office cards are rectangular cards with subtle borders, not rounded; deputy ministers are listed below the minister rows without a separate `סגני שרים` subtitle.
- Person avatars use Knesset-style circular photos / initials and faction-color borders when faction data exists.
- Desktop hover shows shared `Tooltip`; mobile hides tooltip.

## State Management

| State | Source |
|-------|--------|
| `governments` | `useGovernmentList` hook |
| `selectedGovernment` | `GovernmentPage` local state |
| `appointments`, `pyramidTiers`, `officeGroups`, `ministerAndDeputyCount` | `useGovernmentMinisters(selectedGovernment)` |
| Loading | pyramid skeleton + office-card skeletons |
| Error | Hebrew message: `לא ניתן לטעון את נתוני הממשלה` |

## Verification

```bash
npm run lint
npm run build
npm run dev   # visit /government — switch governments in the header dropdown
```

Ensure `VITE_SUPABASE_ANON_KEY` is set in `.env` before testing live data.

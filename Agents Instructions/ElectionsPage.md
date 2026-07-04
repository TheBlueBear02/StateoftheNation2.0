# ElectionsPage

> See [ProjectOverview.md](./ProjectOverview.md), [DesignLanguage.md](./DesignLanguage.md), and [Database.md](./Database.md) for shared conventions and schema details.

Frontend module for the 2026 elections. It has a party index at `/elections` and a party detail page at `/elections/:partyId`.

## Routes

| Route | Component | Purpose |
|-------|-----------|---------|
| `/elections` | `src/pages/ElectionsPage.tsx` | Cards for all parties in `election_parties` for the active 2026 election |
| `/elections/:partyId` | `src/pages/ElectionPartyPage.tsx` | Detail page for one party, keyed by `election_parties.id` |

The homepage hero button **בחירות 2026** links to `/elections`.

## Files

| File | Role |
|------|------|
| `src/pages/ElectionsPage.tsx` / `.css` | Party index page and party-card grid styles |
| `src/pages/ElectionPartyPage.tsx` / `.css` | Party detail layout and section styles |
| `src/components/elections/PartyCard.tsx` | Clickable card with the top-candidate portrait on the right and the party logo pinned to the top-left corner |
| `src/components/elections/SeatsTrend.tsx` | Temporary mock seats average and decorative trend line |
| `src/components/elections/StatsBar.tsx` | Average age, % new MKs, and % women stat blocks |
| `src/components/elections/CandidateList.tsx` | Ordered candidate cards with photo/initial fallback; shows 9 by default and loads 9 more per click |
| `src/components/elections/CandidateMap.tsx` | Public Israel map SVG with one projected dot per geocoded candidate |
| `src/components/elections/CandidateMapTooltip.tsx` | Fixed-position map tooltip matching the Knesset page style, showing city instead of faction |
| `src/hooks/useElectionParties.ts` | Fetches the 2026 election row and its parties |
| `src/hooks/useElectionCandidates.ts` | Fetches party candidates, flags new MKs, computes stats, and normalizes map pins |

## Data Flow

`useElectionParties` first tries to load `elections.year = 2026` for page title/date metadata. `ElectionsPage.tsx` uses `elections.date` to render the hero eyebrow as an automatic countdown (`עוד X יום לבחירות`) and falls back to the page title when no valid date is available. The countdown recalculates from the current client date every hour so an open tab updates after the day changes. If the election row is missing or not selectable, the hook still fetches all rows from `election_parties` so party cards can render from the primary working table. When the election row is available, parties are filtered by that `elections.id`; if that filtered query returns zero rows, the hook retries without the filter because local seed data can temporarily have mismatched `election_parties.election_id` values. After party rows load, the hook fetches each party's top candidate (`election_candidates.list_position = 1`) joined to `people(full_name, image_url)`; cards render the portrait section on the right side only when `people.image_url` exists and omit that section when it does not.

`useElectionCandidates(partyId)` loads ordered `election_candidates` joined to `people`. It then queries `knesset_memberships` for those `person_id`s with `start_date` and `end_date`, merges overlapping terms with `computeMemberTenureStats`, and attaches `totalDaysInKnesset` / `totalYearsInKnesset` to each candidate and map pin:

- A candidate is a **new MK** when no membership row exists for their `person_id`.
- Former/current MKs show tenure in the candidate list and map tooltip as years only (e.g. `3.4 שנים בכנסת`), using `formatTenureYears`.
- Average age is computed only from non-null `people.birth_date`.
- % women is computed from non-null `people.gender` rows where `gender === 'נקבה'`.
- Map pins use only candidates with non-null `city`, `latitude`, and `longitude`.

Null source data is displayed honestly with coverage labels or empty states; the frontend does not guess missing demographic or coordinate values.

The election data pipeline runs six stages: resolve candidates, general Wikidata enrichment, generate descriptions, geocode cities, `fetch_candidate_birthdates.py` for any remaining null `people.birth_date` values, then `fetch_candidate_wiki_urls.py` for any remaining null `people.wikipedia_url` values. Those final two stages update only their target field on `people`, so frontend age coverage and **קרא עוד** links improve without changing candidate descriptions, cities, map coordinates, gender, or images.

The frontend uses `VITE_SUPABASE_ANON_KEY`, not the service key. If service-role scripts can see parties but `/elections` shows an empty list, check public `select` policies for `elections`, `election_parties`, and `election_candidates` (see [Database.md](./Database.md)).

## Seats Placeholder

`SeatsTrend.tsx` intentionally uses a local `MOCK_SEATS` constant because poll averages and trend history do not exist in the DB yet. The section is labeled **נתוני סקרים — בקרוב** so users can distinguish it from real candidate-list statistics. On the party detail page it is rendered as a compact summary inside the top hero, in the visual left column.

When poll data is added, replace `MOCK_SEATS` with a hook backed by the new table and keep the component API limited to a current average and ordered trend points.

## Static Israel Map

`CandidateMap.tsx` is dependency-free. It uses:

- `public/images/elections page/israel map.svg` as the base map image,
- a calibrated projection for that slanted asset: latitude maps across the full `598px` height, while x-position uses a longitude/latitude affine calibration so northern, central, and southern points sit on the visible map,
- clamping so outlier geocodes do not escape the map viewBox,
- a small deterministic spread for candidates with identical city coordinates so each candidate still gets a visible dot.

Pins use the party color, render larger than the original static dots, and expose a Knesset-style fixed tooltip on hover/focus: borderless circular photo or initials, candidate name, city (instead of faction name), and MK tenure when available. When `election_parties.logo_url` is present, a small party logo badge is pinned to the top-left corner of the map section (same placement pattern as the party index cards). The map coverage label beside the SVG reads **מציג X מועמדים מרשימת {party}**, where X is the number of geocoded candidates shown as pins and `{party}` is the party `shortName` (fallback: full `name`).

## Styling

The module follows [DesignLanguage.md](./DesignLanguage.md):

- RTL-first layout via `SiteLayout`.
- White cards, subtle borders, no border radius.
- The `/elections` hero uses a top-to-bottom blue fade over white; the election date renders as plain bold text, without a chip background or border.
- The party list section header shows only the title **המפלגות המתמודדות**; it does not include explanatory copy under the title.
- The party index grid renders three cards per row on desktop, two on narrower tablet widths, and one on mobile.
- Party cards show the top-candidate portrait section only when an image exists in `people.image_url`; the portrait is flush to the right edge and fills the card height, while an enlarged party logo is pinned to the top-left corner. Cards do not render a per-party color accent line.
- Party color is passed through CSS custom property `--party-color` and appears as a subtle left-side background wash plus hover border treatment.
- The `/elections/:partyId` party detail sections are borderless; section separation comes from spacing and white backgrounds rather than boxed outlines or hero side accents. The party hero uses three desktop columns: logo, party copy, and the seats placeholder on the visual left. Stats blocks are centered within their cells and have no border.
- Candidate list cards use larger borderless full-height portrait/initial columns that sit flush against the card side with no edge padding; the list position number sits as an overlay in the visual top-left corner. Former MKs also show tenure under the city line in smaller muted text (`0.8rem`, e.g. `3.4 שנים בכנסת`). When `election_candidates.city` is null, the city line shows **לא ידוע מקום מגורים**. When a candidate has both a generated description and `people.wikipedia_url`, the description ends with an external **קרא עוד** link to the Hebrew Wikipedia article.
- Mobile layouts collapse to one column.

## Verification

```bash
npm run lint
npm run build
```

Manual checks:

- `/elections` loads all parties and card links.
- `/elections/:partyId` renders the party header, placeholder seats, stats, candidate list, and map.
- Parties without candidate rows show empty candidate/map states.

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
| `src/components/elections/PartyCard.tsx` | Clickable card with logo/color fallback, short name, full name, and ballot letter |
| `src/components/elections/SeatsTrend.tsx` | Temporary mock seats average and decorative trend line |
| `src/components/elections/StatsBar.tsx` | Average age, % new MKs, and % women stat blocks |
| `src/components/elections/CandidateList.tsx` | Ordered candidate cards with photo/initial fallback and “see more” expansion |
| `src/components/elections/CandidateMap.tsx` | Static SVG Israel outline with one projected dot per geocoded candidate |
| `src/hooks/useElectionParties.ts` | Fetches the 2026 election row and its parties |
| `src/hooks/useElectionCandidates.ts` | Fetches party candidates, flags new MKs, computes stats, and normalizes map pins |

## Data Flow

`useElectionParties` first tries to load `elections.year = 2026` for page title/date metadata. If that row is missing or not selectable, the hook still fetches all rows from `election_parties` so party cards can render from the primary working table. When the election row is available, parties are filtered by that `elections.id`; if that filtered query returns zero rows, the hook retries without the filter because local seed data can temporarily have mismatched `election_parties.election_id` values.

`useElectionCandidates(partyId)` loads ordered `election_candidates` joined to `people`. It then queries `knesset_memberships` for those `person_id`s:

- A candidate is a **new MK** when no membership row exists for their `person_id`.
- Average age is computed only from non-null `people.birth_date`.
- % women is computed from non-null `people.gender` rows where `gender === 'נקבה'`.
- Map pins use only candidates with non-null `city`, `latitude`, and `longitude`.

Null source data is displayed honestly with coverage labels or empty states; the frontend does not guess missing demographic or coordinate values.

The frontend uses `VITE_SUPABASE_ANON_KEY`, not the service key. If service-role scripts can see parties but `/elections` shows an empty list, check public `select` policies for `elections`, `election_parties`, and `election_candidates` (see [Database.md](./Database.md)).

## Seats Placeholder

`SeatsTrend.tsx` intentionally uses a local `MOCK_SEATS` constant because poll averages and trend history do not exist in the DB yet. The section is labeled **נתוני סקרים — בקרוב** so users can distinguish it from real candidate-list statistics.

When poll data is added, replace `MOCK_SEATS` with a hook backed by the new table and keep the component API limited to a current average and ordered trend points.

## Static Israel Map

`CandidateMap.tsx` is dependency-free. It uses:

- a hand-tuned SVG outline of Israel from coordinate points,
- an equirectangular projection bounded roughly by longitude `34.15–35.95` and latitude `29.45–33.35`,
- clamping so outlier geocodes do not escape the map viewBox,
- a small deterministic spread for candidates with identical city coordinates so each candidate still gets a visible dot.

Pins use the party color and include SVG `<title>` text with candidate name and city.

## Styling

The module follows [DesignLanguage.md](./DesignLanguage.md):

- RTL-first layout via `SiteLayout`.
- White cards, subtle borders, no border radius.
- Party color is passed through CSS custom property `--party-color`.
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

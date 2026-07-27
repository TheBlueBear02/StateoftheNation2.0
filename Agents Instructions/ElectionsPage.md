# ElectionsPage

> See [ProjectOverview.md](./ProjectOverview.md), [DesignLanguage.md](./DesignLanguage.md), and [Database.md](./Database.md) for shared conventions and schema details.

Frontend module for the 2026 elections. It has a party index at `/elections`, a party detail page at `/elections/:partyId`, and a password-gated candidate editor at `/elections/edit`.

## Routes

| Route | Component | Purpose |
|-------|-----------|---------|
| `/elections` | `src/pages/ElectionsPage.tsx` | Cards for all parties in `election_parties` for the active 2026 election |
| `/elections/edit` | `src/pages/ElectionCandidatesEditPage.tsx` | Password-gated editor for existing candidate + person fields |
| `/elections/:partyId` | `src/pages/ElectionPartyPage.tsx` | Detail page for one party, keyed by `election_parties.id` |

Register `/elections/edit` **before** `/elections/:partyId` in `src/main.tsx` so `edit` is not parsed as a party id.

The homepage hero button **בחירות 2026** links to `/elections`.

## Files

| File | Role |
|------|------|
| `src/pages/ElectionsPage.tsx` / `.css` | Party index page and party-card grid styles |
| `src/pages/ElectionPartyPage.tsx` / `.css` | Party detail layout and section styles |
| `src/pages/ElectionCandidatesEditPage.tsx` / `.css` | Password gate, party picker, per-candidate edit forms, and party pipeline panel |
| `src/components/elections/PartyPipelinePanel.tsx` | Dev-only full pipeline UI for parties with 0–2 candidates |
| `src/lib/updateElectionCandidate.ts` | Anon-key updates to `people` + `election_candidates` with list-position conflict checks |
| `src/lib/enrichElectionCandidate.ts` | Dev-only client for per-card pipeline preview (`/api/elections/enrich-candidate`) |
| `src/lib/runElectionPartyPipeline.ts` | Dev-only client for party-level pipeline (`/api/elections/pipeline/*`) |
| `vite-plugins/electionsEditApi.ts` | Dev middleware: `update-candidate`, `enrich-candidate`, and party pipeline endpoints |
| `src/components/elections/PartyCard.tsx` | Clickable card with the top-candidate portrait on the right and the party logo pinned to the top-left corner |
| `src/components/elections/SeatsTrend.tsx` | Temporary mock seats average and decorative trend line |
| `src/components/elections/StatsBar.tsx` | Average age, % new MKs, and % women stat blocks |
| `src/components/elections/CandidateList.tsx` | Ordered candidate cards with photo/initial fallback; shows 9 by default and loads 9 more per click |
| `src/components/elections/CandidateMap.tsx` | Public Israel map SVG with one projected dot per geocoded candidate |
| `src/components/elections/CandidateMapTooltip.tsx` | Fixed-position map tooltip matching the Knesset page style, showing city instead of faction |
| `src/hooks/useElectionParties.ts` | Fetches the 2026 election row and its parties |
| `src/hooks/useElectionCandidates.ts` | Fetches party candidates, flags new MKs, computes stats, normalizes map pins, and exposes `refetch` |

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

## Candidate Edit Page (`/elections/edit`)

Lightweight private tool for editing **existing** candidates only (no add/delete). Access is gated by comparing a submitted password to `VITE_ELECTIONS_EDIT_SECRET` in the browser; a successful unlock is stored in `sessionStorage` under `elections-edit-unlocked`. If the env var is missing, the page shows a config error instead of opening.

After unlock, pick a party (same square `<select>` pattern as Knesset/Government) and edit one candidate card at a time. Each card is **collapsed by default**, showing list position, photo, and full name; click the summary row to expand the full edit form. Collapsed rows with empty fields show **חסר:** followed by the missing field labels (e.g. `תיאור · עיר · תמונה`). Unsaved changes show **יש שינויים לא שמורים** on the collapsed row. Each card saves independently via `updateElectionCandidate`.

| UI field | Table | Column |
|----------|-------|--------|
| שם מלא | `people` | `full_name` |
| תיאור | `election_candidates` | `description` |
| עיר | `election_candidates` | `city` |
| תמונה (URL) | `people` | `image_url` |
| תאריך לידה | `people` | `birth_date` |
| מגדר | `people` | `gender` (`זכר` / `נקבה`) |
| ויקיפדיה (URL) | `people` | `wikipedia_url` |
| מיקום ברשימה | `election_candidates` | `list_position` |

When `city` changes, the save also sets `latitude` / `longitude` to `null` so the public map does not keep a stale pin (re-geocode later via pipeline Stage 4). `list_position` uniqueness is checked client-side against siblings; Supabase unique-constraint errors are surfaced in Hebrew.

### Per-card pipeline enrich (dev only)

Each collapsed card with missing fields shows a **השלם מידע** button (summary row and expanded form). One click runs a **preview** of pipeline stages 2, 3, 5, and 6 for that candidate only — no DB write until **שמור**.

| Stage | Script | Fills (when null) |
|-------|--------|-------------------|
| 2 | `enrich_wikidata.py` | `birth_date`, `gender`, `image_url`, `city` |
| 3 | `generate_descriptions.py` | `description` |
| 5 | `fetch_candidate_birthdates.py` | `birth_date` (retry) |
| 6 | `fetch_candidate_wiki_urls.py` | `wikipedia_url` |

Stage 1 (`resolve_candidates`) is skipped — cards already exist. Stage 4 (`geocode_cities`) is skipped — lat/long are not edited on this page; run batch geocoding after city is saved.

Flow:

1. Button calls `POST /api/elections/enrich-candidate` with `{ candidateId }` (Vite dev middleware only).
2. Middleware spawns `enrich_single_candidate.py --candidate-id N --json` with service-role env vars.
3. Returned JSON is merged into the card draft for **empty fields only**; user reviews, edits, then saves via `updateElectionCandidate`.
4. Name lookups try shortened variants when the DB has middle names (e.g. `יולי יואל אדלשטיין` → `יולי אדלשטיין`) and fall back to Hebrew Wikipedia for missing URLs.
5. In production builds the button is hidden (`import.meta.env.DEV`); static hosting cannot run Python.
6. While running, the card shows a live seconds counter (e.g. `מחפש מידע חסר… 12 שניות`) and a spinner until the preview returns. If nothing is found, a warning message stays visible on the card.

Requires `SUPABASE_SERVICE_KEY` and `OPENAI_API_KEY` in `.env` alongside `VITE_ELECTIONS_EDIT_SECRET`.

### Party pipeline panel (dev only)

When a selected party has **0–2** rows in `election_candidates`, a **צינור נתונים** panel appears above the candidate list. It runs the full six-stage elections pipeline for importing a new party list from scratch.

| Step | UI | Backend |
|------|-----|---------|
| Paste list | Textarea (txt or CSV) + optional file upload | — |
| Preview | **בדוק רשימה** | `POST /api/elections/pipeline/preview` → `run_party_pipeline_api.py preview` |
| Insert + run | **התחל עיבוד** | `POST /api/elections/pipeline/insert` then sequential `POST /api/elections/pipeline/stage` (stages 1–6) |
| Review queue | **אשר התאמה** / **אדם חדש** per row, then **אשר והמשך** | `GET /api/elections/pipeline/review-queue?partyId=N` + `POST /api/elections/pipeline/resolve-review` |

Stages run one at a time from the frontend with live progress (`שלב X מתוך 6`). If stage 1 produces fuzzy matches for this party, the UI pauses for review before continuing to stages 2–6.

| Stage | Script | Action |
|-------|--------|--------|
| 1 | `resolve_candidates.py` | Match names → `election_candidates` |
| 2 | `enrich_wikidata.py` | Fill missing `birth_date`, `gender`, `image_url`, `city` |
| 3 | `generate_descriptions.py` | Generate Hebrew descriptions |
| 4 | `geocode_cities.py` | City → lat/long |
| 5 | `fetch_candidate_birthdates.py` | Retry missing birth dates |
| 6 | `fetch_candidate_wiki_urls.py` | Retry missing Wikipedia URLs |

Unlike per-card enrich, this flow **writes directly to the database** (same as CLI `insert_raw_list.py` + `run_pipeline.py`). After completion the panel hides automatically once the party has more than 2 candidates, and the normal edit cards appear.

Stages 2–6 process all 2026 candidates with null target fields (not party-scoped), matching CLI `run_pipeline.py` behavior.

Requires `npm run dev`, `SUPABASE_SERVICE_KEY`, `OPENAI_API_KEY`, and `VITE_ELECTIONS_EDIT_SECRET` in `.env`.

**Dev saves:** `npm run dev` routes writes through `/api/elections/update-candidate`, a local Vite middleware that uses `SUPABASE_SERVICE_KEY` server-side (never exposed to the browser). **Production saves** use the anon client and require the UPDATE policies in `Layer 1 - Gathering Data/Elections/anon_update_policies.sql`.

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
- `/elections/edit` requires `VITE_ELECTIONS_EDIT_SECRET`, unlocks with the password, and can save a candidate field change after anon UPDATE policies are applied.
- In dev, **השלם מידע** on a card with missing fields fills the form from pipeline preview; save persists to Supabase.
- In dev, for a party with 0–2 candidates, the party pipeline panel can paste a list, preview it, run all six stages, resolve review-queue items, and load candidate cards.

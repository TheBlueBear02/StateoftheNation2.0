# ElectionsPage

> See [ProjectOverview.md](./ProjectOverview.md), [DesignLanguage.md](./DesignLanguage.md), and [Database.md](./Database.md) for shared conventions and schema details.

Frontend module for the 2026 elections. It has a party index at `/elections`, a party detail page at `/elections/:partyId`, a list rating game at `/elections/lists`, and a password-gated candidate editor at `/elections/edit`.

## Routes

| Route | Component | Purpose |
|-------|-----------|---------|
| `/elections` | `src/pages/ElectionsPage.tsx` | Cards for confirmed parties (`party_status = 'confirmed'`) |
| `/elections/polls` | `src/pages/ElectionsPollsPage.tsx` | Weighted poll averages, trend chart, poll table |
| `/elections/lists` | `src/pages/ElectionListsGamePage.tsx` | Client-only list rating game (green / orange / red) with fit score and share image |
| `/elections/edit` | `src/pages/ElectionCandidatesEditPage.tsx` | Password-gated editor for existing candidate + person fields |
| `/elections/:partyId` | `src/pages/ElectionPartyPage.tsx` | Detail page for one party, keyed by `election_parties.id` |

Register `/elections/edit`, `/elections/lists`, and `/elections/polls` **before** `/elections/:partyId` in `src/main.tsx` so those path segments are not parsed as a party id.

The homepage hero button **בחירות 2026** links to `/elections`. The homepage project section **משחק הרשימות** links to `/elections/lists`.

## Files

| File | Role |
|------|------|
| `src/pages/ElectionsPage.tsx` / `.css` | Party index page, party-card grid, and all-parties residence map |
| `src/pages/ElectionPartyPage.tsx` / `.css` | Party detail layout and section styles |
| `src/pages/ElectionListsGamePage.tsx` / `.css` | List rating game: pick party → rate candidates → fit report + share PNG |
| `src/pages/ElectionCandidatesEditPage.tsx` / `.css` | Password gate, party picker, per-candidate edit forms, and party pipeline panel |
| `src/components/elections/lists/ListPartyPicker.tsx` | Confirmed-party picker with full-bleed list-leader photo cards |
| `src/components/elections/lists/ListRatingStep.tsx` | Tinder-style one-card rating deck with progress and action buttons |
| `src/components/elections/lists/CandidateRateCard.tsx` | Full-bleed candidate swipe card (overlay details + pointer swipe) |
| `src/components/elections/lists/ListFitReport.tsx` | Fit score report + download/share actions |
| `src/components/elections/lists/ShareableListReport.tsx` | Fixed-size offscreen card for `html-to-image` PNG export |
| `src/lib/listFitScore.ts` | Position-weighted fit score and `realisticSeatBand` helpers |
| `src/components/elections/PartyPipelinePanel.tsx` | Dev-only full pipeline UI for parties with 0–2 candidates |
| `src/components/elections/EditablePartyPanel.tsx` | Collapsible party metadata editor on `/elections/edit` |
| `src/lib/updateElectionCandidate.ts` | Anon-key updates to `people` + `election_candidates` with list-position conflict checks |
| `src/lib/updateElectionParty.ts` | Updates to `election_parties` (name, short name, color, logo, ballot letter, description) |
| `src/lib/enrichElectionCandidate.ts` | Dev-only client for per-card pipeline preview (`/api/elections/enrich-candidate`) |
| `src/lib/runElectionPartyPipeline.ts` | Dev-only client for party-level pipeline (`/api/elections/pipeline/*`) |
| `src/lib/geocodeElectionMap.ts` | Dev-only client for party-scoped map geocode (`/api/elections/geocode-map`) |
| `vite-plugins/electionsEditApi.ts` | Dev middleware: `update-candidate`, `enrich-candidate`, party pipeline, and geocode-map endpoints |
| `src/components/elections/PartyCard.tsx` | Clickable card with the top-candidate portrait on the right and the party logo pinned to the top-left corner |
| `src/components/elections/SeatsTrend.tsx` | Party-hero last-5-polls average + sparkline from `polls` / `poll_results` |
| `src/components/elections/StatsBar.tsx` | Average age, % new MKs, and % women stat blocks |
| `src/components/elections/CandidateList.tsx` | Ordered candidate cards with photo/initial fallback; shows 9 by default and loads 9 more per click |
| `src/components/elections/CandidateMap.tsx` | Public Israel map SVG with one projected dot per geocoded candidate |
| `src/components/elections/ElectionsOverviewMap.tsx` | All-parties map on `/elections` with per-party color pins and checkbox filter (default: all parties) |
| `src/components/elections/CandidateMapTooltip.tsx` | Fixed-position map tooltip matching the Knesset page style, showing city instead of faction |
| `src/lib/candidateMapProjection.ts` | Shared Israel map projection and pin offset logic for `CandidateMap` and `ElectionsOverviewMap` |
| `src/hooks/useElectionParties.ts` | Fetches the 2026 election row and its parties |
| `src/hooks/useElectionCandidates.ts` | Fetches party candidates, flags new MKs, computes stats, normalizes map pins, and exposes `refetch` |
| `src/hooks/useAllElectionMapPins.ts` | Fetches geocoded candidates across all parties for the `/elections` overview map |

## Data Flow

`useElectionParties` first tries to load `elections.year = 2026` for page title/date metadata. All party queries filter `party_status = 'confirmed'` so historical and polled_only rows (seeded for the polls pipeline) never appear on `/elections`. Confirmed parties include ישר (promoted from polled_only). `ElectionsPage.tsx` uses `elections.date` for the hero countdown (`עוד X יום לבחירות`). The hero links to `/elections/polls` for weighted poll averages.

`useElectionCandidates(partyId)` loads ordered `election_candidates` joined to `people`. It then queries `knesset_memberships` for those `person_id`s with `start_date` and `end_date`, merges overlapping terms with `computeMemberTenureStats`, and attaches `totalDaysInKnesset` / `totalYearsInKnesset` to each candidate and map pin:

`useAllElectionMapPins(parties)` loads all geocoded candidates for the supplied party ids in one query (`city`, `latitude`, and `longitude` all non-null), joins MK tenure the same way, and attaches `partyId`, `partyName`, and `partyColor` for multi-party map rendering on `/elections`.

- A candidate is a **new MK** when no membership row exists for their `person_id`.
- Former/current MKs show tenure in the candidate list and map tooltip as years only (e.g. `3.4 שנים בכנסת`), using `formatTenureYears`.
- Average age is computed only from non-null `people.birth_date`.
- % women is computed from non-null `people.gender` rows where `gender === 'נקבה'`.
- Map pins use only candidates with non-null `city`, `latitude`, and `longitude`.

Null source data is displayed honestly with coverage labels or empty states; the frontend does not guess missing demographic or coordinate values.

The election data pipeline runs six stages: resolve candidates, general Wikidata enrichment, generate descriptions, geocode cities, `fetch_candidate_birthdates.py` for any remaining null `people.birth_date` values, then `fetch_candidate_wiki_urls.py` for any remaining null `people.wikipedia_url` values. Those final two stages update only their target field on `people`, so frontend age coverage and **קרא עוד** links improve without changing candidate descriptions, cities, map coordinates, gender, or images.

The frontend uses `VITE_SUPABASE_ANON_KEY`, not the service key. If service-role scripts can see parties but `/elections` shows an empty list, check public `select` policies for `elections`, `election_parties`, and `election_candidates` (see [Database.md](./Database.md)).

## List Rating Game (`/elections/lists`)

Client-only game (no DB writes). Flow: **pick party → rate every candidate → fit report**. Ratings live in React state for the session; choosing another party resets them. There is no multi-party comparison board.

1. **Party picker** — confirmed parties from `useElectionParties`. Parties without a list leader (no `list_position = 1`) are disabled. Each card is a full-bleed list-leader portrait with a black bottom gradient, white party name + leader name overlaid at the bottom, and the party logo pinned to the top corner. Breadcrumb is `בחירות 2026 / משחק הרשימות` (both linked: `/elections` and `/elections/lists`). After a party is chosen, the breadcrumb becomes `בחירות 2026 / משחק הרשימות / {party}`; clicking **משחק הרשימות** returns to the picker.
2. **Rating deck (Tinder-style)** — one candidate at a time from `useElectionCandidates`, in list order. The portrait fills the card down to a black action strip; name, age, chips, and description are overlaid on the image bottom with a gradient for legibility. List-position badge (top-right), Wikipedia link when available. Gender is not shown on the card. Candidates in the realistic seats band show a “בטווח המנדטים הריאלי” badge.
3. **Rating actions** — three circular buttons in a black bottom strip on the card (Tinder-style): green ♥ (רוצה לראות בכנסת), orange ? (לא יודע / לא אכפת), red ✕ (לא רוצה לראות בכנסת). Dark fill, colored border; the strip and buttons move with the card on swipe/fly-out.
4. **Mobile swipe** — pointer drag on the card: right = green, left = red, up = orange (physical screen directions). Drag tints the card border to the choice color; releasing past the threshold flies the card out.
5. **Progress** — after the last rating the game advances automatically to the fit report (no on-card counter).
6. **Realistic seats band** — `E = round(seatsAvg)` from the last 5 regular polls. Positions `E−1`, `E`, and `E+1` (clamped to `1…N`) mark the realistic zone on cards with a badge. No separate band summary text is shown above the deck.
7. **Fit score** — position-weighted: green=1, orange=0.5, red=0; weight for position `p` is `N − p + 1`. Score = `round(100 × Σ(rating×weight) / Σ(weight))`.
8. **Report / share** — single dark-blue card (`#0a1628`): white share icon (top-left) exports/shares a PNG; white site logo top-right; fit score and rating counts centered in white at the top; candidates in list order as small portrait cards (same 3∶4.2 ratio as the swipe cards) with green/orange/red borders, a list-position badge on each card, and no names. The portrait grid uses `direction: ltr` so place 1 starts on the left and continues left-to-right (rows wrap naturally). Below the card: centered **בחר מפלגה אחרת** and a Hebrew note explaining the weighted score (green=1, orange=0.5, red=0; higher list positions weigh more; 0–100).

## Candidate Edit Page (`/elections/edit`)

Lightweight private tool for editing **existing** candidates only (no add/delete). Access is gated by comparing a submitted password to `VITE_ELECTIONS_EDIT_SECRET` in the browser; a successful unlock is stored in `sessionStorage` under `elections-edit-unlocked`. If the env var is missing, the page shows a config error instead of opening.

After unlock, pick a party (same square `<select>` pattern as Knesset/Government) and edit one candidate card at a time. Each card is **collapsed by default**, showing list position, photo, and full name; click the summary row to expand the full edit form. Collapsed rows with empty fields show **חסר:** followed by the missing field labels (e.g. `תיאור · עיר · תמונה`). Unsaved changes show **יש שינויים לא שמורים** on the collapsed row. Each card saves independently via `updateElectionCandidate`.

Above the candidate list, a collapsible **פרטי מפלגה** panel (`EditablePartyPanel`) edits the selected party row in `election_parties`. It saves independently via `updateElectionParty`.

| UI field | Table | Column |
|----------|-------|--------|
| שם מלא | `election_parties` | `name` |
| שם קצר | `election_parties` | `short_name` |
| צבע (hex) | `election_parties` | `color` |
| קישור לוגו | `election_parties` | `logo_url` |
| אות על גלגלת | `election_parties` | `ballot_letter` |
| תיאור | `election_parties` | `description` |

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

### Party map geocode (dev only)

After selecting a party, the toolbar shows **עדכן מפה** when `import.meta.env.DEV` is true. One click runs pipeline Stage 4 (`geocode_cities.py`) scoped to that party's candidates with a non-null `city` and null `latitude` — the same rows that appear as pins on `/elections/:partyId`.

| Step | UI | Backend |
|------|-----|---------|
| Status hint | Count of candidates with city but missing coordinates | — |
| Geocode | **עדכן מפה** | `POST /api/elections/geocode-map` → `run_party_pipeline_api.py geocode-map --party-id N` |

Unlike the full party pipeline, this only geocodes the selected party (not all 2026 candidates). Nominatim rate-limits to ~1 city/second; the UI shows a live seconds counter while running. Timeout: 15 minutes (same as pipeline stage 4).

When a candidate's `city` is edited and saved, `latitude` / `longitude` are cleared so stale pins are not shown; run **עדכן מפה** after saving city changes.

Requires `npm run dev`, `SUPABASE_SERVICE_KEY`, and `VITE_ELECTIONS_EDIT_SECRET` in `.env`.

**Dev saves:** `npm run dev` routes writes through `/api/elections/update-candidate` and `/api/elections/update-party`, local Vite middleware that uses `SUPABASE_SERVICE_KEY` server-side (never exposed to the browser). **Production saves** use the anon client and require the UPDATE policies in `Layer 1 - Gathering Data/Elections/anon_update_policies.sql` (including `election_parties`).

## Seats Trend (party hero)

`SeatsTrend.tsx` loads recent polls via `usePolls(30)` and derives a per-party snapshot with `computePartyLastNTrend` in `pollChartData.ts`:

- Takes the 5 most recent non-scenario polls with `fieldwork_end` on or before today (Jerusalem), same filter as `/elections/polls`.
- **Average:** mean of that party's seats across polls where it appeared with a non-null seat count (rounded for display).
- **Sparkline:** chronological seat points (oldest → newest) for those same polls; missing results render as `0`. Hovering a point shows a fixed tooltip with seats, fieldwork dates, pollster, publisher, and sample size (same metadata pattern as the polls bloc chart). Larger invisible hit targets make the small dots easy to hover.
- Label: **ממוצע N הסקרים האחרונים**; link to `/elections/polls`. Empty / error states show `—` without a chart.

Rendered as a compact block in the party detail hero (visual left column on desktop).

## Static Israel Map

`CandidateMap.tsx` is dependency-free. It uses:

- `public/images/elections page/israel map.svg` as the base map image,
- a calibrated projection for that slanted asset: latitude maps across the full `598px` height, while x-position uses a longitude/latitude affine calibration so northern, central, and southern points sit on the visible map,
- clamping so outlier geocodes do not escape the map viewBox,
- a small deterministic spread for candidates with identical city coordinates so each candidate still gets a visible dot.

Pins use the party color, render larger than the original static dots, and expose a Knesset-style fixed tooltip on hover/focus: borderless circular photo or initials, candidate name, city (instead of faction name), and MK tenure when available. When `election_parties.logo_url` is present, a small party logo badge is pinned to the top-left corner of the map section (same placement pattern as the party index cards). The map coverage label beside the SVG reads **מציג X מועמדים מרשימת {party}**, where X is the number of geocoded candidates shown as pins and `{party}` is the party `shortName` (fallback: full `name`).

## All-Parties Overview Map (`/elections`)

Below the party grid, `ElectionsOverviewMap` shows geocoded candidates from every party on the same Israel SVG. Each pin uses its party color. A checkbox filter lists only parties that have at least one geocoded candidate; **all such parties are selected by default**. Users can toggle individual parties or use **בחר הכל** / **נקה**. The coverage label reads **מציג X מועמדים מ-Y מפלגות** when at least one party is selected. Tooltips show candidate name, party name, city, and MK tenure when available.

## Styling

The module follows [DesignLanguage.md](./DesignLanguage.md):

- RTL-first layout via `SiteLayout`.
- White cards, subtle borders, no border radius.
- Page and hero backgrounds are flat white (no soft blue gradient washes), per [DesignLanguage.md](./DesignLanguage.md). The election date renders as plain bold text, without a chip background or border.
- The party list section header shows only the title **המפלגות המתמודדות**; it does not include explanatory copy under the title.
- Below the party grid, the overview map uses the same card header as the party detail map (**איפה גרים המועמדים**); party filter chips use each party color as a swatch.
- The party index grid renders three cards per row on desktop, two on narrower tablet widths, and one on mobile.
- Party cards show the top-candidate portrait section only when an image exists in `people.image_url`; the portrait is flush to the right edge and fills the card height, while an enlarged party logo is pinned to the top-left corner. Cards do not render a per-party color accent line.
- Party color is passed through CSS custom property `--party-color` and appears as a subtle left-side background wash plus hover border treatment.
- The `/elections/:partyId` party detail sections are borderless; section separation comes from spacing and white backgrounds rather than boxed outlines or hero side accents. The party hero uses three desktop columns: logo, party copy, and the seats trend on the visual left. The hero title is capped at `4rem`, wraps within the middle column (`min-width: 0` + `overflow-wrap: anywhere`), and must not overlap the seats column; the compact seats block keeps an opaque white background and sits above adjacent content when columns are tight. Stats blocks are centered within their cells and have no border.
- Candidate list cards use larger borderless full-height portrait/initial columns that sit flush against the card side with no edge padding; the list position number sits as an overlay in the visual top-left corner. Former MKs also show tenure under the city line in smaller muted text (`0.8rem`, e.g. `3.4 שנים בכנסת`). When `election_candidates.city` is null, the city line shows **לא ידוע מקום מגורים**. When a candidate has both a generated description and `people.wikipedia_url`, the description ends with an external **קרא עוד** link to the Hebrew Wikipedia article.
- Mobile layouts collapse to one column.

## Verification

```bash
npm run lint
npm run build
```

Manual checks:

- `/elections` loads all parties and card links, plus the all-parties residence map with party filter.
- `/elections/:partyId` renders a breadcrumb (`בחירות 2026 / {party}` linking back to `/elections`), the party header, live seats trend from last 5 polls, stats, candidate list, and map.
- Parties without candidate rows show empty candidate/map states.
- `/elections/edit` requires `VITE_ELECTIONS_EDIT_SECRET`, unlocks with the password, and can save a candidate field change after anon UPDATE policies are applied.
- `/elections/edit` party panel can save party name, color, logo, ballot letter, and description for the selected party.
- In dev, **השלם מידע** on a card with missing fields fills the form from pipeline preview; save persists to Supabase.
- In dev, for a party with 0–2 candidates, the party pipeline panel can paste a list, preview it, run all six stages, resolve review-queue items, and load candidate cards.
- In dev, **עדכן מפה** geocodes candidates with city but missing coordinates for the selected party; pins appear on `/elections/:partyId` after a successful run.

# Elections 2026 — בחירות 2026

Feature doc for the `/elections` module of **מצב האומה**. Covers the data model, the automated data-gathering pipeline, and the sources each field comes from. Read [ProjectOverview.md](./ProjectOverview.md) first.

## Scope

A page presenting the 2026 election: parties running on the ballot, each party's ordered candidate list with profiles, four aggregate stats per party (average age, % women, % new MKs, % served in military — see note), and a map of where candidates live.

> **Note on military stat:** `served_in_military` was dropped from the schema — the data isn't systematically published for all candidates and would be mostly null. The three reliable stats are **average age**, **% women**, and **% new MKs**. Revisit if a good source appears.

## Data Model

Four new tables plus a staging table. `people` is **not** modified — election-specific facts (city, coordinates) live on `election_candidates`, since a person's residence is an election-context fact and can change between elections.

### `elections`
```sql
CREATE TABLE public.elections (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  year           integer NOT NULL,
  date           date,
  name           text,
  knesset_number integer
);
```

### `election_parties`
```sql
CREATE TABLE public.election_parties (
  id                 bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  election_id        bigint NOT NULL REFERENCES public.elections(id),
  knesset_faction_id bigint REFERENCES public.knesset_factions(id), -- nullable; wired post-election
  name               text NOT NULL,
  short_name         text,
  color              text,
  logo_url           text,
  ballot_letter      text,
  description        text
);
```

`knesset_faction_id` is null before the election and links each ballot party to its resulting Knesset faction afterward.

### `election_candidates`
```sql
CREATE TABLE public.election_candidates (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  election_id   bigint NOT NULL REFERENCES public.elections(id),
  party_id      bigint NOT NULL REFERENCES public.election_parties(id),
  person_id     bigint NOT NULL REFERENCES public.people(id),
  list_position integer NOT NULL,
  description   text,
  city          text,
  latitude      numeric(9,6),
  longitude     numeric(9,6),
  UNIQUE (party_id, list_position),
  UNIQUE (party_id, person_id)
);
```

The two unique constraints prevent duplicate list positions and the same person appearing twice on one party's list — guarding against seed/pipeline bugs.

### `raw_candidate_lists` (staging)
```sql
CREATE TABLE public.raw_candidate_lists (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  election_id   bigint NOT NULL REFERENCES public.elections(id),
  party_id      bigint NOT NULL REFERENCES public.election_parties(id),
  raw_name      text NOT NULL,          -- exactly as published
  list_position integer NOT NULL,
  raw_city      text,                    -- if the party published it
  processed     boolean DEFAULT false,   -- pipeline flips this
  created_at    timestamptz DEFAULT now()
);
```

The manual insert point. Keeps the pipeline idempotent and re-runnable.

## Definitions

- **New MK:** a candidate who was never an MK before — no matching row in `knesset_memberships` for their `person_id`.
- **Stats scope:** computed at query time over the candidates that have the relevant field non-null. Coverage is displayed honestly (e.g. "average age of 94 of 120 candidates with known birth date") rather than hiding nulls.

## Data Sources

| Source | URL | Provides |
|--------|-----|----------|
| Knesset OData API | `knesset.gov.il/Odata/ParliamentInfo.svc/` | Existing/former MKs: birth date, gender, faction history. Source of truth for the "new MK" check. |
| Hasadna "Open Knesset" pipeline | `production.oknesset.org/pipelines/data/` | Clean, daily-updated CSVs (`mk_individual`, `factions`, `faction_memberships`). Primary MK/person sync. Python package `knesset-data` on PyPI. |
| Wikidata SPARQL | `query.wikidata.org/sparql` | Newcomers not in the Knesset API: birth date (P569), gender (P21), image (P18), residence (P551). Free, no key. Thin coverage for low-profile candidates. |
| data.gov.il (CKAN) | `data.gov.il/api/` | CBS official settlement list (~1,300 towns) + street DB. Reference for validating `city`. |
| GovMap | `govmap.gov.il` | Authoritative Hebrew-address geocoder. `city` → lat/long. Fallbacks: geocode.xyz, OSM/Nominatim. |
| Central Elections Committee | `bechirot.gov.il`, `votesXX.bechirot.gov.il` | Legal source of truth for certified lists and results. HTML/scrape; final lists ~40 days before election day. |

## Field Acquisition Map

| Field | Source | Automatability |
|-------|--------|----------------|
| `elections.*` | Manual (one row) | trivial |
| `election_parties` name / ballot_letter | Elections Committee + Wikipedia | medium (scrape) |
| `election_parties` color / logo_url | Manual curation | low (one-time, small) |
| `election_parties.knesset_faction_id` | Own `knesset_factions` | high (post-election join) |
| `election_candidates` person_id + position | Elections Committee → `people` | medium (the hard part) |
| `people.birth_date`, `people.gender` | Knesset API / Hasadna → Wikidata fallback | high |
| % new MK | Knesset memberships | high |
| `election_candidates.city` | Wikidata residence → news/party sites | medium |
| `election_candidates.lat/long` | GovMap | high |
| `election_candidates.description` | Wikidata / Wikipedia intro (AI-summarized) | medium |

## Automation Pipeline

**Trigger:** you manually insert each party's ordered list into `raw_candidate_lists` when the party publishes it. Everything downstream runs off `processed = false` rows and is fully automatable.

```
raw_candidate_lists (processed=false)
        │
        ▼
[1] Normalize name ──► strip titles (ד"ר, פרופ'), normalize geresh/quotes, trim
        │
        ▼
[2] Entity resolution
        │ deterministic match on people.full_name / knesset_person_id
        ├─ matched (high conf) ──────────► person_id
        ├─ fuzzy/AI match (mid conf) ──► review queue if below threshold
        └─ no match ──► NEW person
        │
        ▼
[3] Enrich person
        │ Knesset API (MKs) · Wikidata SPARQL (new):
        │ birth_date, gender, image_url, residence
        │ (missing → stays NULL, never guessed)
        ▼
[4] Resolve city ──► raw_city ?? Wikidata residence
        ▼
[5] Geocode (GovMap) ──► lat/long
        ▼
[6] AI description ──► Wikipedia intro → neutral Hebrew bio
        ▼
[7] Compute is_new_mk ──► exists in knesset_memberships?
        ▼
[8] Upsert election_candidates ON CONFLICT (party_id, person_id)
        ▼
mark raw row processed=true
```

### Auto-commit vs. review queue

| Outcome | Action |
|---------|--------|
| Deterministic person match + enrichment succeeded | Auto-commit |
| AI match above confidence threshold | Auto-commit |
| AI match below threshold / ambiguous | Review queue |
| New person, Wikidata found birth_date + gender | Auto-commit |
| New person, no structured data found | Review queue (manual bio/DOB) |
| Geocode failed (unusual spelling) | Commit row, flag city for review |

The review queue is small — a handful of names per list — and is the only human touch after the initial insert.

### Handling list changes

Lists shuffle before finalization (primaries, surplus agreements, בג"ץ disqualifications). Because everything keys off `raw_candidate_lists` and upserts on `(party_id, person_id)`:

- Re-insert the updated list → re-run → positions update, new names enriched.
- Dropped names: delete `election_candidates` rows for that party whose `person_id` is absent from the latest raw list.
- Already-enriched people are skipped (they already have a birth_date in `people`), so re-runs are cheap — only genuinely new names hit Wikidata/GovMap.

### Where AI is used (and where it isn't)

**Used:** fuzzy name/entity resolution (Hebrew name variants), `description` bio generation from Wikipedia intros, parsing unstructured list announcements (press releases, images) into rows.

**Not used:** birth dates, gender, cities. These are facts — pulled from structured sources or left null. A civic-data site's credibility depends on never showing a fabricated statistic.

## Pipeline Scripts

Add under `knesset-db-scripts/`. Everything except list scraping and candidate resolution is fully automatable and recurring.

```
knesset-db-scripts/
├── sync_knesset_people.py     # Hasadna CSVs + Knesset OData → people, factions (recurring)
├── enrich_wikidata.py         # SPARQL → fill missing birth_date/gender/image/residence
├── scrape_election_lists.py   # Elections Committee → raw lists (nomination window only)
├── resolve_candidates.py      # AI-assisted matching → election_candidates + descriptions
├── geocode_cities.py          # GovMap → lat/long from city
└── link_factions.py           # post-election: election_parties ↔ knesset_factions
```

Can also be one orchestrator with six functions, triggered manually after each insert or on a schedule polling for `processed = false`.

## Frontend Notes

Stats and map need **no separate aggregation job**. Once a candidate row is committed, average age, % women, % new MK, and map pins all recompute at page load from `election_candidates`. The pipeline's only job is getting clean rows in.

Planned files (see ProjectOverview conventions):
```
src/pages/ElectionsPage.tsx / .css
src/components/elections/
  ├── PartyCard.tsx        # logo, name, ballot letter
  ├── CandidateList.tsx    # ordered list, photo, position
  ├── StatsBar.tsx         # age / women % / new MK %
  └── CandidateMap.tsx     # city pins, party-colored (React Leaflet)
src/hooks/useElectionParties.ts
src/hooks/useElectionCandidates.ts
```
Route: `/elections` → `ElectionsPage` in `main.tsx`.

## Open Decisions

1. Launch with partial (existing-MK-only) data now and fill in over the fall, or hold until certified lists exist?
2. `description` / `city`: AI-enriched with an approval queue, or strictly structured sources even if that means more nulls?
3. Map scope: all candidates, or top-of-list only, to avoid clutter?

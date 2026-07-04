# Elections 2026 — בחירות 2026

Feature doc for the `/elections` module of **מצב האומה**. Covers the data model, the full workflow for adding party lists, and the automated pipeline that enriches them. Read [ProjectOverview.md](./ProjectOverview.md) first.

## Scope

A page presenting the 2026 election: parties running on the ballot, each party's ordered candidate list with profiles, three aggregate stats per party (average age, % women, % new MKs), and a map of where candidates live.

Three stats only — `served_in_military` was dropped because the data isn't systematically published and would be mostly null.

---

## Workflow — When a Party Publishes Their List

This is the repeating cycle you run each time a party publishes or updates their candidate list.

### Step 1 — Prepare the list file

Copy the names from the party website, news article, or press release into a plain text file — one name per line, in order:

```
# likud.txt
בנימין נתניהו
יריב לוין
דוד אמסלם
מירי רגב
...
```

Lines starting with `#` are ignored. You can also use a CSV if the party published cities:

```
# beyachad.csv
שם,עיר
נפתלי בנט,רעננה
יאיר לפיד,תל אביב
```

### Step 2 — Preview the insert (optional but recommended)

```bash
python insert_raw_list.py --party "הליכוד" --file likud.txt --dry-run
```

Prints the parsed list with positions so you can spot formatting issues before writing anything.

### Step 3 — Insert into `raw_candidate_lists`

```bash
python insert_raw_list.py --party "הליכוד" --file likud.txt
```

This inserts all rows with `processed = false`. If you're re-inserting an updated list for the same party, existing unprocessed rows are deleted and replaced automatically.

If you're not sure of the exact party short name:

```bash
python insert_raw_list.py --list-parties
```

### Step 4 — Run the pipeline

```bash
python run_pipeline.py
```

Picks up all `processed = false` rows across all parties and runs all five stages. If you just inserted one party it processes that party; if you inserted three back to back it processes all three in one run.

### Step 5 — Handle the review queue (if it appears)

If any names couldn't be matched confidently, `review_queue.json` is created. Open it — each item shows the raw name, the best match found, and its confidence score:

```json
{
  "raw_name": "דוד ביטן",
  "best_match": "דוד ביטן",
  "score": 0.78,
  "action": "pending"
}
```

Set `"action"` to `"approve"` (use the best match) or `"new"` (genuinely new person, not in DB). Then:

```bash
python resolve_candidates.py --approve
```

In practice the review queue is small — most realistic candidates are existing or former MKs who exact-match.

### Step 6 — Verify in Supabase

Check `election_candidates` for the party. Rows should have `description` filled, `city` filled where Wikidata had residence data, and `latitude`/`longitude` filled. The linked `people` rows should have `birth_date` where Wikidata exposes one. Nulls are genuinely missing from sources — not a bug.

### When the list changes

Party lists shuffle constantly until the Elections Committee certifies them (primaries, surplus agreements, בג"ץ disqualifications). The cycle is the same — re-run steps 1–5 with the updated file. `insert_raw_list.py` replaces the old unprocessed rows. For candidates who dropped off the list, run this cleanup after the pipeline:

```sql
DELETE FROM election_candidates
WHERE party_id = <party_id>
  AND person_id NOT IN (
    SELECT p.id FROM people p
    INNER JOIN raw_candidate_lists r ON r.raw_name = p.full_name
    WHERE r.party_id = <party_id>
  );
```

---

## Scripts Reference

All scripts live under `Layer 1 - Gathering Data/Elections/`:

```
Elections/
├── insert_raw_list.py         # Insert a party list file → raw_candidate_lists
├── run_pipeline.py            # Orchestrator — runs all 5 pipeline stages
├── resolve_candidates.py      # Stage 1: name matching → election_candidates
├── enrich_wikidata.py         # Stage 2: Wikidata → birth_date / gender / image / city
├── generate_descriptions.py   # Stage 3: OpenAI → description
├── geocode_cities.py          # Stage 4: Nominatim → lat/long
└── fetch_candidate_birthdates.py # Stage 5: retry missing people.birth_date
```

Knesset data sync (separate, runs weekly via GitHub Actions):

```
Layer 1 - Gathering Data/knesset/
└── sync_knesset_data.py       # Knesset OData → all 7 Knesset tables
```

### insert_raw_list.py flags

| Flag | Description |
|------|-------------|
| `--party "שם"` | Party short_name — must match `election_parties.short_name` exactly |
| `--file path` | Path to `.txt` or `.csv` list file |
| `--dry-run` | Preview parsed list, no DB writes |
| `--list-parties` | Print all available party short names and exit |

### run_pipeline.py flags

| Flag | Description |
|------|-------------|
| _(no flags)_ | Full run on all `processed=false` rows |
| `--test` | Seed 5 known MK fixtures then run all stages |
| `--dry-run` | Print what would happen, no DB writes |
| `--stage 1–5` | Run one stage only |
| `--skip-enrich` | Skip the general Wikidata enrichment stage (Stage 2) |

### resolve_candidates.py flags

| Flag | Description |
|------|-------------|
| `--approve` | Process `review_queue.json` after human review |
| `--list-parties` | Print available party short names |
| `--dry-run` | Print matches, no writes |

### Dependencies

```bash
pip install supabase python-dotenv requests geopy openai
```

`.env` must contain:

```
SUPABASE_URL=...
SUPABASE_SERVICE_KEY=...
OPENAI_API_KEY=...
```

No other API keys required — Nominatim is free and keyless.

---

## Pipeline Internals

### What each stage does

**Stage 1 — `resolve_candidates.py`**
Reads all `processed=false` rows from `raw_candidate_lists`. For each name:
normalises it (strips titles like ד"ר, פרופ', הרב), then tries to match against the full `people` table. Exact match or fuzzy ≥ 0.85 → auto-commit to `election_candidates`. Fuzzy 0.65–0.84 → `review_queue.json`. No match → new row created in `people`. Marks each raw row `processed=true` when done.

**Stage 2 — `enrich_wikidata.py`**
For every candidate in `election_candidates`, runs a SPARQL query against Wikidata. Fills `NULL` fields only — never overwrites existing values. Enriches `people.birth_date`, `people.gender`, `people.image_url`, and `election_candidates.city` (from Wikidata residence P551). Batches 10 names per query. Rate-limited to 1 req/sec.

**Stage 3 — `generate_descriptions.py`**
For every candidate without a description: fetches the Wikipedia Hebrew article intro (first 500 chars), then sends it to OpenAI GPT-4o-mini with a tight prompt to produce a 2-sentence neutral Hebrew bio. Writes to `election_candidates.description`.

**Stage 4 — `geocode_cities.py`**
For every candidate with a `city` but no coordinates: geocodes via Nominatim (OpenStreetMap), constrained to Israel (`country_codes="il"`). Cities are cached in memory — each unique city only hits the API once. Rate-limited to 1.1 req/sec automatically via `RateLimiter`.

**Stage 5 — `fetch_candidate_birthdates.py`**
For candidates in the 2026 election whose linked `people.birth_date` is still null: runs batched Hebrew-name SPARQL queries against Wikidata and updates only `people.birth_date`. This final pass is intentionally narrow and idempotent; it does not modify gender, images, cities, descriptions, or coordinates.

### Matching tiers

| Tier | Condition | Action |
|------|-----------|--------|
| Exact | Normalised names match exactly | Auto-commit |
| Fuzzy high | Score ≥ 0.85 | Auto-commit |
| Fuzzy mid | Score 0.65–0.84 | Review queue |
| No match | Score < 0.65 | New person created |

### Where AI is used (and where it isn't)

**Used:** fuzzy name matching for Hebrew name variants; description generation via OpenAI from Wikipedia intros.

**Not used:** birth dates, gender, cities, coordinates. These are facts pulled from structured sources or left null. A civic-data site's credibility depends on never showing a fabricated statistic.

---

## Data Model

Four new tables plus a staging table. `people` is **not** modified — election-specific facts (city, coordinates) live on `election_candidates`.

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
Seeded with one row: `year=2026, date='2026-10-27', name='בחירות לכנסת ה-26', knesset_number=26`.

### `election_parties`
```sql
CREATE TABLE public.election_parties (
  id                 bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  election_id        bigint NOT NULL REFERENCES public.elections(id),
  knesset_faction_id bigint REFERENCES public.knesset_factions(id),
  name               text NOT NULL,   -- full: "הליכוד בראשות בנימין נתניהו"
  short_name         text,            -- pipeline key: "הליכוד"
  color              text,
  logo_url           text,
  ballot_letter      text,            -- NULL until Elections Committee certifies
  description        text
);
```

`knesset_faction_id` is null before the election. Wired to the resulting Knesset faction post-election via `link_factions.py`. `short_name` is the key used by `insert_raw_list.py` and the pipeline — must match exactly.

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

### `raw_candidate_lists` (staging)
```sql
CREATE TABLE public.raw_candidate_lists (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  election_id   bigint NOT NULL REFERENCES public.elections(id),
  party_id      bigint NOT NULL REFERENCES public.election_parties(id),
  raw_name      text NOT NULL,
  list_position integer NOT NULL,
  raw_city      text,
  processed     boolean DEFAULT false,
  created_at    timestamptz DEFAULT now()
);
```

The only manual insert point. Written by `insert_raw_list.py`, read by the pipeline, never touched by the frontend.

---

## Data Sources

| Source | Provides | Cost |
|--------|----------|------|
| Knesset OData API (`knesset.gov.il/Odata/ParliamentInfo.svc/`) | All MK history — `people`, `knesset_factions`, `knesset_memberships` | Free |
| Wikidata SPARQL (`query.wikidata.org/sparql`) | birth date, gender, image, residence for candidates | Free, no key |
| Nominatim via geopy | Hebrew city → lat/long | Free, no key |
| Wikipedia Hebrew API (`he.wikipedia.org/api/rest_v1/`) | Article intros for bio generation | Free, no key |
| OpenAI GPT-4o-mini | 2-sentence Hebrew bios | Paid (cheap — ~$0.01 per 100 candidates) |

---

## Definitions

- **New MK:** no matching row in `knesset_memberships` for the candidate's `person_id` — never served in any Knesset before.
- **Stats scope:** computed at query time over non-null rows. Coverage shown honestly (e.g. "ממוצע גיל של 94 מתוך 120 מועמדים") — nulls never hidden or guessed.

---

## Knesset Sync — Confirmed OData Field Names

Verified against the live API. Relevant for anyone maintaining `sync_knesset_data.py`:

| Entity | Key findings |
|--------|-------------|
| `KNS_KnessetDates` | Multiple rows per Knesset (one per plenum session) — aggregated by `KnessetNum` using `min(PlenumStart)` / `max(PlenumFinish)`. `KNS_Knesset` does not exist. |
| `KNS_Person` | Use `GenderDesc` directly (`"זכר"`/`"נקבה"`), not `GenderID`. `BirthDate` may be absent. |
| `KNS_Faction` | End date is `FinishDate`, not `EndDate`. |
| `KNS_PersonToPosition` | End date is `FinishDate`. Government field is `GovernmentNum`. MK positions: `PositionID=43` (חבר הכנסת), `PositionID=61` (חברת הכנסת). |
| `KNS_GovMinistry` | No `NameEng` or `IsShown` fields. |
| `KNS_Government` | Does not exist — government numbers derived from `KNS_PersonToPosition.GovernmentNum`. |

---

## Frontend Notes

Stats and map require no separate aggregation job — they recompute at page load directly from `election_candidates`. The pipeline's only job is getting clean rows in.

```
src/pages/ElectionsPage.tsx / .css
src/pages/ElectionPartyPage.tsx / .css
src/components/elections/
  ├── PartyCard.tsx        # short_name, logo, color, ballot_letter
  ├── SeatsTrend.tsx       # temporary mock seats average + decorative trend
  ├── CandidateList.tsx    # ordered list, photo, position, description
  ├── StatsBar.tsx         # avg age / % women / % new MK
  └── CandidateMap.tsx     # static SVG Israel map with projected city pins
src/hooks/useElectionParties.ts
src/hooks/useElectionCandidates.ts
```

Routes in `main.tsx`:

- `/elections` → `ElectionsPage`
- `/elections/:partyId` → `ElectionPartyPage` keyed by `election_parties.id`

Poll averages and seat trend history are not in the DB yet. `SeatsTrend.tsx` uses a clearly labeled `MOCK_SEATS` placeholder until a real polling table exists.

---

## Open Decisions

1. Launch with partial (existing-MK-only) data now and fill in as lists are published, or hold the page until certified lists exist?
2. Map scope: all candidates, or top-of-list only to avoid clutter?
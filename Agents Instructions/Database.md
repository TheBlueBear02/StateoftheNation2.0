# Database Schema — מצב האומה

Reference doc for all Supabase tables. Covers what each table stores, where its data comes from, which fields matter, and how tables relate to each other. Read alongside [ProjectOverview.md](./ProjectOverview.md).

---

## Overview

The schema is split into four logical groups:

| Group | Tables | Status |
|-------|--------|--------|
| **Knesset** | `people` · `knessets` · `knesset_factions` · `knesset_memberships` | Live — powers the Knesset page |
| **Government** | `governments` · `offices` · `minister_appointments` | Seeded — powers the Government page |
| **KPI data** | `indexes` · `index_data` | Seeded — dashboard page planned |
| **Elections** | `elections` · `election_parties` · `election_candidates` · `raw_candidate_lists` | Live — `/elections`, party detail, lists game, edit |
| **Polls** | `polls` · `poll_results` · `poll_aggregates` · `poll_party_aliases` · `party_lineage` · `raw_poll_rows` · `pipeline_sync_state` · `pipeline_runs` · `pollster_house_effects` · `poll_publishers` | Live — `/elections/polls`, `/piplines` |
| **Site** | `site_updates` | Live — homepage news strip |

All data is populated and kept current by Python scripts in `Layer 1 - Gathering Data/` using `SUPABASE_SERVICE_KEY` (bypasses RLS). The public site reads via the anon key (SELECT only). The password-gated editor at `/elections/edit` writes through Next Route Handlers (`/api/elections/update-candidate`, `/api/elections/update-party`) that use the service key server-side and require `x-elections-edit-secret` / `x-pipeline-edit-secret` — not through anon UPDATE.

---

## Entity Relationship Summary

```
people ──────────────────┬── knesset_memberships ── knessets
        │                │         └── knesset_factions
        │                │
        ├── minister_appointments ── governments ── knessets
        │         └── offices
        │
        └── election_candidates ── election_parties ── elections
                                          └── knesset_factions (post-election)

raw_candidate_lists ──► election_candidates  (via pipeline)

polls ── poll_results ── election_parties
poll_aggregates ── election_parties
raw_poll_rows ──► polls  (via pipeline)
poll_party_aliases ── election_parties
party_lineage ── election_parties

offices ── indexes ── index_data
```

---

## Knesset Group

### `people`

The central person record. Every MK, minister, and election candidate across all Knessets resolves to a row here.

| Column | Type | Description |
|--------|------|-------------|
| `id` | bigint | Primary key |
| `full_name` | text | Full Hebrew name — "FirstName LastName" format |
| `knesset_person_id` | integer | Official ID from the Knesset OData API (`KNS_Person.PersonID`). UNIQUE. Used as the stable cross-reference key. |
| `birth_date` | date | May be null — not all persons have it in the Knesset API |
| `gender` | text | `"זכר"` or `"נקבה"` — sourced directly from `KNS_Person.GenderDesc` |
| `image_url` | text | Photo URL — local path or Wikidata image |
| `email` | text | From Knesset OData |
| `twitter_handle` | text | Manual / Wikidata enrichment |
| `wikipedia_url` | text | `fetch_candidate_wiki_urls.py` (Stage 6) / manual |
| `is_current` | boolean | Whether the person is a current MK — from `KNS_Person.IsCurrent` (OData mirror). Public pages do **not** rely on this; they use membership/appointment date ranges. |
| `created_at` | timestamptz | Row creation timestamp |

**Data source:** `sync_knesset_data.py` → Knesset OData `KNS_Person`. Enriched by `enrich_wikidata.py` for election candidates. Upserted on `knesset_person_id`.

**Notes:**
- `knesset_person_id` is null for persons created by the election pipeline (new candidates never in a Knesset). These rows are created by `resolve_candidates.py` with only `full_name` set.
- `gender` uses Hebrew labels directly — never mapped from a numeric ID. The Knesset API's `GenderID` values (250, 251, 252) are not meaningful; use `GenderDesc`.

---

### `knessets`

One row per Knesset term (הכנסת ה-1 through the current Knesset).

| Column | Type | Description |
|--------|------|-------------|
| `id` | bigint | Primary key |
| `knesset_number` | integer | Knesset number (1–25+). UNIQUE. |
| `knesset_name` | text | Hebrew name, e.g. `"כנסת ה-25"` |
| `start_date` | date | Start of the Knesset term |
| `end_date` | date | End of term — null if active |
| `is_active` | boolean | True for the current Knesset |
| `created_at` | timestamptz | Row creation timestamp |

**Data source:** `sync_knesset_data.py` → Knesset OData `KNS_KnessetDates`. That entity stores individual plenum sessions (multiple rows per Knesset), so the sync script aggregates: `start_date = MIN(PlenumStart)`, `end_date = MAX(PlenumFinish)`, grouped by `KnessetNum`. The entity `KNS_Knesset` does not exist in the live API.

**Used by:** `knesset_memberships`, `knesset_factions`, `governments`. Frontend Knesset picker dropdown.

---

### `knesset_factions`

Parliamentary factions within a specific Knesset session. A faction is the post-election grouping of MKs — it may differ from the ballot party that ran in the election.

| Column | Type | Description |
|--------|------|-------------|
| `id` | bigint | Primary key |
| `knesset_faction_id` | integer | Official ID from `KNS_Faction.FactionID`. UNIQUE. |
| `knesset_id` | bigint | FK → `knessets.id` |
| `name` | text | Full faction name in Hebrew |
| `short_name` | text | Short display name — manually set, not from OData |
| `start_date` | date | When the faction formed |
| `end_date` | date | When it dissolved — null if current |
| `is_current` | boolean | OData `IsCurrent` mirror — UI prefers `end_date IS NULL` when it needs “open faction” |
| `is_coalition` | boolean | True if part of the governing coalition — **manually maintained** (edit page / curated) |
| `color` | text | Hex color for UI — manually set (faction branding; separate from ballot `election_parties.color`) |
| `logo_url` | text | Party logo URL — manually set (faction branding; separate from ballot `election_parties.logo_url`) |
| `created_at` | timestamptz | Row creation timestamp |

**Data source:** `sync_knesset_data.py` → Knesset OData `KNS_Faction`. Upserted on `knesset_faction_id`. Fields NOT provided by the OData API and never overwritten by the sync: `color`, `logo_url`, `short_name`, `is_coalition`.

**Notes:**
- The sync script uses `FinishDate` (not `EndDate`) from the OData API.
- `is_coalition` must be maintained manually when government changes occur.
- Post-2026 election: linked to `election_parties` via `election_parties.knesset_faction_id`.

---

### `knesset_memberships`

Records each person's membership as an MK in a specific Knesset, within a specific faction.

| Column | Type | Description |
|--------|------|-------------|
| `id` | bigint | Primary key |
| `knesset_position_id` | integer | `KNS_PersonToPosition.PersonToPositionID`. UNIQUE. The OData primary key for this position record. |
| `person_id` | bigint | FK → `people.id` |
| `knesset_id` | bigint | FK → `knessets.id` |
| `faction_id` | bigint | FK → `knesset_factions.id` |
| `start_date` | date | When this membership started |
| `end_date` | date | When it ended — null if current |
| `duty_desc` | text | Role description from OData |
| `committee_role` | text | Committee role — rarely populated |
| `created_at` | timestamptz | Row creation timestamp |

**Data source:** `sync_knesset_data.py` → Knesset OData `KNS_PersonToPosition`, filtered to `PositionID IN (43, 61)`:
- `43` = חבר הכנסת (male MK) — confirmed from live `KNS_Position` table
- `61` = חברת הכנסת (female MK) — confirmed from live `KNS_Position` table

**Used by:** Frontend Knesset hemicycle. Also used by the election pipeline to determine "new MK" status — a candidate with no row here has never served.

**Notes:**
- `end_date` comes from `KNS_PersonToPosition.FinishDate` (not `EndDate`) in the OData API.
- Coalition status is **not** stored on memberships — use `knesset_factions.is_coalition` (joined via `faction_id`).
- “Current MK” for a term snapshot is derived from date ranges (`end_date` null / overlapping ref date), not from a membership boolean.

---

## Government Group

### `governments`

One row per Israeli government (ממשלה).

| Column | Type | Description |
|--------|------|-------------|
| `id` | bigint | Primary key |
| `government_number` | integer | Official government number. UNIQUE. |
| `knesset_id` | bigint | FK → `knessets.id` — may be manually incomplete for historical rows |
| `start_date` | date | Government formation date — may be manually incomplete for historical rows |
| `end_date` | date | Government end date — may be manually incomplete for historical rows |
| `is_active` | boolean | True for the current government |
| `created_at` | timestamptz | Row creation timestamp |

**Data source:** `sync_knesset_data.py`. No `KNS_Government` endpoint exists in the Knesset OData API — government numbers are derived from unique `GovernmentNum` values in `KNS_PersonToPosition`. The loader does not overwrite government metadata, so `knesset_id`, `start_date`, and `end_date` must be curated manually when available. The Government page tolerates missing or misaligned historical dates by falling back from `governments.end_date` to the latest appointment date inside the selected government, and resolves minister faction data from each person's latest known-faction Knesset membership before the government snapshot date rather than relying only on `governments.knesset_id`.

---

### `offices`

Government ministries (משרדי ממשלה).

| Column | Type | Description |
|--------|------|-------------|
| `id` | bigint | Primary key |
| `knesset_category_id` | integer | `KNS_GovMinistry.GovMinistryID`. UNIQUE. |
| `knesset_category_name` | text | Ministry name mirrored from OData `Name` on every sync |
| `name` | text | Display name — set to OData `Name` on insert only; sync does **not** overwrite curated values |
| `name_en` | text | English name — not available from OData, null |
| `info` | text | Additional info — manually set |
| `logo_url` | text | Ministry logo — manually set |
| `news_feed_id` | text | RSS/news feed ID — manually set |
| `is_active` | boolean | Whether the ministry currently exists |
| `is_shown` | boolean | Whether to show on the dashboard |
| `created_at` | timestamptz | Row creation timestamp |

**Data source:** `sync_knesset_data.py` → Knesset OData `KNS_GovMinistry`. Sync updates `knesset_category_name` + `is_active` only; `name` is a display override. Frontend prefers `knesset_category_name`, then `name`.

---

### `minister_appointments`

Records each person's ministerial appointment in a specific government.

| Column | Type | Description |
|--------|------|-------------|
| `id` | bigint | Primary key |
| `knesset_position_id` | integer | `KNS_PersonToPosition.PersonToPositionID`. UNIQUE. |
| `person_id` | bigint | FK → `people.id` |
| `government_id` | bigint | FK → `governments.id` |
| `office_id` | bigint | FK → `offices.id` |
| `start_date` | date | Appointment start |
| `end_date` | date | Appointment end — null if current |
| `is_current` | boolean | OData `IsCurrent` mirror — government page filters by appointment date ranges, not this flag |
| `is_acting` | boolean | Always `false` — not available from OData |
| `duty_desc` | text | Role description from OData |
| `created_at` | timestamptz | Row creation timestamp |

**Data source:** `sync_knesset_data.py` → Knesset OData `KNS_PersonToPosition`, filtered to rows where both `GovernmentNum` and `GovMinistryID` are non-null (ministerial roles).

**Notes:**
- `end_date` comes from `FinishDate` (not `EndDate`) in the OData API.
- `GovernmentNum` (not `GovNum`) is the correct OData field name for the government number.

---

## KPI Data Group

### `indexes`

KPI definitions attached to a government office. Each index defines one trackable metric (e.g. unemployment rate, crime statistics).

| Column | Type | Description |
|--------|------|-------------|
| `id` | bigint | Primary key |
| `office_id` | bigint | FK → `offices.id` |
| `name` | text | Metric name in Hebrew |
| `info` | text | Explanation of the metric |
| `icon` | text | Icon identifier for the UI |
| `is_kpi` | boolean | Whether to show as a headline KPI |
| `alert` | boolean | Whether to highlight this metric |
| `chart_type` | text | Default: `"line"`. Drives frontend chart selection. |
| `source` | text | Data source attribution |
| `is_shown` | boolean | Whether to show on the dashboard |
| `created_at` | timestamptz | Row creation timestamp |

**Data source:** Manually curated. No automated sync.

---

### `index_data`

Time-series data points for each index.

| Column | Type | Description |
|--------|------|-------------|
| `id` | bigint | Primary key |
| `index_id` | bigint | FK → `indexes.id` |
| `label` | text | Display label for this data point (e.g. `"ינואר 2025"`) |
| `value` | bigint | The metric value |
| `recorded_at` | date | When this value was recorded |
| `created_at` | timestamptz | Row creation timestamp |

**Data source:** Manually curated or automated per index source. No central sync script yet.

---

## Elections Group

### `elections`

One row per election event. Currently holds a single row for the 2026 election.

| Column | Type | Description |
|--------|------|-------------|
| `id` | bigint | Primary key |
| `year` | integer | Election year. UNIQUE. |
| `date` | date | Election day |
| `name` | text | Display name, e.g. `"בחירות לכנסת ה-26"` |
| `knesset_number` | integer | Which Knesset this election seats — FK → `knessets.knesset_number` |
| `created_at` | timestamptz | Row creation timestamp |

**Data source:** Manually inserted via seed SQL. One row, rarely changes.

---

### `election_parties`

Parties running on the ballot in a given election. Separate from `knesset_factions` — ballot parties can merge or split after the election, so these are tracked independently.

| Column | Type | Description |
|--------|------|-------------|
| `id` | bigint | Primary key |
| `election_id` | bigint | FK → `elections.id` |
| `knesset_faction_id` | bigint | FK → `knesset_factions.id` — **null before the election**, wired post-election by `link_factions.py` |
| `name` | text | Full name, e.g. `"הליכוד בראשות בנימין נתניהו"` |
| `short_name` | text | Short lookup key used by pipeline, e.g. `"הליכוד"` |
| `party_status` | text | `'confirmed'` \| `'polled_only'` \| `'historical'` — default `'confirmed'` |
| `bloc` | text | `'coalition'` \| `'opposition'` \| `'unaligned'` — for poll bloc totals |
| `first_polled_date` | date | First fieldwork date this party appeared in polls |
| `last_polled_date` | date | Most recent fieldwork date |
| `color` | text | Hex color for ballot UI — owned by election party row (not synced from factions) |
| `logo_url` | text | Ballot / elections-page logo — owned by election party row |
| `ballot_letter` | text | Hebrew ballot symbol — null until Elections Committee certifies lists |
| `description` | text | Party description |
| `created_at` | timestamptz | Row creation timestamp |

**Data source:** Manually inserted when parties are confirmed; extended by `seed_parties.py` for polls pipeline. `short_name` is critical — it is what `insert_raw_list.py` and the pipeline use to look up parties. Unique constraint on `(election_id, short_name)` is exact-string only, so Hebrew quote variants (`ש"ס` vs `ש״ס`) are different keys — `seed_parties.py` therefore matches/merges by normalized short_name and must not upsert gershayim stubs alongside elections-import rows.

**Frontend filter:** Public elections pages query only `party_status = 'confirmed'`.

---

### `election_candidates`

Ordered candidate list per party. One row per candidate per party.

| Column | Type | Description |
|--------|------|-------------|
| `id` | bigint | Primary key |
| `election_id` | bigint | FK → `elections.id` |
| `party_id` | bigint | FK → `election_parties.id` |
| `person_id` | bigint | FK → `people.id` |
| `list_position` | integer | Position on the party list (1 = top) |
| `description` | text | One-sentence Hebrew role summary (`[שם] כיהן כ[תפקידים]`) — generated by OpenAI pipeline |
| `city` | text | City of residence — from Wikidata or party publication |
| `latitude` | numeric | Geocoded from `city` via Nominatim |
| `longitude` | numeric | Geocoded from `city` via Nominatim |
| `created_at` | timestamptz | Row creation timestamp |

**Constraints:**
- `UNIQUE (party_id, list_position)` — no duplicate positions within a party
- `UNIQUE (party_id, person_id)` — same person can't appear twice on one list

**Data source:** Written by `resolve_candidates.py` (Stage 1 of the election pipeline). Enriched by `enrich_wikidata.py`, `generate_descriptions.py`, `geocode_cities.py`, `fetch_candidate_birthdates.py` for any remaining null `people.birth_date` values, and `fetch_candidate_wiki_urls.py` for any remaining null `people.wikipedia_url` values. Can also be updated from `/elections/edit` via the service-key API routes.

**Stats computed at query time from this table:**

| Stat | Logic |
|------|-------|
| Average age | `AVG(DATE_PART('year', AGE(p.birth_date)))` joined to `people` |
| % women | `COUNT(*) FILTER (WHERE p.gender = 'נקבה')` / total |
| % new MKs | `COUNT(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM knesset_memberships WHERE person_id = ec.person_id))` / total |
| Map pins | `ec.latitude`, `ec.longitude` |

**Frontend access:**

The elections frontend uses the public anon key for **SELECT only**. `elections`, `election_parties`, and `election_candidates` must be selectable by `anon`; otherwise the service-role pipeline can see rows while `/elections` renders an empty list. Writes from `/elections/edit` go through Next APIs with `SUPABASE_SERVICE_KEY` — do **not** grant anon UPDATE.

```sql
alter table public.elections enable row level security;
alter table public.election_parties enable row level security;
alter table public.election_candidates enable row level security;

grant select on public.elections to anon;
grant select on public.election_parties to anon;
grant select on public.election_candidates to anon;

create policy "Public read elections"
on public.elections
for select
to anon
using (true);

create policy "Public read election parties"
on public.election_parties
for select
to anon
using (true);

create policy "Public read election candidates"
on public.election_candidates
for select
to anon
using (true);

-- Do NOT grant UPDATE to anon. Edit saves use service role via API.
```

---

### `raw_candidate_lists`

Staging table. The only place where data is inserted manually. The election pipeline reads from here and writes to `election_candidates`.

| Column | Type | Description |
|--------|------|-------------|
| `id` | bigint | Primary key |
| `election_id` | bigint | FK → `elections.id` |
| `party_id` | bigint | FK → `election_parties.id` |
| `raw_name` | text | Candidate name exactly as published by the party |
| `list_position` | integer | Position on the list |
| `raw_city` | text | City if the party published it — optional |
| `processed` | boolean | `false` on insert, flipped to `true` by the pipeline after the candidate is committed to `election_candidates` |
| `created_at` | timestamptz | Row creation timestamp |

**Data source:** Written by `insert_raw_list.py` from a `.txt` (plain or numbered lines like `1. name`) or `.csv` file. Re-inserting a party's list deletes existing `processed=false` rows for that party and replaces them. Rows with `processed=true` are never deleted automatically.

**Pipeline trigger:** The pipeline (`run_pipeline.py`) picks up all rows where `processed=false` and processes them through six stages: name resolution → Wikidata enrichment → description generation → geocoding → missing-birthdate retry → missing-Wikipedia-URL retry.

---

## Polls Group

### `pipeline_runs`

Shared run history for the `/piplines` dashboard (all pipelines).

| Column | Type | Description |
|--------|------|-------------|
| `pipeline` | text | e.g. `'polls'`, `'knesset'`, `'elections-candidates'` |
| `action` | text | `'sync-full'`, `'stage-N'`, `'backfill'`, … |
| `status` | text | `'success'` \| `'error'` \| `'warning'` |
| `started_at` | timestamptz | Run start |
| `finished_at` | timestamptz | Run end |
| `message` | text | Short summary |
| `error` | text | Error detail when failed |
| `summary` | jsonb | Optional stage totals |
| `source` | text | `'ui'` \| `'cli'` \| `'github-actions'` |

**RLS:** anon/authenticated SELECT. Writes via service role only.

**Schema file:** `Layer 1 - Gathering Data/schema_pipeline_runs.sql`

### `site_updates`

Homepage news-strip feed. Written by `emit_site_updates.py` at the end of successful pipeline runs (one LLM headline per run with meaningful changes).

| Column | Type | Description |
|--------|------|-------------|
| `id` | bigint | Primary key |
| `event_type` | text | e.g. `'polls_run'`, `'knesset_run'`, `'elections_run'` |
| `headline` | text | Hebrew ticker text (gpt-4o) |
| `href` | text | Site path, e.g. `/elections/polls`, `/knesset`, `/elections` |
| `payload` | jsonb | Structured change facts sent to the model |
| `occurred_at` | timestamptz | Event time |
| `pipeline_run_id` | bigint | Optional link to `pipeline_runs.id` |
| `dedupe_key` | text | UNIQUE — prevents duplicate headlines on re-runs |

**RLS:** anon/authenticated SELECT. Writes via service role only.

**Schema file:** `Layer 1 - Gathering Data/schema_site_updates.sql`

### `pipeline_sync_state`

Revid cache for incremental Wikipedia fetches.

| Column | Type | Description |
|--------|------|-------------|
| `pipeline` | text | Pipeline identifier, e.g. `'polls'` |
| `resource` | text | Wiki page title |
| `last_revid` | bigint | Last successfully parsed revision |
| `last_run_at` | timestamptz | Last run timestamp |
| `last_success_at` | timestamptz | Last successful fetch |

---

### `raw_poll_rows`

Staging table for parsed Wikipedia poll rows.

| Column | Type | Description |
|--------|------|-------------|
| `source_page` | text | Wikipedia page title |
| `revid` | bigint | Source revision ID |
| `section` | text | Section heading path |
| `row_index` | integer | Row index within segment |
| `payload` | jsonb | Parsed row including header map and party results |
| `content_hash` | text | SHA-256 of payload |
| `natural_key` | text | SHA-256 of raw fieldwork\|pollster\|publisher\|section |
| `status` | text | `'pending'` \| `'processed'` \| `'superseded'` \| `'rejected'` |

**Convention note:** Unlike `raw_candidate_lists.processed` (boolean), this table uses a four-state `status` text column because `superseded` and `rejected` are load-bearing states.

---

### `poll_publishers`

Media channels that publish polls (Kan 11, Channel 13, etc.). Logos maintained manually.

| Column | Type | Description |
|--------|------|-------------|
| `name` | text | Canonical English name — must match `polls.publisher` |
| `name_he` | text | Hebrew display name (optional) |
| `logo_url` | text | Channel logo URL — manually set |

**Data source:** `seed_poll_publishers.sql` seeds rows from distinct `polls.publisher` values. Re-run safe; does not overwrite existing `logo_url`.

**Used by:** `polls.publisher_id` FK (backfilled by seed script).

---

### `polls`

Normalized poll header — one row per distinct poll.

| Column | Type | Description |
|--------|------|-------------|
| `election_id` | bigint | FK → `elections.id` |
| `natural_key` | text | Unique poll identity |
| `pollster` | text | Normalized English pollster name |
| `pollster_he` | text | Hebrew pollster name |
| `publisher` | text | Media outlet English name — pipeline identity string (matches `poll_publishers.name`) |
| `publisher_id` | bigint | FK → `poll_publishers.id` — resolved at normalize time for logos; keep in sync with `publisher` |
| `fieldwork_start` / `fieldwork_end` | date | Fieldwork date range |
| `sample_size` | integer | Sample size |
| `margin_of_error` | numeric | MOE |
| `is_scenario` | boolean | Scenario poll flag |
| `scenario_desc` | text | Scenario section label |
| `source_url` | text | Original publication URL |
| `source_revid` | bigint | Wikipedia revision |

**Ownership:** `publisher` text is the natural identity from Wikipedia. `publisher_id` is denormalized FK set by `normalize_polls.py` via `resolve_publisher_id` (creates a stub `poll_publishers` row when missing). Logos live only on `poll_publishers`.

---

### `poll_results`

Per-party seat projection for one poll.

| Column | Type | Description |
|--------|------|-------------|
| `poll_id` | bigint | FK → `polls.id` |
| `party_id` | bigint | FK → `election_parties.id` |
| `seats` | integer | Projected seats — null if below threshold |
| `vote_share` | numeric | From `(N%)` notation |
| `below_threshold` | boolean | true only from explicit `(N%)`; null = unknown |

---

### `poll_party_aliases`

Time-scoped English Wikipedia label → `election_parties.id` mapping.

| Column | Type | Description |
|--------|------|-------------|
| `raw_label` | text | English party column header |
| `party_id` | bigint | FK → `election_parties.id` |
| `valid_from` / `valid_to` | date | Validity window (null = open-ended) |

Lookup uses poll `fieldwork_end` to select the correct alias window.

---

### `party_lineage`

Merge/split/dissolve events for trend line breaks.

| Column | Type | Description |
|--------|------|-------------|
| `predecessor_id` | bigint | FK → `election_parties.id` |
| `successor_id` | bigint | FK → `election_parties.id` |
| `event_date` | date | Event date |
| `event_type` | text | `'merge'` \| `'split'` \| `'rename'` \| `'dissolve'` \| `'found'` |

---

### `poll_aggregates`

Materialized weighted and last3 averages.

| Column | Type | Description |
|--------|------|-------------|
| `election_id` | bigint | FK → `elections.id` |
| `party_id` | bigint | FK → `election_parties.id` |
| `as_of_date` | date | Aggregation date (Jerusalem) |
| `method` | text | `'last3'` \| `'weighted'` |
| `seats_avg` | numeric | Average seat projection (1 decimal) |
| `poll_count` | integer | Polls contributing to average |

---

### `pollster_house_effects`

Descriptive pollster bias vs cross-pollster average. Display only — not applied to headline numbers.

| Column | Type | Description |
|--------|------|-------------|
| `pollster` | text | Pollster name |
| `party_id` | bigint | FK → `election_parties.id` |
| `as_of_date` | date | Computation date |
| `delta` | numeric | Mean deviation from leave-one-out average |
| `poll_count` | integer | Polls in window (min 5 required) |

**RLS:** `polls`, `poll_results`, `poll_aggregates`, `pollster_house_effects` are anon-readable. Staging/alias/lineage/sync tables are service-role only.

---

## Sync Scripts

| Script | Tables updated | Trigger |
|--------|---------------|---------|
| `sync_knesset_data.py` | `knessets` · `people` · `knesset_factions` · `knesset_memberships` · `offices` · `governments` · `minister_appointments` | Weekly (GitHub Actions) |
| `insert_raw_list.py` | `raw_candidate_lists` | Manual — when a party publishes their list |
| `run_pipeline.py` | `election_candidates` · `people` (enrichment) | Manual — after each `insert_raw_list.py` run |
| `run_polls_pipeline.py` | `polls` · `poll_results` · `poll_aggregates` · `raw_poll_rows` | Daily midnight Israel (GitHub Actions) |
| `link_factions.py` | `election_parties.knesset_faction_id` | Post-election — once per election |

All sync writes are upserts. No script deletes data except `insert_raw_list.py` which removes `processed=false` rows for a party when re-inserting an updated list.

---

## Integrity constraints

Live on Supabase (applied; one-shot migration scripts removed from the repo). Inventory:

| Constraint | Purpose |
|------------|---------|
| `election_candidates` UNIQUE `(party_id, list_position)` / `(party_id, person_id)` | No duplicate list slots or people on one list |
| `election_parties` UNIQUE `(election_id, short_name)` | Stable pipeline lookup key |
| `poll_results` UNIQUE `(poll_id, party_id)` + `ON DELETE CASCADE` from `polls` | One result row per party per poll |
| `poll_aggregates` UNIQUE `(election_id, party_id, as_of_date, method)` | Idempotent aggregate upserts |
| `pipeline_sync_state` UNIQUE `(pipeline, resource)` | One revid cache row per resource |
| `raw_poll_rows` UNIQUE `(natural_key, content_hash)` | Dedup staging payloads |
| `raw_candidate_lists` partial UNIQUE `(party_id, list_position) WHERE processed = false` | No duplicate open staging slots; allows kept `processed=true` rows when re-inserting |
| `pollster_house_effects` UNIQUE `(pollster, party_id, as_of_date)` | Idempotent house-effect upserts |
| Partial unique on `knessets.is_active` / `governments.is_active` | At most one active term/government |
| Date-order CHECKs | `end_date >= start_date` (or null end) on terms, memberships, appointments, factions, poll fieldwork |
| Domain CHECKs | `people.gender`, poll seats `0..120`, `sample_size > 0`, aggregate `method`, `indexes.chart_type`, `list_position >= 1` |

---

## Performance indexes

Live on Supabase (applied; one-shot migration scripts removed from the repo). Covers FK join columns and hot filters:

| Area | Indexes |
|------|---------|
| Knesset / government | `knesset_memberships` (person, knesset, faction); `knesset_factions(knesset_id)`; `minister_appointments` (person, government, office); `governments(knesset_id)` |
| Elections | `election_candidates` (election, person); confirmed parties by election; `people(full_name)`; raw list pending/party |
| Polls | `polls` (election, fieldwork, regular, publisher); `poll_results(party_id)`; aggregates lookup; pending raw rows; aliases; lineage |
| KPI | `indexes(office_id)`; `index_data(index_id, recorded_at)` |

Unique constraints also provide leading-column indexes for several keys (e.g. `election_parties(election_id, short_name)`).

---

## Field ownership (anti-drift)

| Topic | Source of truth | Notes |
|-------|-----------------|-------|
| Coalition | `knesset_factions.is_coalition` | Memberships do **not** store coalition |
| Current MK / minister in UI | Date ranges (`end_date` null / overlapping snapshot) | `people.is_current` / `minister_appointments.is_current` / faction `is_current` are OData mirrors only |
| Active knesset / government | `is_active` (+ partial unique index) | Keep in sync when terms change |
| Office display name | `offices.name` (curated) vs `knesset_category_name` (OData) | Sync never overwrites existing `name` |
| Poll publisher | `polls.publisher` text identity; `publisher_id` FK for logos | Normalize resolves/creates `poll_publishers` rows |
| Party color / logo | Ballot: `election_parties`; chamber: `knesset_factions` | Intentional dual branding — do not auto-overwrite either from the other |
| Election → Knesset | `elections.knesset_number` FK → `knessets.knesset_number` | Applied |
-- Polls pipeline schema — apply manually in Supabase SQL Editor.
-- Prerequisite: backfill election_parties.short_name where null; fix duplicates.

-- ── Extend election_parties ─────────────────────────────────────────────────
alter table public.election_parties
  add column if not exists party_status text not null default 'confirmed',
  add column if not exists bloc text,
  add column if not exists first_polled_date date,
  add column if not exists last_polled_date date;

alter table public.election_parties
  drop constraint if exists election_parties_party_status_check;

alter table public.election_parties
  add constraint election_parties_party_status_check
  check (party_status in ('confirmed', 'polled_only', 'historical'));

alter table public.election_parties
  drop constraint if exists election_parties_bloc_check;

alter table public.election_parties
  add constraint election_parties_bloc_check
  check (bloc is null or bloc in ('coalition', 'opposition', 'unaligned'));

alter table public.election_parties
  drop constraint if exists election_parties_election_short_name_key;

alter table public.election_parties
  add constraint election_parties_election_short_name_key
  unique (election_id, short_name);

-- ── Sync state (revid cache) ────────────────────────────────────────────────
create table if not exists public.pipeline_sync_state (
  id bigint generated always as identity not null,
  pipeline text not null,
  resource text not null,
  last_revid bigint,
  last_run_at timestamp with time zone,
  last_success_at timestamp with time zone,
  created_at timestamp with time zone default now(),
  constraint pipeline_sync_state_pkey primary key (id),
  constraint pipeline_sync_state_pipeline_resource_key unique (pipeline, resource)
);

-- ── Staging ─────────────────────────────────────────────────────────────────
create table if not exists public.raw_poll_rows (
  id bigint generated always as identity not null,
  source_page text not null,
  revid bigint not null,
  section text,
  row_index integer not null,
  payload jsonb not null,
  content_hash text not null,
  natural_key text not null,
  status text not null default 'pending',
  error text,
  created_at timestamp with time zone default now(),
  constraint raw_poll_rows_pkey primary key (id),
  constraint raw_poll_rows_natural_key_content_hash_key unique (natural_key, content_hash),
  constraint raw_poll_rows_status_check
    check (status in ('pending', 'processed', 'superseded', 'rejected'))
);

create index if not exists raw_poll_rows_pending_idx
  on public.raw_poll_rows (created_at) where status = 'pending';

-- ── Poll header ─────────────────────────────────────────────────────────────
create table if not exists public.polls (
  id bigint generated always as identity not null,
  election_id bigint not null,
  natural_key text not null unique,
  raw_poll_row_id bigint,
  pollster text not null,
  pollster_he text,
  publisher text not null,
  publisher_he text,
  fieldwork_start date not null,
  fieldwork_end date not null,
  sample_size integer,
  margin_of_error numeric,
  is_scenario boolean not null default false,
  scenario_desc text,
  source_url text,
  source_revid bigint,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  constraint polls_pkey primary key (id),
  constraint polls_election_id_fkey foreign key (election_id) references public.elections(id),
  constraint polls_raw_poll_row_id_fkey foreign key (raw_poll_row_id) references public.raw_poll_rows(id),
  constraint polls_fieldwork_order_check check (fieldwork_start <= fieldwork_end)
);

create index if not exists polls_fieldwork_idx on public.polls (fieldwork_end desc);
create index if not exists polls_regular_idx on public.polls (fieldwork_end desc) where is_scenario = false;

-- ── Per-party result ──────────────────────────────────────────────────────────
create table if not exists public.poll_results (
  id bigint generated always as identity not null,
  poll_id bigint not null,
  party_id bigint not null,
  seats integer,
  vote_share numeric,
  below_threshold boolean,
  constraint poll_results_pkey primary key (id),
  constraint poll_results_poll_id_fkey foreign key (poll_id)
    references public.polls(id) on delete cascade,
  constraint poll_results_party_id_fkey foreign key (party_id)
    references public.election_parties(id),
  constraint poll_results_poll_party_key unique (poll_id, party_id)
);

create index if not exists poll_results_party_idx on public.poll_results (party_id);

-- ── Party-label resolution, time-scoped ───────────────────────────────────────
create table if not exists public.poll_party_aliases (
  id bigint generated always as identity not null,
  raw_label text not null,
  party_id bigint not null,
  valid_from date,
  valid_to date,
  note text,
  created_at timestamp with time zone default now(),
  constraint poll_party_aliases_pkey primary key (id),
  constraint poll_party_aliases_party_id_fkey foreign key (party_id)
    references public.election_parties(id)
);

create unique index if not exists poll_party_aliases_label_from_key
  on public.poll_party_aliases (raw_label, coalesce(valid_from, '1900-01-01'::date));

-- ── Party lineage ─────────────────────────────────────────────────────────────
create table if not exists public.party_lineage (
  id bigint generated always as identity not null,
  predecessor_id bigint,
  successor_id bigint,
  event_date date not null,
  event_type text not null,
  note text,
  created_at timestamp with time zone default now(),
  constraint party_lineage_pkey primary key (id),
  constraint party_lineage_predecessor_id_fkey foreign key (predecessor_id)
    references public.election_parties(id),
  constraint party_lineage_successor_id_fkey foreign key (successor_id)
    references public.election_parties(id),
  constraint party_lineage_event_type_check
    check (event_type in ('merge', 'split', 'rename', 'dissolve', 'found'))
);

-- ── Materialized averages ─────────────────────────────────────────────────────
create table if not exists public.poll_aggregates (
  id bigint generated always as identity not null,
  election_id bigint not null,
  party_id bigint not null,
  as_of_date date not null,
  method text not null,
  seats_avg numeric not null,
  poll_count integer not null,
  created_at timestamp with time zone default now(),
  constraint poll_aggregates_pkey primary key (id),
  constraint poll_aggregates_election_id_fkey foreign key (election_id) references public.elections(id),
  constraint poll_aggregates_party_id_fkey foreign key (party_id) references public.election_parties(id),
  constraint poll_aggregates_unique_key unique (election_id, party_id, as_of_date, method)
);

create index if not exists poll_aggregates_lookup_idx
  on public.poll_aggregates (election_id, method, as_of_date desc);

-- ── House effects (display only) ──────────────────────────────────────────────
create table if not exists public.pollster_house_effects (
  id bigint generated always as identity not null,
  pollster text not null,
  party_id bigint not null,
  as_of_date date not null,
  delta numeric not null,
  poll_count integer not null,
  created_at timestamp with time zone default now(),
  constraint pollster_house_effects_pkey primary key (id),
  constraint pollster_house_effects_party_id_fkey foreign key (party_id)
    references public.election_parties(id),
  constraint pollster_house_effects_unique_key unique (pollster, party_id, as_of_date)
);

-- ── RLS and grants ────────────────────────────────────────────────────────────
alter table public.polls enable row level security;
alter table public.poll_results enable row level security;
alter table public.poll_aggregates enable row level security;
alter table public.pollster_house_effects enable row level security;

grant select on public.polls to anon;
grant select on public.poll_results to anon;
grant select on public.poll_aggregates to anon;
grant select on public.pollster_house_effects to anon;

drop policy if exists "Public read polls" on public.polls;
create policy "Public read polls" on public.polls for select to anon using (true);

drop policy if exists "Public read poll results" on public.poll_results;
create policy "Public read poll results" on public.poll_results for select to anon using (true);

drop policy if exists "Public read poll aggregates" on public.poll_aggregates;
create policy "Public read poll aggregates" on public.poll_aggregates for select to anon using (true);

drop policy if exists "Public read house effects" on public.pollster_house_effects;
create policy "Public read house effects" on public.pollster_house_effects for select to anon using (true);

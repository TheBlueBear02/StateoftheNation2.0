-- dream_cabinet_picks — anonymous dream-government seat votes (share → upsert)
-- Apply manually in Supabase SQL editor.
--
-- `updated_at` is timestamp WITHOUT time zone and stores Israel local wall-clock
-- time (Asia/Jerusalem), including DST. Do not write UTC from the app.

create table if not exists dream_cabinet_picks (
  id bigint generated always as identity primary key,
  election_id bigint not null references elections (id) on delete cascade,
  client_id uuid not null,
  office_id text not null
    check (
      office_id in (
        'pm',
        'defense',
        'foreign',
        'finance',
        'justice',
        'education',
        'national_security'
      )
    ),
  candidate_id bigint not null references election_candidates (id) on delete cascade,
  person_id bigint not null references people (id) on delete cascade,
  party_id bigint not null references election_parties (id) on delete cascade,
  updated_at timestamp without time zone not null
    default (timezone('Asia/Jerusalem', now())),
  unique (election_id, client_id, office_id)
);

create index if not exists dream_cabinet_picks_office_candidate_idx
  on dream_cabinet_picks (election_id, office_id, candidate_id);

create or replace function dream_cabinet_picks_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('Asia/Jerusalem', now());
  return new;
end;
$$;

drop trigger if exists set_updated_at_dream_cabinet_picks on dream_cabinet_picks;
create trigger set_updated_at_dream_cabinet_picks
  before update on dream_cabinet_picks
  for each row
  execute function dream_cabinet_picks_set_updated_at();

-- Also stamp Israel local time on INSERT when the client omits updated_at
-- (DEFAULT covers that). BEFORE INSERT keeps explicit client values from
-- accidentally writing UTC if a caller still sends updated_at.
create or replace function dream_cabinet_picks_set_updated_at_insert()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('Asia/Jerusalem', now());
  return new;
end;
$$;

drop trigger if exists set_updated_at_dream_cabinet_picks_insert
  on dream_cabinet_picks;
create trigger set_updated_at_dream_cabinet_picks_insert
  before insert on dream_cabinet_picks
  for each row
  execute function dream_cabinet_picks_set_updated_at_insert();

alter table dream_cabinet_picks enable row level security;

-- No anon/authenticated policies on the base table (hides client_id).
-- Writes: service role only (bypasses RLS).

create or replace function get_dream_cabinet_pick_stats(p_election_id bigint)
returns table (
  office_id text,
  candidate_id bigint,
  pick_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    d.office_id,
    d.candidate_id,
    count(*)::bigint as pick_count
  from dream_cabinet_picks d
  where d.election_id = p_election_id
  group by d.office_id, d.candidate_id;
$$;

revoke all on function get_dream_cabinet_pick_stats(bigint) from public;
grant execute on function get_dream_cabinet_pick_stats(bigint) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Migration for tables already created with timestamptz / UTC defaults
-- ---------------------------------------------------------------------------
-- Run once in Supabase if the table already exists:
--
-- alter table dream_cabinet_picks
--   alter column updated_at type timestamp without time zone
--   using (timezone('Asia/Jerusalem', updated_at));
--
-- alter table dream_cabinet_picks
--   alter column updated_at set default (timezone('Asia/Jerusalem', now()));
--
-- Then re-apply the trigger functions above.

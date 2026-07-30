-- site_updates — homepage news-strip feed (LLM headlines from pipeline finish hooks)
-- Apply manually in Supabase SQL editor.

create table if not exists site_updates (
  id bigint generated always as identity primary key,
  event_type text not null,
  headline text not null,
  href text not null,
  payload jsonb,
  occurred_at timestamptz not null default now(),
  pipeline_run_id bigint,
  dedupe_key text not null unique
);

create index if not exists site_updates_occurred_at_idx
  on site_updates (occurred_at desc);

alter table site_updates enable row level security;

drop policy if exists "site_updates_anon_read" on site_updates;
create policy "site_updates_anon_read"
  on site_updates
  for select
  to anon, authenticated
  using (true);

-- Writes: service role only (bypasses RLS).

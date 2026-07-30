-- pipeline_runs — shared run history for the /piplines dashboard
-- Apply manually in Supabase SQL editor.

create table if not exists pipeline_runs (
  id bigint generated always as identity primary key,
  pipeline text not null,
  action text not null,
  status text not null check (status in ('success', 'error', 'warning')),
  started_at timestamptz not null default now(),
  finished_at timestamptz not null default now(),
  message text,
  error text,
  summary jsonb,
  source text not null default 'cli'
    check (source in ('ui', 'cli', 'github-actions'))
);

create index if not exists pipeline_runs_finished_at_idx
  on pipeline_runs (finished_at desc);

create index if not exists pipeline_runs_pipeline_idx
  on pipeline_runs (pipeline, finished_at desc);

alter table pipeline_runs enable row level security;

drop policy if exists "pipeline_runs_anon_read" on pipeline_runs;
create policy "pipeline_runs_anon_read"
  on pipeline_runs
  for select
  to anon, authenticated
  using (true);

-- Writes: service role only (bypasses RLS).

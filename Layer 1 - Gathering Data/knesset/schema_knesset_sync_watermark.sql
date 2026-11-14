-- Knesset OData incremental-sync watermarks.
-- Apply manually in the Supabase SQL editor. Adds a nullable column only.
-- Does not update or delete existing rows.
--
-- pipeline_sync_state is the polls revid cache. The Knesset loader stores one
-- row per resource (person, faction, gov_ministry, person_to_position) with
-- watermark = the max LastUpdatedDate from the last successful live fetch.
-- Until this column exists, the loader still records the same value on
-- pipeline_runs.summary.odata_watermarks and reads it back.

create table if not exists public.pipeline_sync_state (
  id bigint generated always as identity primary key,
  pipeline text not null,
  resource text not null,
  last_revid bigint,
  last_run_at timestamptz,
  last_success_at timestamptz,
  watermark timestamptz,
  created_at timestamptz default now(),
  constraint pipeline_sync_state_pipeline_resource_key unique (pipeline, resource)
);

alter table public.pipeline_sync_state
  add column if not exists watermark timestamptz;

comment on column public.pipeline_sync_state.watermark is
  'Max OData LastUpdatedDate from the last successful live sync of this resource. The Knesset loader subtracts a 6-hour overlap when querying.';

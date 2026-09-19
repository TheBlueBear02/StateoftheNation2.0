-- Office KPI dashboard — ensure anon read access on indexes / index_data.
-- Apply manually in Supabase SQL Editor if grants/policies are missing.
-- Prerequisite: tables `indexes` and `index_data` already exist (see Database.md).

-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table public.indexes enable row level security;
alter table public.index_data enable row level security;

grant select on public.indexes to anon;
grant select on public.index_data to anon;

drop policy if exists "Public read indexes" on public.indexes;
create policy "Public read indexes"
  on public.indexes
  for select
  to anon
  using (true);

drop policy if exists "Public read index_data" on public.index_data;
create policy "Public read index_data"
  on public.index_data
  for select
  to anon
  using (true);

-- ── chart_type domain (idempotent) ───────────────────────────────────────────
alter table public.indexes
  drop constraint if exists indexes_chart_type_check;

alter table public.indexes
  add constraint indexes_chart_type_check
  check (chart_type is null or chart_type in ('line', 'bar', 'pie'));

-- ── Unique for idempotent index_data upserts ─────────────────────────────────
-- Required by seed_office_dashboard.py upsert on_conflict=index_id,recorded_at
create unique index if not exists index_data_index_recorded_key
  on public.index_data (index_id, recorded_at);

-- Helpful lookup indexes (no-op if already present)
create index if not exists indexes_office_id_idx on public.indexes (office_id);
create index if not exists indexes_shown_idx
  on public.indexes (office_id) where is_shown = true;
create index if not exists offices_shown_idx
  on public.offices (id) where is_shown = true;

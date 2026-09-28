-- Office KPI pipeline — staging, documents and planner state.
-- Apply manually in the Supabase SQL Editor (idempotent).
-- Prerequisite: schema_office_dashboard.sql (unique index_data (index_id, recorded_at)).

-- ── Every extracted value lands here first, with provenance ─────────────────
create table if not exists public.index_data_candidates (
  id bigint generated always as identity primary key,
  index_id bigint not null references public.indexes(id) on delete cascade,
  recorded_at date not null,
  label text not null,
  value numeric not null,
  raw_value text,
  method text not null check (method in ('api','api_unofficial','table','llm','manual')),
  confidence real not null default 1,
  source_url text,
  document_id bigint,
  evidence jsonb,
  validation jsonb,
  kind text not null default 'new' check (kind in ('new','revision','same')),
  previous_value numeric,
  status text not null default 'pending'
    check (status in ('pending','approved','rejected','published','superseded')),
  reviewed_by text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (index_id, recorded_at, value, method)
);

create index if not exists index_data_candidates_status_idx
  on public.index_data_candidates (status, created_at desc);
create index if not exists index_data_candidates_index_idx
  on public.index_data_candidates (index_id, recorded_at);

-- ── Downloaded source documents (tiers B/C). Files live in Storage bucket `kpi-sources`.
create table if not exists public.kpi_documents (
  id bigint generated always as identity primary key,
  doc_key text not null,
  url text not null,
  sha256 text not null unique,
  storage_path text,
  edition text,
  fetched_at timestamptz not null default now(),
  parse_status text not null default 'new'
    check (parse_status in ('new','parsed','failed','ignored'))
);

alter table public.index_data_candidates
  drop constraint if exists index_data_candidates_document_fk;
alter table public.index_data_candidates
  add constraint index_data_candidates_document_fk
  foreign key (document_id) references public.kpi_documents(id) on delete set null;

-- ── Planner state: which period each index is hunting, and when it was last checked
create table if not exists public.kpi_check_state (
  index_id bigint not null references public.indexes(id) on delete cascade,
  target_period date not null,
  window_start date,
  window_end date,
  last_checked_at timestamptz,
  attempts int not null default 0,
  status text not null default 'waiting'
    check (status in ('waiting','checking','found','overdue','error')),
  last_error text,
  primary key (index_id, target_period)
);

-- ── RLS: service role writes; nothing public (review UI goes through an API route)
alter table public.index_data_candidates enable row level security;
alter table public.kpi_documents enable row level security;
alter table public.kpi_check_state enable row level security;

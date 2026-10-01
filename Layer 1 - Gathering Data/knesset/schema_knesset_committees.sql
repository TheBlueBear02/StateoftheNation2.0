-- Knesset 25 committees — metadata, memberships, sessions, protocols, transcripts.
-- Apply manually in the Supabase SQL Editor (idempotent).
-- Prerequisite: public.knessets, public.people.
--
-- Scope: designed for the 25th Knesset first; knesset_id FK allows later terms.
-- Sources (ingest later):
--   OData ParliamentInfo.svc — KNS_Committee / KNS_CommitteeSession /
--     KNS_DocumentCommitteeSession (GroupTypeID=23 protocols)
--   Hasadna — mk_individual_committees.csv (membership; OData CommitteeID empty),
--     meeting_protocols_text / meeting_protocols_parts (full text + speaker turns)

-- Shared updated_at helper (no-op replace if already present with same body)
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ── Committees ───────────────────────────────────────────────────────────────
create table if not exists public.knesset_committees (
  id bigint generated always as identity primary key,
  knesset_committee_id integer not null,
  knesset_id bigint not null references public.knessets (id),
  name text not null,
  committee_type_id integer,
  committee_type_desc text,
  additional_type_id integer,
  additional_type_desc text,
  parent_committee_id integer,
  start_date date,
  end_date date,
  is_current boolean not null default false,
  email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint knesset_committees_knesset_committee_id_key unique (knesset_committee_id),
  constraint knesset_committees_date_order_check
    check (end_date is null or start_date is null or end_date >= start_date)
);

create index if not exists knesset_committees_knesset_id_idx
  on public.knesset_committees (knesset_id);

drop trigger if exists set_updated_at_knesset_committees on public.knesset_committees;
create trigger set_updated_at_knesset_committees
  before update on public.knesset_committees
  for each row
  execute function public.set_updated_at();

-- ── Memberships (seat layout) ────────────────────────────────────────────────
create table if not exists public.knesset_committee_memberships (
  id bigint generated always as identity primary key,
  committee_id bigint not null
    references public.knesset_committees (id) on delete cascade,
  person_id bigint not null references public.people (id),
  knesset_position_id integer,
  role_desc text,
  seat_role text not null default 'member'
    check (seat_role in ('chair', 'member', 'alternate', 'observer')),
  start_date date,
  end_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint knesset_committee_memberships_date_order_check
    check (end_date is null or start_date is null or end_date >= start_date)
);

-- One membership stretch per person/committee/start (null start = one open-ended row)
create unique index if not exists knesset_committee_memberships_natural_key
  on public.knesset_committee_memberships (committee_id, person_id, start_date)
  nulls not distinct;

create index if not exists knesset_committee_memberships_committee_idx
  on public.knesset_committee_memberships (committee_id);

create index if not exists knesset_committee_memberships_person_idx
  on public.knesset_committee_memberships (person_id);

create index if not exists knesset_committee_memberships_seat_role_idx
  on public.knesset_committee_memberships (committee_id, seat_role);

drop trigger if exists set_updated_at_knesset_committee_memberships
  on public.knesset_committee_memberships;
create trigger set_updated_at_knesset_committee_memberships
  before update on public.knesset_committee_memberships
  for each row
  execute function public.set_updated_at();

-- ── Sessions (ישיבות) ────────────────────────────────────────────────────────
create table if not exists public.knesset_committee_sessions (
  id bigint generated always as identity primary key,
  knesset_session_id integer not null,
  committee_id bigint not null
    references public.knesset_committees (id) on delete cascade,
  session_number integer,
  session_type_id integer,
  session_type_desc text,
  status_id integer,
  status_desc text,
  location text,
  session_url text,
  broadcast_url text,
  note text,
  start_at timestamptz,
  finish_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint knesset_committee_sessions_knesset_session_id_key
    unique (knesset_session_id),
  constraint knesset_committee_sessions_time_order_check
    check (finish_at is null or start_at is null or finish_at >= start_at)
);

create index if not exists knesset_committee_sessions_committee_start_idx
  on public.knesset_committee_sessions (committee_id, start_at desc nulls last);

drop trigger if exists set_updated_at_knesset_committee_sessions
  on public.knesset_committee_sessions;
create trigger set_updated_at_knesset_committee_sessions
  before update on public.knesset_committee_sessions
  for each row
  execute function public.set_updated_at();

-- ── Session documents (protocol file metadata) ───────────────────────────────
create table if not exists public.knesset_committee_session_documents (
  id bigint generated always as identity primary key,
  knesset_document_id bigint not null,
  session_id bigint not null
    references public.knesset_committee_sessions (id) on delete cascade,
  group_type_id integer,
  group_type_desc text,
  application_desc text,
  file_url text,
  sha256 text,
  storage_path text,
  fetched_at timestamptz,
  created_at timestamptz not null default now(),
  constraint knesset_committee_session_documents_knesset_document_id_key
    unique (knesset_document_id)
);

create index if not exists knesset_committee_session_documents_session_idx
  on public.knesset_committee_session_documents (session_id);

create index if not exists knesset_committee_session_documents_protocol_idx
  on public.knesset_committee_session_documents (session_id)
  where group_type_id = 23;

-- ── Transcripts (one full text per session) ──────────────────────────────────
create table if not exists public.knesset_committee_session_transcripts (
  id bigint generated always as identity primary key,
  session_id bigint not null
    references public.knesset_committee_sessions (id) on delete cascade,
  document_id bigint
    references public.knesset_committee_session_documents (id) on delete set null,
  full_text text,
  source text not null default 'hasadna'
    check (source in ('hasadna', 'parsed_file', 'manual')),
  parse_status text not null default 'pending'
    check (parse_status in ('pending', 'ready', 'failed', 'partial')),
  parsed_at timestamptz,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint knesset_committee_session_transcripts_session_id_key unique (session_id)
);

drop trigger if exists set_updated_at_knesset_committee_session_transcripts
  on public.knesset_committee_session_transcripts;
create trigger set_updated_at_knesset_committee_session_transcripts
  before update on public.knesset_committee_session_transcripts
  for each row
  execute function public.set_updated_at();

-- ── Transcript parts (speaker turns) ─────────────────────────────────────────
create table if not exists public.knesset_committee_transcript_parts (
  id bigint generated always as identity primary key,
  transcript_id bigint not null
    references public.knesset_committee_session_transcripts (id) on delete cascade,
  session_id bigint not null
    references public.knesset_committee_sessions (id) on delete cascade,
  ordinal integer not null,
  speaker_header text,
  person_id bigint references public.people (id) on delete set null,
  body text not null,
  start_offset_ms integer,
  created_at timestamptz not null default now(),
  constraint knesset_committee_transcript_parts_ordinal_key
    unique (transcript_id, ordinal),
  constraint knesset_committee_transcript_parts_ordinal_nonneg_check
    check (ordinal >= 0),
  constraint knesset_committee_transcript_parts_offset_nonneg_check
    check (start_offset_ms is null or start_offset_ms >= 0)
);

create index if not exists knesset_committee_transcript_parts_session_ordinal_idx
  on public.knesset_committee_transcript_parts (session_id, ordinal);

create index if not exists knesset_committee_transcript_parts_session_person_idx
  on public.knesset_committee_transcript_parts (session_id, person_id);

-- Keyword search (Hebrew-friendly: simple config; no stemming dependency)
create index if not exists knesset_committee_transcript_parts_body_fts_idx
  on public.knesset_committee_transcript_parts
  using gin (to_tsvector('simple', coalesce(speaker_header, '') || ' ' || body));

-- ── Attendance stub (empty until protocol-derived presence exists) ────────────
create table if not exists public.knesset_committee_session_attendance (
  id bigint generated always as identity primary key,
  session_id bigint not null
    references public.knesset_committee_sessions (id) on delete cascade,
  person_id bigint not null references public.people (id) on delete cascade,
  attended boolean,
  source text,
  created_at timestamptz not null default now(),
  constraint knesset_committee_session_attendance_session_person_key
    unique (session_id, person_id)
);

create index if not exists knesset_committee_session_attendance_session_idx
  on public.knesset_committee_session_attendance (session_id);

-- ── RLS + anon SELECT (public site reads; writes via service role) ────────────
alter table public.knesset_committees enable row level security;
alter table public.knesset_committee_memberships enable row level security;
alter table public.knesset_committee_sessions enable row level security;
alter table public.knesset_committee_session_documents enable row level security;
alter table public.knesset_committee_session_transcripts enable row level security;
alter table public.knesset_committee_transcript_parts enable row level security;
alter table public.knesset_committee_session_attendance enable row level security;

grant select on public.knesset_committees to anon;
grant select on public.knesset_committee_memberships to anon;
grant select on public.knesset_committee_sessions to anon;
grant select on public.knesset_committee_session_documents to anon;
grant select on public.knesset_committee_session_transcripts to anon;
grant select on public.knesset_committee_transcript_parts to anon;
grant select on public.knesset_committee_session_attendance to anon;

drop policy if exists "Public read knesset committees" on public.knesset_committees;
create policy "Public read knesset committees"
  on public.knesset_committees for select to anon using (true);

drop policy if exists "Public read knesset committee memberships"
  on public.knesset_committee_memberships;
create policy "Public read knesset committee memberships"
  on public.knesset_committee_memberships for select to anon using (true);

drop policy if exists "Public read knesset committee sessions"
  on public.knesset_committee_sessions;
create policy "Public read knesset committee sessions"
  on public.knesset_committee_sessions for select to anon using (true);

drop policy if exists "Public read knesset committee session documents"
  on public.knesset_committee_session_documents;
create policy "Public read knesset committee session documents"
  on public.knesset_committee_session_documents for select to anon using (true);

drop policy if exists "Public read knesset committee session transcripts"
  on public.knesset_committee_session_transcripts;
create policy "Public read knesset committee session transcripts"
  on public.knesset_committee_session_transcripts for select to anon using (true);

drop policy if exists "Public read knesset committee transcript parts"
  on public.knesset_committee_transcript_parts;
create policy "Public read knesset committee transcript parts"
  on public.knesset_committee_transcript_parts for select to anon using (true);

drop policy if exists "Public read knesset committee session attendance"
  on public.knesset_committee_session_attendance;
create policy "Public read knesset committee session attendance"
  on public.knesset_committee_session_attendance for select to anon using (true);

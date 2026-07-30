-- Revoke public anon UPDATE on elections edit tables.
-- Safe: does NOT delete/alter rows, tables, SELECT grants, or SELECT policies.
-- Pipelines keep writing via SUPABASE_SERVICE_KEY (bypasses RLS).
-- Public pages keep reading via anon SELECT.
-- /elections/edit saves via Next API + service key (see updateElectionCandidate.ts).
--
-- Apply once in Supabase SQL Editor AFTER deploying the app change that
-- routes all saves through /api/elections/update-candidate|update-party.

drop policy if exists "Anon update election candidates" on public.election_candidates;
drop policy if exists "Anon update people" on public.people;
drop policy if exists "Anon update election parties" on public.election_parties;

revoke update on public.election_candidates from anon;
revoke update on public.people from anon;
revoke update on public.election_parties from anon;

-- Optional verification (expect 0 rows):
-- select grantee, table_name, privilege_type
-- from information_schema.role_table_grants
-- where grantee = 'anon'
--   and privilege_type = 'UPDATE'
--   and table_schema = 'public'
--   and table_name in ('people', 'election_candidates', 'election_parties');

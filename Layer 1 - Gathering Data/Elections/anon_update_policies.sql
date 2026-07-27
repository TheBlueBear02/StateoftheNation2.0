-- Run once in Supabase SQL Editor for production builds (anon client writes).
-- Dev (`npm run dev`) uses the service key via a local Vite API route instead.

grant update on public.election_candidates to anon;
grant update on public.people to anon;

create policy "Anon update election candidates"
on public.election_candidates
for update
to anon
using (true)
with check (true);

create policy "Anon update people"
on public.people
for update
to anon
using (true)
with check (true);

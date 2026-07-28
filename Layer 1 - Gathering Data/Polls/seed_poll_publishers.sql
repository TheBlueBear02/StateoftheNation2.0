-- Seed poll_publishers from distinct polls.publisher values.
-- Safe to re-run: skips existing names; does not overwrite logo_url.
-- Run in Supabase SQL Editor after schema_polls.sql (poll_publishers table).

insert into public.poll_publishers (name, name_he)
select
  p.publisher as name,
  (
    select p2.publisher_he
    from public.polls p2
    where p2.publisher = p.publisher
      and p2.publisher_he is not null
      and trim(p2.publisher_he) <> ''
    order by p2.fieldwork_end desc nulls last
    limit 1
  ) as name_he
from public.polls p
where p.publisher is not null
  and trim(p.publisher) <> ''
group by p.publisher
on conflict (name) do update set
  name_he = coalesce(public.poll_publishers.name_he, excluded.name_he);

-- Link existing polls to their publisher row.
update public.polls p
set publisher_id = pp.id
from public.poll_publishers pp
where p.publisher = pp.name
  and p.publisher_id is distinct from pp.id;

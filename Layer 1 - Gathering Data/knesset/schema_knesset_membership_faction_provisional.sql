-- Provisional MK→faction links.
-- Apply manually in the Supabase SQL editor before the next knesset pipeline run.
--
-- Official OData FactionID always wins. faction_id_provisional is true only when
-- faction_id was filled from the election-list fallback because OData FactionID
-- was null. The next sync clears the flag when OData provides a FactionID.

alter table public.knesset_memberships
  add column if not exists faction_id_provisional boolean not null default false;

comment on column public.knesset_memberships.faction_id_provisional is
  'True when faction_id came from the election-list fallback (OData FactionID was null). Cleared when an official FactionID is written. Never treat a false/default row as safe to overwrite with a fallback.';

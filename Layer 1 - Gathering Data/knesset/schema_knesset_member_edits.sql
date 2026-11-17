-- Hand edits from /knesset/edit.
-- Amir must run this once in the Supabase SQL editor before saving MK
-- details or uploading a photo. Faction assignment also uses faction_id_manual
-- from this file. Until it runs, the editor refuses those saves.
--
-- people.manual_fields: OData person sync leaves the listed columns unchanged.
-- knesset_memberships.faction_id_manual: the election-list fallback and the
-- Open Knesset faction apply leave the row alone. A published OData FactionID
-- still overwrites faction_id and clears the flag.
-- Storage bucket mk-images: public photo URLs stored on people.image_url.

alter table public.people
  add column if not exists manual_fields text[] not null default '{}';

alter table public.people
  drop constraint if exists people_manual_fields_known;

alter table public.people
  add constraint people_manual_fields_known
  check (
    manual_fields <@ array[
      'full_name',
      'gender',
      'birth_date',
      'email',
      'image_url',
      'wikipedia_url',
      'twitter_handle'
    ]::text[]
  );

comment on column public.people.manual_fields is
  'Columns edited on /knesset/edit. The Knesset person sync does not overwrite them. image_url in this list is also skipped by the static KM Images matcher.';

alter table public.knesset_memberships
  add column if not exists faction_id_manual boolean not null default false;

comment on column public.knesset_memberships.faction_id_manual is
  'True when /knesset/edit set faction_id. Provisional matching and Open Knesset faction apply skip the row. Official OData FactionID overwrites it and clears the flag.';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'mk-images',
  'mk-images',
  true,
  4194304,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'mk_images_public_read'
  ) then
    create policy mk_images_public_read
      on storage.objects
      for select
      to public
      using (bucket_id = 'mk-images');
  end if;
end $$;

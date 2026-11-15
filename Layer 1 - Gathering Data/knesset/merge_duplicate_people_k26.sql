-- Merge duplicate people rows for Knesset 26, then fill provisional factions.
--
-- Run in the Supabase SQL editor (postgres role). Do not run as the anon key:
-- RLS hides some of these tables from anon, and this script writes.
--
-- The file is one transaction that ends in ROLLBACK. The first run is a preview:
-- read every result grid, then change the final ROLLBACK to COMMIT and run it
-- again. A second COMMIT is a no-op.
--
-- What it does
--   1. Pairs a Knesset 26 MK people row (knesset_person_id set) with a 2026
--      candidate people row (knesset_person_id null) when the normalized names
--      match and the pair is unique in both directions.
--   2. Shows that list first, exact matches before token matches.
--   3. Keeps the MK row. Copies birth_date, gender, image_url, email,
--      twitter_handle, wikipedia_url, and wikidata_id onto it only where the
--      MK value is null. Repoints every foreign key to people, then deletes
--      the candidate row.
--   4. Sets knesset_memberships.faction_id from that candidate's 2026 party,
--      mapped onto a Knesset 26 faction, with faction_id_provisional = true.
--      A non-provisional faction_id is never overwritten.
--   5. Also fills that provisional faction for K26 memberships whose person
--      is already the candidate row (one people row, no merge).
--
-- Name rules match knesset_term.py: word-joiners and other format characters
-- drop out, parenthetical nicknames drop out, apostrophe and quote variants
-- drop out, final letters fold (ךםןףץ → כמנפצ), and a doubled yud collapses
-- (עטייה / עטיה). A shorter name matches a longer one only as a whole-token
-- subsequence (a middle name), not as a prefix (רפי does not match רפאל).
-- Two different knesset_person_id values are never merged (אלי כהן).
--
-- The nightly loader already copies a provisional faction across two people
-- rows with this same bridge. It does not delete the candidate row. That
-- delete stays in this reviewed script: a few pairs are token matches, and
-- one MK already has a different photo than the candidate row. After COMMIT,
-- the loader will not recreate the duplicate. People sync upserts on
-- knesset_person_id, and the candidate list then points at that row.
--
-- To link one pair by id instead of every name match, replace the NULL, NULL
-- line below with the MK people.id and the candidate people.id, for example
--   INSERT INTO merge_options VALUES (6190, 5965);
-- In that mode only that pair is merged, and the bulk faction fill is skipped.
-- The candidate id must be on the 2026 lists and must have no knesset_person_id.
-- The MK id must have a knesset_person_id and a Knesset 26 membership.

BEGIN;

CREATE FUNCTION pg_temp.strip_marks(raw text) RETURNS text
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  marks text := '[' || chr(1425) || '-' || chr(1479) || chr(8203) || chr(8204)
    || chr(8205) || chr(8206) || chr(8207) || chr(8234) || chr(8235) || chr(8236)
    || chr(8288) || chr(65279) || ']';
BEGIN
  RETURN regexp_replace(COALESCE(raw, ''), marks, '', 'g');
END;
$$;

CREATE FUNCTION pg_temp.loose_political_name(raw text) RETURNS text
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  t text;
  i int;
  ch text;
  out text := '';
  quotes text := '"''`״׳„“”«»‘’';
  dashes text := '-–—־';
  punct text := '!?.,:;•·';
BEGIN
  IF raw IS NULL OR btrim(raw) = '' THEN
    RETURN '';
  END IF;
  t := translate(pg_temp.strip_marks(raw), 'ךםןףץ', 'כמנפצ');
  FOR i IN 1..char_length(t) LOOP
    ch := substr(t, i, 1);
    IF position(ch IN quotes) > 0 OR position(ch IN dashes) > 0 OR position(ch IN punct) > 0 THEN
      out := out || ' ';
    ELSE
      out := out || ch;
    END IF;
  END LOOP;
  RETURN btrim(regexp_replace(out, '\s+', ' ', 'g'));
END;
$$;

CREATE FUNCTION pg_temp.leadership_head(loose text) RETURNS text
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  head text := loose;
  marker text;
BEGIN
  FOREACH marker IN ARRAY ARRAY[' בראשות ', ' בהנהגת ', ' לראשות '] LOOP
    IF position(marker IN head) > 0 THEN
      head := btrim(split_part(head, marker, 1));
    END IF;
  END LOOP;
  RETURN head;
END;
$$;

CREATE FUNCTION pg_temp.name_variants(raw text) RETURNS text[]
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  loose text := pg_temp.loose_political_name(raw);
  variants text[] := ARRAY[]::text[];
  head text;
  rel int;
  pos int;
  tail text;
  part text;
  search_from int := 1;
BEGIN
  IF loose = '' THEN
    RETURN variants;
  END IF;
  variants := array_append(variants, loose);
  head := pg_temp.leadership_head(loose);
  IF head <> '' AND head <> loose THEN
    variants := array_append(variants, head);
  END IF;
  LOOP
    rel := position(' ו' IN substr(loose, search_from));
    EXIT WHEN rel = 0;
    pos := search_from + rel - 1;
    tail := btrim(substr(loose, pos + 2));
    search_from := pos + 2;
    IF position(' בראשות ' IN (' ' || tail || ' ')) = 0
       AND position(' בהנהגת ' IN (' ' || tail || ' ')) = 0
       AND position(' לראשות ' IN (' ' || tail || ' ')) = 0 THEN
      CONTINUE;
    END IF;
    part := pg_temp.leadership_head(tail);
    IF part <> '' AND NOT (part = ANY (variants)) THEN
      variants := array_append(variants, part);
    END IF;
  END LOOP;
  RETURN variants;
END;
$$;

CREATE FUNCTION pg_temp.shared_leading(left_name text, right_name text) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  left_words text[] := regexp_split_to_array(left_name, ' ');
  right_words text[] := regexp_split_to_array(right_name, ' ');
  shared int := 0;
  i int;
BEGIN
  IF COALESCE(array_length(left_words, 1), 0) < 2
     OR COALESCE(array_length(right_words, 1), 0) < 2 THEN
    RETURN false;
  END IF;
  FOR i IN 1..LEAST(array_length(left_words, 1), array_length(right_words, 1)) LOOP
    EXIT WHEN left_words[i] IS DISTINCT FROM right_words[i];
    shared := shared + 1;
  END LOOP;
  RETURN shared >= 2;
END;
$$;

CREATE FUNCTION pg_temp.boundary_prefix(shorter text, longer text) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  IF char_length(shorter) < 3 OR char_length(longer) <= char_length(shorter) THEN
    RETURN false;
  END IF;
  IF left(longer, char_length(shorter)) <> shorter THEN
    RETURN false;
  END IF;
  RETURN substr(longer, char_length(shorter) + 1, 1) IN (' ', '-', '–', '—', '־', 'ו');
END;
$$;

CREATE FUNCTION pg_temp.same_party(left_name text, right_name text) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  left_variants text[] := pg_temp.name_variants(left_name);
  right_variants text[] := pg_temp.name_variants(right_name);
  left_part text;
  right_part text;
BEGIN
  IF COALESCE(array_length(left_variants, 1), 0) = 0
     OR COALESCE(array_length(right_variants, 1), 0) = 0 THEN
    RETURN false;
  END IF;
  FOREACH left_part IN ARRAY left_variants LOOP
    FOREACH right_part IN ARRAY right_variants LOOP
      IF replace(left_part, ' ', '') = replace(right_part, ' ', '')
         OR pg_temp.boundary_prefix(left_part, right_part)
         OR pg_temp.boundary_prefix(right_part, left_part)
         OR pg_temp.shared_leading(left_part, right_part) THEN
        RETURN true;
      END IF;
    END LOOP;
  END LOOP;
  RETURN false;
END;
$$;

CREATE FUNCTION pg_temp.person_name_key(raw text) RETURNS text
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  t text;
  i int;
  ch text;
  out text := '';
  quotes text := '"''`״׳„“”«»‘’';
  dashes text := '-–—־';
  punct text := '!?.,:;•·';
BEGIN
  IF raw IS NULL OR btrim(raw) = '' THEN
    RETURN '';
  END IF;
  t := regexp_replace(raw, '\([^)]*\)', ' ', 'g');
  t := translate(pg_temp.strip_marks(t), 'ךםןףץ', 'כמנפצ');
  t := replace(t, 'יי', 'י');
  FOR i IN 1..char_length(t) LOOP
    ch := substr(t, i, 1);
    IF position(ch IN quotes) > 0 THEN
      CONTINUE;
    ELSIF position(ch IN dashes) > 0 OR position(ch IN punct) > 0 THEN
      out := out || ' ';
    ELSE
      out := out || ch;
    END IF;
  END LOOP;
  RETURN btrim(regexp_replace(out, '\s+', ' ', 'g'));
END;
$$;

CREATE FUNCTION pg_temp.tokens_align(shorter text[], longer text[]) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  index int := 1;
  token text;
BEGIN
  IF COALESCE(array_length(shorter, 1), 0) < 2
     OR COALESCE(array_length(longer, 1), 0) <= COALESCE(array_length(shorter, 1), 0) THEN
    RETURN false;
  END IF;
  FOREACH token IN ARRAY longer LOOP
    IF token = shorter[index] THEN
      index := index + 1;
      IF index > array_length(shorter, 1) THEN
        RETURN true;
      END IF;
    END IF;
  END LOOP;
  RETURN false;
END;
$$;

CREATE FUNCTION pg_temp.person_match_confidence(left_name text, right_name text) RETURNS text
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  left_key text := pg_temp.person_name_key(left_name);
  right_key text := pg_temp.person_name_key(right_name);
  left_tokens text[];
  right_tokens text[];
BEGIN
  IF left_key = '' OR right_key = '' THEN
    RETURN NULL;
  END IF;
  IF left_key = right_key THEN
    RETURN 'exact';
  END IF;
  left_tokens := regexp_split_to_array(left_key, ' ');
  right_tokens := regexp_split_to_array(right_key, ' ');
  IF pg_temp.tokens_align(left_tokens, right_tokens)
     OR pg_temp.tokens_align(right_tokens, left_tokens) THEN
    RETURN 'tokens';
  END IF;
  RETURN NULL;
END;
$$;

CREATE TEMP TABLE merge_options (
  only_mk_person_id bigint,
  only_candidate_person_id bigint
);
-- Both NULL: merge every unique name pair. Set both ids to merge one pair.
INSERT INTO merge_options VALUES (NULL, NULL);

DO $$
BEGIN
  IF (SELECT only_mk_person_id IS NULL FROM merge_options)
     IS DISTINCT FROM (SELECT only_candidate_person_id IS NULL FROM merge_options) THEN
    RAISE EXCEPTION
      'Set both merge_options ids, or leave both NULL. One NULL is not a pair.';
  END IF;
END;
$$;

CREATE TEMP TABLE k26 AS
SELECT id
FROM public.knessets
WHERE knesset_number = 26;

CREATE TEMP TABLE election_2026 AS
SELECT id
FROM public.elections
WHERE knesset_number = 26
ORDER BY year DESC NULLS LAST, date DESC NULLS LAST
LIMIT 1;

CREATE TEMP TABLE party_faction AS
SELECT party.id AS party_id,
       party.short_name,
       party.name AS party_name,
       CASE
         WHEN party.knesset_faction_id IS NOT NULL
              AND EXISTS (
                SELECT 1
                FROM public.knesset_factions faction
                JOIN k26 ON k26.id = faction.knesset_id
                WHERE faction.id = party.knesset_faction_id
              )
           THEN party.knesset_faction_id
         ELSE (
           SELECT faction.id
           FROM public.knesset_factions faction
           JOIN k26 ON k26.id = faction.knesset_id
           WHERE pg_temp.same_party(party.short_name, faction.short_name)
              OR pg_temp.same_party(party.short_name, faction.name)
              OR pg_temp.same_party(party.name, faction.short_name)
              OR pg_temp.same_party(party.name, faction.name)
           ORDER BY faction.id
           LIMIT 1
         )
       END AS faction_id,
       (
         SELECT count(*)
         FROM public.knesset_factions faction
         JOIN k26 ON k26.id = faction.knesset_id
         WHERE pg_temp.same_party(party.short_name, faction.short_name)
            OR pg_temp.same_party(party.short_name, faction.name)
            OR pg_temp.same_party(party.name, faction.short_name)
            OR pg_temp.same_party(party.name, faction.name)
       ) AS name_hits
FROM public.election_parties party
JOIN election_2026 ON election_2026.id = party.election_id;

-- A linked older-term faction is ignored. More than one name hit is no faction.
UPDATE party_faction
SET faction_id = NULL
WHERE faction_id IS NULL
   OR (
     name_hits <> 1
     AND NOT EXISTS (
       SELECT 1
       FROM public.knesset_factions faction
       JOIN k26 ON k26.id = faction.knesset_id
       JOIN public.election_parties party ON party.id = party_faction.party_id
       WHERE faction.id = party.knesset_faction_id
     )
   );

CREATE TEMP TABLE mk_people AS
SELECT DISTINCT people.id, people.full_name, people.knesset_person_id
FROM public.people
JOIN public.knesset_memberships membership ON membership.person_id = people.id
JOIN k26 ON k26.id = membership.knesset_id
WHERE people.knesset_person_id IS NOT NULL;

CREATE TEMP TABLE candidate_people AS
SELECT DISTINCT people.id, people.full_name, people.knesset_person_id
FROM public.people
JOIN public.election_candidates candidate ON candidate.person_id = people.id
JOIN election_2026 ON election_2026.id = candidate.election_id;

CREATE TEMP TABLE name_hits AS
SELECT mk.id AS mk_person_id,
       candidate.id AS candidate_person_id,
       pg_temp.person_match_confidence(mk.full_name, candidate.full_name) AS confidence
FROM mk_people mk
JOIN candidate_people candidate
  ON candidate.knesset_person_id IS NULL
 AND candidate.id <> mk.id
WHERE pg_temp.person_match_confidence(mk.full_name, candidate.full_name) IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM candidate_people already WHERE already.id = mk.id
  );

CREATE TEMP TABLE merge_pairs AS
SELECT hit.mk_person_id,
       hit.candidate_person_id,
       hit.confidence,
       party.party_id,
       party.short_name AS party_short_name,
       party.faction_id
FROM name_hits hit
JOIN public.election_candidates candidate
  ON candidate.person_id = hit.candidate_person_id
JOIN election_2026 ON election_2026.id = candidate.election_id
JOIN party_faction party ON party.party_id = candidate.party_id
WHERE hit.mk_person_id IN (
        SELECT mk_person_id FROM name_hits GROUP BY mk_person_id HAVING count(*) = 1
      )
  AND hit.candidate_person_id IN (
        SELECT candidate_person_id FROM name_hits GROUP BY candidate_person_id HAVING count(*) = 1
      )
  AND hit.candidate_person_id IN (
        SELECT person_id
        FROM public.election_candidates listed
        JOIN election_2026 ON election_2026.id = listed.election_id
        GROUP BY person_id
        HAVING count(DISTINCT party_id) = 1
      )
  AND NOT EXISTS (SELECT 1 FROM merge_options WHERE only_mk_person_id IS NOT NULL);

-- One explicit pair. Name match is not required; the preview shows confidence
-- 'manual' when the names would not have matched on their own.
INSERT INTO merge_pairs (
  mk_person_id, candidate_person_id, confidence, party_id, party_short_name, faction_id
)
SELECT mk.id,
       candidate.id,
       COALESCE(
         pg_temp.person_match_confidence(mk.full_name, candidate.full_name),
         'manual'
       ),
       party.party_id,
       party.short_name,
       party.faction_id
FROM merge_options options
JOIN mk_people mk ON mk.id = options.only_mk_person_id
JOIN candidate_people candidate ON candidate.id = options.only_candidate_person_id
JOIN public.election_candidates listed
  ON listed.person_id = candidate.id
JOIN election_2026 ON election_2026.id = listed.election_id
JOIN party_faction party ON party.party_id = listed.party_id
WHERE options.only_mk_person_id IS NOT NULL
  AND candidate.knesset_person_id IS NULL
  AND mk.id <> candidate.id
  AND (
    SELECT count(DISTINCT party_id)
    FROM public.election_candidates other_list
    JOIN election_2026 ON election_2026.id = other_list.election_id
    WHERE other_list.person_id = candidate.id
  ) = 1;

-- Preview 1. Pairs that will be merged. exact, then tokens, then manual.
SELECT 'merge' AS action,
       pair.confidence,
       pair.mk_person_id,
       mk.full_name AS mk_name,
       mk.knesset_person_id AS mk_knesset_person_id,
       pair.candidate_person_id,
       cand.full_name AS candidate_name,
       pair.party_short_name,
       pair.faction_id,
       faction.name AS faction_name,
       concat_ws(
         ', ',
         CASE WHEN mk.birth_date IS NULL AND cand.birth_date IS NOT NULL THEN 'birth_date' END,
         CASE WHEN mk.gender IS NULL AND cand.gender IS NOT NULL THEN 'gender' END,
         CASE WHEN mk.image_url IS NULL AND cand.image_url IS NOT NULL THEN 'image_url' END,
         CASE WHEN mk.email IS NULL AND cand.email IS NOT NULL THEN 'email' END,
         CASE WHEN mk.twitter_handle IS NULL AND cand.twitter_handle IS NOT NULL THEN 'twitter_handle' END,
         CASE WHEN mk.wikipedia_url IS NULL AND cand.wikipedia_url IS NOT NULL THEN 'wikipedia_url' END,
         CASE WHEN mk.wikidata_id IS NULL AND cand.wikidata_id IS NOT NULL THEN 'wikidata_id' END
       ) AS copy_onto_mk,
       concat_ws(
         ', ',
         CASE
           WHEN mk.birth_date IS NOT NULL AND cand.birth_date IS NOT NULL
                AND mk.birth_date IS DISTINCT FROM cand.birth_date
             THEN 'birth_date'
         END,
         CASE
           WHEN mk.gender IS NOT NULL AND cand.gender IS NOT NULL
                AND mk.gender IS DISTINCT FROM cand.gender
             THEN 'gender'
         END,
         CASE
           WHEN mk.image_url IS NOT NULL AND cand.image_url IS NOT NULL
                AND mk.image_url IS DISTINCT FROM cand.image_url
             THEN 'image_url'
         END,
         CASE
           WHEN mk.email IS NOT NULL AND cand.email IS NOT NULL
                AND mk.email IS DISTINCT FROM cand.email
             THEN 'email'
         END,
         CASE
           WHEN mk.wikidata_id IS NOT NULL AND cand.wikidata_id IS NOT NULL
                AND mk.wikidata_id IS DISTINCT FROM cand.wikidata_id
             THEN 'wikidata_id'
         END
       ) AS kept_mk_value
FROM merge_pairs pair
JOIN public.people mk ON mk.id = pair.mk_person_id
JOIN public.people cand ON cand.id = pair.candidate_person_id
LEFT JOIN public.knesset_factions faction ON faction.id = pair.faction_id
ORDER BY CASE pair.confidence WHEN 'exact' THEN 0 WHEN 'tokens' THEN 1 ELSE 2 END,
         mk.full_name;

-- Preview 2. Not merged.
SELECT reason, mk_person_id, mk_name, mk_knesset_person_id,
       other_person_id, other_name, other_knesset_person_id
FROM (
  SELECT 'kpid_conflict' AS reason,
         mk.id AS mk_person_id,
         mk.full_name AS mk_name,
         mk.knesset_person_id AS mk_knesset_person_id,
         other.id AS other_person_id,
         other.full_name AS other_name,
         other.knesset_person_id AS other_knesset_person_id
  FROM mk_people mk
  JOIN candidate_people other
    ON other.knesset_person_id IS NOT NULL
   AND other.knesset_person_id <> mk.knesset_person_id
   AND pg_temp.person_match_confidence(mk.full_name, other.full_name) IS NOT NULL
  UNION ALL
  SELECT 'ambiguous_name',
         mk.id,
         mk.full_name,
         mk.knesset_person_id,
         hit.candidate_person_id,
         cand.full_name,
         cand.knesset_person_id
  FROM name_hits hit
  JOIN mk_people mk ON mk.id = hit.mk_person_id
  JOIN public.people cand ON cand.id = hit.candidate_person_id
  WHERE hit.mk_person_id IN (
          SELECT mk_person_id FROM name_hits GROUP BY mk_person_id HAVING count(*) > 1
        )
     OR hit.candidate_person_id IN (
          SELECT candidate_person_id FROM name_hits GROUP BY candidate_person_id HAVING count(*) > 1
        )
  UNION ALL
  SELECT 'no_candidate_match',
         mk.id,
         mk.full_name,
         mk.knesset_person_id,
         NULL,
         NULL,
         NULL
  FROM mk_people mk
  WHERE NOT EXISTS (SELECT 1 FROM candidate_people already WHERE already.id = mk.id)
    AND NOT EXISTS (SELECT 1 FROM name_hits hit WHERE hit.mk_person_id = mk.id)
    AND NOT EXISTS (
      SELECT 1
      FROM candidate_people other
      WHERE other.knesset_person_id IS NOT NULL
        AND other.knesset_person_id <> mk.knesset_person_id
        AND pg_temp.person_match_confidence(mk.full_name, other.full_name) IS NOT NULL
    )
    AND EXISTS (
      SELECT 1
      FROM public.knesset_memberships membership
      JOIN k26 ON k26.id = membership.knesset_id
      WHERE membership.person_id = mk.id
        AND membership.faction_id IS NULL
    )
) excluded
ORDER BY reason, mk_name;

-- Preview 3. Same people row already. Faction only, no delete.
CREATE TEMP TABLE faction_only AS
SELECT mk.id AS person_id,
       mk.full_name,
       party.party_id,
       party.short_name AS party_short_name,
       party.faction_id
FROM mk_people mk
JOIN public.election_candidates listed ON listed.person_id = mk.id
JOIN election_2026 ON election_2026.id = listed.election_id
JOIN party_faction party ON party.party_id = listed.party_id
WHERE NOT EXISTS (SELECT 1 FROM merge_options WHERE only_mk_person_id IS NOT NULL)
  AND NOT EXISTS (SELECT 1 FROM merge_pairs pair WHERE pair.mk_person_id = mk.id)
  AND party.faction_id IS NOT NULL
  AND (
    SELECT count(DISTINCT party_id)
    FROM public.election_candidates other_list
    JOIN election_2026 ON election_2026.id = other_list.election_id
    WHERE other_list.person_id = mk.id
  ) = 1
  AND EXISTS (
    SELECT 1
    FROM public.knesset_memberships membership
    JOIN k26 ON k26.id = membership.knesset_id
    WHERE membership.person_id = mk.id
      AND membership.faction_id IS NULL
  );

SELECT 'faction_only' AS action,
       faction_only.person_id,
       faction_only.full_name,
       faction_only.party_short_name,
       faction_only.faction_id,
       faction.name AS faction_name
FROM faction_only
LEFT JOIN public.knesset_factions faction ON faction.id = faction_only.faction_id
ORDER BY faction_only.full_name;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM merge_options WHERE only_mk_person_id IS NOT NULL)
     AND NOT EXISTS (SELECT 1 FROM merge_pairs) THEN
    RAISE EXCEPTION
      'That pair cannot be merged. The MK id needs a knesset_person_id and a Knesset 26 membership. The candidate id must be on the 2026 list, have no knesset_person_id, and be on exactly one party.';
  END IF;
END;
$$;

-- Stop before any delete if production has a people foreign key this script
-- does not repoint. Composite keys are unexpected and also stop the script.
DO $$
DECLARE
  extra text;
BEGIN
  SELECT string_agg(
           format('%I.%I', nsp.nspname || '.' || rel.relname, att.attname),
           ', ' ORDER BY rel.relname, att.attname
         )
    INTO extra
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
  JOIN LATERAL unnest(con.conkey) AS key(attnum) ON true
  JOIN pg_attribute att
    ON att.attrelid = rel.oid
   AND att.attnum = key.attnum
  WHERE con.contype = 'f'
    AND con.confrelid = 'public.people'::regclass
    AND (
      array_length(con.conkey, 1) IS DISTINCT FROM 1
      OR format('%s.%s', rel.relname, att.attname) NOT IN (
        'knesset_memberships.person_id',
        'minister_appointments.person_id',
        'knesset_committee_memberships.person_id',
        'knesset_committee_transcript_parts.person_id',
        'knesset_committee_session_attendance.person_id',
        'election_candidates.person_id',
        'dream_cabinet_picks.person_id'
      )
    );
  IF extra IS NOT NULL THEN
    RAISE EXCEPTION
      'Unhandled foreign key to people (%). Add it to this script before deleting a row.',
      extra;
  END IF;
END;
$$;

DO $$
DECLARE
  pair record;
  wikidata text;
BEGIN
  FOR pair IN
    SELECT * FROM merge_pairs ORDER BY mk_person_id
  LOOP
    UPDATE public.people AS canon
    SET birth_date = COALESCE(canon.birth_date, dup.birth_date),
        gender = COALESCE(canon.gender, dup.gender),
        image_url = COALESCE(canon.image_url, dup.image_url),
        email = COALESCE(canon.email, dup.email),
        twitter_handle = COALESCE(canon.twitter_handle, dup.twitter_handle),
        wikipedia_url = COALESCE(canon.wikipedia_url, dup.wikipedia_url),
        updated_at = now()
    FROM public.people AS dup
    WHERE canon.id = pair.mk_person_id
      AND dup.id = pair.candidate_person_id;

    SELECT dup.wikidata_id
      INTO wikidata
    FROM public.people dup
    WHERE dup.id = pair.candidate_person_id;

    IF wikidata IS NOT NULL
       AND EXISTS (
         SELECT 1 FROM public.people canon
         WHERE canon.id = pair.mk_person_id AND canon.wikidata_id IS NULL
       ) THEN
      UPDATE public.people SET wikidata_id = NULL WHERE id = pair.candidate_person_id;
      UPDATE public.people SET wikidata_id = wikidata WHERE id = pair.mk_person_id;
    END IF;

    DELETE FROM public.election_candidates dup_row
    USING public.election_candidates keep_row
    WHERE dup_row.person_id = pair.candidate_person_id
      AND keep_row.person_id = pair.mk_person_id
      AND keep_row.party_id = dup_row.party_id;
    UPDATE public.election_candidates
    SET person_id = pair.mk_person_id
    WHERE person_id = pair.candidate_person_id;

    DELETE FROM public.knesset_committee_memberships dup_row
    USING public.knesset_committee_memberships keep_row
    WHERE dup_row.person_id = pair.candidate_person_id
      AND keep_row.person_id = pair.mk_person_id
      AND keep_row.committee_id = dup_row.committee_id
      AND keep_row.start_date IS NOT DISTINCT FROM dup_row.start_date;
    UPDATE public.knesset_committee_memberships
    SET person_id = pair.mk_person_id
    WHERE person_id = pair.candidate_person_id;

    DELETE FROM public.knesset_committee_session_attendance dup_row
    USING public.knesset_committee_session_attendance keep_row
    WHERE dup_row.person_id = pair.candidate_person_id
      AND keep_row.person_id = pair.mk_person_id
      AND keep_row.session_id = dup_row.session_id;
    UPDATE public.knesset_committee_session_attendance
    SET person_id = pair.mk_person_id
    WHERE person_id = pair.candidate_person_id;

    UPDATE public.knesset_memberships
    SET person_id = pair.mk_person_id
    WHERE person_id = pair.candidate_person_id;

    UPDATE public.minister_appointments
    SET person_id = pair.mk_person_id
    WHERE person_id = pair.candidate_person_id;

    UPDATE public.knesset_committee_transcript_parts
    SET person_id = pair.mk_person_id
    WHERE person_id = pair.candidate_person_id;

    UPDATE public.dream_cabinet_picks
    SET person_id = pair.mk_person_id
    WHERE person_id = pair.candidate_person_id;

    UPDATE public.knesset_memberships membership
    SET faction_id = pair.faction_id,
        faction_id_provisional = true
    WHERE membership.person_id = pair.mk_person_id
      AND membership.knesset_id IN (SELECT id FROM k26)
      AND pair.faction_id IS NOT NULL
      AND (
        membership.faction_id IS NULL
        OR membership.faction_id_provisional
      );

    DELETE FROM public.people WHERE id = pair.candidate_person_id;
  END LOOP;
END;
$$;

UPDATE public.knesset_memberships membership
SET faction_id = faction_only.faction_id,
    faction_id_provisional = true
FROM faction_only
WHERE membership.person_id = faction_only.person_id
  AND membership.knesset_id IN (SELECT id FROM k26)
  AND (
    membership.faction_id IS NULL
    OR membership.faction_id_provisional
  );

-- What COMMIT would leave behind. Still rolled back until the last line changes.
SELECT
  (SELECT count(*) FROM merge_pairs) AS pairs_in_this_run,
  (SELECT count(*) FROM faction_only) AS faction_only_in_this_run,
  (
    SELECT count(*)
    FROM public.knesset_memberships membership
    JOIN public.knessets knesset ON knesset.id = membership.knesset_id
    WHERE knesset.knesset_number = 26
      AND membership.faction_id IS NULL
  ) AS k26_null_faction_after;

-- Preview run. Change ROLLBACK to COMMIT after the grids look right.
ROLLBACK;

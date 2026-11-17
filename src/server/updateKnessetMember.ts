import type { SupabaseClient } from '@supabase/supabase-js'
import {
  MAX_MK_IMAGE_BYTES,
  MEMBER_EDIT_MIGRATION,
  MK_IMAGE_BUCKET,
  imageExtension,
  mergeManualFields,
  missingSchemaColumn,
  parseMemberEdit,
  type ParsedMemberEdit,
} from '@/lib/knessetMemberEdit'

type EditResult = { ok: true; imageUrl?: string } | { ok: false; error: string }

type PersonRow = {
  id: number
  full_name: string | null
  gender: string | null
  birth_date: string | null
  email: string | null
  image_url: string | null
  twitter_handle: string | null
  wikipedia_url: string | null
  manual_fields?: string[] | null
}

type MembershipRow = {
  id: number
  person_id: number
  knesset_id: number
  faction_id: number | null
}

function dateOnly(value: string | null | undefined): string | null {
  if (!value) {
    return null
  }
  return value.slice(0, 10)
}

function sameText(left: string | null, right: string | null): boolean {
  return (left ?? null) === (right ?? null)
}

export async function updateKnessetMemberWithClient(
  client: SupabaseClient,
  body: unknown,
): Promise<EditResult> {
  const parsed = parseMemberEdit(body)
  if (!parsed.ok) {
    return parsed
  }
  const input = parsed.value

  const { data: membershipRows, error: membershipError } = await client
    .from('knesset_memberships')
    .select('id, person_id, knesset_id, faction_id')
    .eq('id', input.membershipId)
    .limit(1)

  if (membershipError) {
    return { ok: false, error: membershipError.message }
  }
  const membership = membershipRows?.[0] as MembershipRow | undefined
  if (!membership) {
    return { ok: false, error: 'חברות הכנסת לא נמצאה' }
  }
  if (membership.person_id !== input.personId || membership.knesset_id !== input.knessetId) {
    return { ok: false, error: 'החברות לא תואמת את האדם או את הכנסת' }
  }

  if (input.factionId != null) {
    const { data: factionRows, error: factionError } = await client
      .from('knesset_factions')
      .select('id, knesset_id')
      .eq('id', input.factionId)
      .limit(1)
    if (factionError) {
      return { ok: false, error: factionError.message }
    }
    const faction = factionRows?.[0] as { id: number; knesset_id: number } | undefined
    if (!faction || faction.knesset_id !== input.knessetId) {
      return { ok: false, error: 'הסיעה לא שייכת לכנסת שנבחרה' }
    }
  }

  const { data: personRows, error: personError } = await client
    .from('people')
    .select(
      'id, full_name, gender, birth_date, email, image_url, twitter_handle, wikipedia_url, manual_fields',
    )
    .eq('id', input.personId)
    .limit(1)

  if (personError) {
    if (missingSchemaColumn(personError.message, 'manual_fields')) {
      return { ok: false, error: MEMBER_EDIT_MIGRATION }
    }
    return { ok: false, error: personError.message }
  }
  const person = personRows?.[0] as PersonRow | undefined
  if (!person) {
    return { ok: false, error: 'רשומת האדם לא נמצאה' }
  }

  const personPatch = personChanges(person, input)
  if (Object.keys(personPatch.fields).length > 0) {
    const { error } = await client
      .from('people')
      .update({
        ...personPatch.fields,
        manual_fields: personPatch.manualFields,
      })
      .eq('id', input.personId)
    if (error) {
      if (missingSchemaColumn(error.message, 'manual_fields')) {
        return { ok: false, error: MEMBER_EDIT_MIGRATION }
      }
      return { ok: false, error: error.message }
    }
  }

  if (membership.faction_id !== input.factionId) {
    const { error } = await client
      .from('knesset_memberships')
      .update({
        faction_id: input.factionId,
        faction_id_provisional: false,
        faction_id_manual: true,
      })
      .eq('id', input.membershipId)
      .eq('person_id', input.personId)
      .eq('knesset_id', input.knessetId)
    if (error) {
      if (missingSchemaColumn(error.message, 'faction_id_manual')) {
        return { ok: false, error: MEMBER_EDIT_MIGRATION }
      }
      return { ok: false, error: error.message }
    }
  }

  return { ok: true }
}

function personChanges(
  person: PersonRow,
  input: ParsedMemberEdit,
): { fields: Record<string, string | null>; manualFields: string[] } {
  const fields: Record<string, string | null> = {}
  const added: string[] = []

  const pairs: Array<[string, string | null, string | null]> = [
    ['full_name', person.full_name, input.fullName],
    ['gender', person.gender, input.gender],
    ['birth_date', dateOnly(person.birth_date), input.birthDate],
    ['email', person.email, input.email],
    ['image_url', person.image_url, input.imageUrl],
    ['twitter_handle', person.twitter_handle, input.twitterHandle],
    ['wikipedia_url', person.wikipedia_url, input.wikipediaUrl],
  ]
  for (const [column, current, next] of pairs) {
    if (!sameText(current, next)) {
      fields[column] = next
      added.push(column)
    }
  }

  return {
    fields,
    manualFields: mergeManualFields(person.manual_fields, added),
  }
}

export async function uploadMemberImageWithClient(
  client: SupabaseClient,
  personId: number,
  file: { bytes: Buffer; contentType: string },
): Promise<EditResult> {
  if (!Number.isInteger(personId) || personId < 1) {
    return { ok: false, error: 'מזהה אדם לא תקין' }
  }
  if (file.bytes.byteLength === 0 || file.bytes.byteLength > MAX_MK_IMAGE_BYTES) {
    return { ok: false, error: 'התמונה חייבת להיות עד 4MB' }
  }
  const extension = imageExtension(file.contentType)
  if (!extension) {
    return { ok: false, error: 'אפשר להעלות JPEG, PNG או WebP' }
  }

  const { data: personRows, error: personError } = await client
    .from('people')
    .select('id, manual_fields')
    .eq('id', personId)
    .limit(1)
  if (personError) {
    if (missingSchemaColumn(personError.message, 'manual_fields')) {
      return { ok: false, error: MEMBER_EDIT_MIGRATION }
    }
    return { ok: false, error: personError.message }
  }
  const person = personRows?.[0] as { id: number; manual_fields?: string[] | null } | undefined
  if (!person) {
    return { ok: false, error: 'רשומת האדם לא נמצאה' }
  }

  const path = `${personId}/${Date.now()}.${extension}`
  const { error: uploadError } = await client.storage
    .from(MK_IMAGE_BUCKET)
    .upload(path, file.bytes, {
      contentType: file.contentType === 'image/jpg' ? 'image/jpeg' : file.contentType,
      upsert: false,
    })
  if (uploadError) {
    const message = uploadError.message.toLowerCase()
    if (message.includes('bucket') || message.includes('not found')) {
      return { ok: false, error: MEMBER_EDIT_MIGRATION }
    }
    return { ok: false, error: uploadError.message }
  }

  const { data: publicUrl } = client.storage.from(MK_IMAGE_BUCKET).getPublicUrl(path)
  const imageUrl = publicUrl.publicUrl
  const { error: updateError } = await client
    .from('people')
    .update({
      image_url: imageUrl,
      manual_fields: mergeManualFields(person.manual_fields, ['image_url']),
    })
    .eq('id', personId)
  if (updateError) {
    return { ok: false, error: updateError.message }
  }
  return { ok: true, imageUrl }
}

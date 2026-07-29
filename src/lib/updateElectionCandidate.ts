import { isDev, getElectionsEditSecret } from './runtimeEnv'

import { supabase, supabaseConfigError } from './supabase'

export type ElectionCandidateEditInput = {
  candidateId: number
  personId: number
  partyId: number
  fullName: string
  description: string | null
  city: string | null
  imageUrl: string | null
  birthDate: string | null
  gender: string | null
  wikipediaUrl: string | null
  listPosition: number
  previousCity: string | null
  siblingPositions: Array<{ candidateId: number; listPosition: number }>
}

export type UpdateElectionCandidateResult =
  | { ok: true }
  | { ok: false; error: string }

function emptyToNull(value: string): string | null {
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

async function updateViaDevApi(
  input: ElectionCandidateEditInput,
): Promise<UpdateElectionCandidateResult> {
  const secret = getElectionsEditSecret()

  const response = await fetch('/api/elections/update-candidate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(secret ? { 'X-Elections-Edit-Secret': secret } : {}),
    },
    body: JSON.stringify(input),
  })

  const body = (await response.json()) as UpdateElectionCandidateResult
  if (!response.ok) {
    return body.ok === false
      ? body
      : { ok: false, error: 'שמירה נכשלה' }
  }

  return body
}

async function updateViaAnonClient(
  input: ElectionCandidateEditInput,
): Promise<UpdateElectionCandidateResult> {
  if (supabaseConfigError || !supabase) {
    return {
      ok: false,
      error: supabaseConfigError ?? 'Supabase client is not configured',
    }
  }

  const fullName = input.fullName.trim()
  if (!fullName) {
    return { ok: false, error: 'יש להזין שם מלא' }
  }

  if (!Number.isInteger(input.listPosition) || input.listPosition < 1) {
    return { ok: false, error: 'מיקום ברשימה חייב להיות מספר שלם חיובי' }
  }

  const positionTaken = input.siblingPositions.some(
    (sibling) =>
      sibling.candidateId !== input.candidateId &&
      sibling.listPosition === input.listPosition,
  )
  if (positionTaken) {
    return {
      ok: false,
      error: `מיקום ${input.listPosition} כבר תפוס ברשימת המפלגה`,
    }
  }

  const city = emptyToNull(input.city ?? '')
  const description = emptyToNull(input.description ?? '')
  const imageUrl = emptyToNull(input.imageUrl ?? '')
  const birthDate = emptyToNull(input.birthDate ?? '')
  const gender = emptyToNull(input.gender ?? '')
  const wikipediaUrl = emptyToNull(input.wikipediaUrl ?? '')
  const cityChanged = city !== (input.previousCity ?? null)

  const { data: peopleData, error: peopleError } = await supabase
    .from('people')
    .update({
      full_name: fullName,
      image_url: imageUrl,
      birth_date: birthDate,
      gender,
      wikipedia_url: wikipediaUrl,
    })
    .eq('id', input.personId)
    .select('id')

  if (peopleError) {
    return { ok: false, error: peopleError.message }
  }

  if (!peopleData?.length) {
    return {
      ok: false,
      error:
        'לא ניתן לעדכן את פרטי האדם — בדקו שהוגדרו הרשאות UPDATE ל-anon על טבלת people ב-Supabase',
    }
  }

  const candidateUpdate: Record<string, string | number | null> = {
    description,
    city,
    list_position: input.listPosition,
  }

  if (cityChanged) {
    candidateUpdate.latitude = null
    candidateUpdate.longitude = null
  }

  const { data: candidateData, error: candidateError } = await supabase
    .from('election_candidates')
    .update(candidateUpdate)
    .eq('id', input.candidateId)
    .select('id')

  if (candidateError) {
    const message = candidateError.message
    if (
      message.toLowerCase().includes('unique') ||
      message.toLowerCase().includes('duplicate')
    ) {
      return {
        ok: false,
        error: `מיקום ${input.listPosition} כבר תפוס ברשימת המפלגה`,
      }
    }
    return { ok: false, error: message }
  }

  if (!candidateData?.length) {
    return {
      ok: false,
      error:
        'לא ניתן לעדכן את המועמד — בדקו שהוגדרו הרשאות UPDATE ל-anon על טבלת election_candidates ב-Supabase',
    }
  }

  return { ok: true }
}

export async function updateElectionCandidate(
  input: ElectionCandidateEditInput,
): Promise<UpdateElectionCandidateResult> {
  if (isDev) {
    return updateViaDevApi(input)
  }

  return updateViaAnonClient(input)
}

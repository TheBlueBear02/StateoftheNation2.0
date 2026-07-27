import { supabase, supabaseConfigError } from './supabase'

export type ElectionPartyEditInput = {
  partyId: number
  name: string
  shortName: string | null
  color: string | null
  logoUrl: string | null
  ballotLetter: string | null
  description: string | null
}

export type UpdateElectionPartyResult =
  | { ok: true }
  | { ok: false; error: string }

function emptyToNull(value: string): string | null {
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

async function updateViaDevApi(
  input: ElectionPartyEditInput,
): Promise<UpdateElectionPartyResult> {
  const secret = import.meta.env.VITE_ELECTIONS_EDIT_SECRET as string | undefined

  const response = await fetch('/api/elections/update-party', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(secret ? { 'X-Elections-Edit-Secret': secret } : {}),
    },
    body: JSON.stringify(input),
  })

  const body = (await response.json()) as UpdateElectionPartyResult
  if (!response.ok) {
    return body.ok === false
      ? body
      : { ok: false, error: 'שמירה נכשלה' }
  }

  return body
}

async function updateViaAnonClient(
  input: ElectionPartyEditInput,
): Promise<UpdateElectionPartyResult> {
  if (supabaseConfigError || !supabase) {
    return {
      ok: false,
      error: supabaseConfigError ?? 'Supabase client is not configured',
    }
  }

  const name = input.name.trim()
  if (!name) {
    return { ok: false, error: 'יש להזין שם מפלגה' }
  }

  const { data, error } = await supabase
    .from('election_parties')
    .update({
      name,
      short_name: emptyToNull(input.shortName ?? ''),
      color: emptyToNull(input.color ?? ''),
      logo_url: emptyToNull(input.logoUrl ?? ''),
      ballot_letter: emptyToNull(input.ballotLetter ?? ''),
      description: emptyToNull(input.description ?? ''),
    })
    .eq('id', input.partyId)
    .select('id')

  if (error) {
    return { ok: false, error: error.message }
  }

  if (!data?.length) {
    return {
      ok: false,
      error:
        'לא ניתן לעדכן את המפלגה — בדקו שהוגדרו הרשאות UPDATE ל-anon על טבלת election_parties ב-Supabase',
    }
  }

  return { ok: true }
}

export async function updateElectionParty(
  input: ElectionPartyEditInput,
): Promise<UpdateElectionPartyResult> {
  if (import.meta.env.DEV) {
    return updateViaDevApi(input)
  }

  return updateViaAnonClient(input)
}

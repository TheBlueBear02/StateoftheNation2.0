import { getElectionsEditSecret } from './runtimeEnv'

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

export async function updateElectionParty(
  input: ElectionPartyEditInput,
): Promise<UpdateElectionPartyResult> {
  const secret = getElectionsEditSecret()

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

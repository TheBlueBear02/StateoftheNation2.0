import { getElectionsEditSecret } from './runtimeEnv'

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

export async function updateElectionCandidate(
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

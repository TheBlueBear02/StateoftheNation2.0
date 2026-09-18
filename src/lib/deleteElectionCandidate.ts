import { getElectionsEditSecret } from './runtimeEnv'

export type DeleteElectionCandidateInput = {
  candidateId: number
  partyId: number
}

export type DeleteElectionCandidateResult =
  | { ok: true }
  | { ok: false; error: string }

export async function deleteElectionCandidate(
  input: DeleteElectionCandidateInput,
): Promise<DeleteElectionCandidateResult> {
  const secret = getElectionsEditSecret()

  const response = await fetch('/api/elections/delete-candidate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(secret ? { 'X-Elections-Edit-Secret': secret } : {}),
    },
    body: JSON.stringify(input),
  })

  const body = (await response.json()) as DeleteElectionCandidateResult
  if (!response.ok) {
    return body.ok === false
      ? body
      : { ok: false, error: 'מחיקה נכשלה' }
  }

  return body
}

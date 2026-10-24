import { getElectionsEditSecret } from './runtimeEnv'

export type UnlinkElectionCandidatePersonInput = {
  candidateId: number
  partyId: number
  personId: number
}

export type UnlinkElectionCandidatePersonResult =
  | { ok: true; personId: number }
  | { ok: false; error: string }

export async function unlinkElectionCandidatePerson(
  input: UnlinkElectionCandidatePersonInput,
): Promise<UnlinkElectionCandidatePersonResult> {
  const secret = getElectionsEditSecret()

  const response = await fetch('/api/elections/unlink-candidate-person', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(secret ? { 'X-Elections-Edit-Secret': secret } : {}),
    },
    body: JSON.stringify(input),
  })

  const body = (await response.json()) as UnlinkElectionCandidatePersonResult
  if (!response.ok) {
    return body.ok === false
      ? body
      : { ok: false, error: 'ניתוק הקישור נכשל' }
  }

  return body
}

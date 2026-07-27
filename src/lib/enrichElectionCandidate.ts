export type CandidateEnrichmentUpdates = {
  fullName?: string
  description?: string
  city?: string
  imageUrl?: string
  birthDate?: string
  gender?: string
  wikipediaUrl?: string
  listPosition?: string
}

export type EnrichElectionCandidateResult =
  | {
      ok: true
      updates: CandidateEnrichmentUpdates
      filledFields: string[]
      message?: string
    }
  | { ok: false; error: string }

export async function enrichElectionCandidate(
  candidateId: number,
): Promise<EnrichElectionCandidateResult> {
  if (!import.meta.env.DEV) {
    return {
      ok: false,
      error: 'זמין רק בסביבת פיתוח (npm run dev)',
    }
  }

  const secret = import.meta.env.VITE_ELECTIONS_EDIT_SECRET as string | undefined

  const response = await fetch('/api/elections/enrich-candidate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(secret ? { 'X-Elections-Edit-Secret': secret } : {}),
    },
    body: JSON.stringify({ candidateId }),
  })

  const body = (await response.json()) as EnrichElectionCandidateResult
  if (!response.ok) {
    return body.ok === false
      ? body
      : { ok: false, error: 'הרצת pipeline נכשלה' }
  }

  return body
}

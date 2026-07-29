import { isDev, getElectionsEditSecret } from './runtimeEnv'

export type PipelineListFormat = 'txt' | 'csv'

export type PipelinePreviewCandidate = {
  listPosition: number
  name: string
  city: string | null
}

export type PipelineReviewItem = {
  rawId: number
  rawName: string
  listPosition: number
  bestMatch: string | null
  bestMatchId: number | null
  score: number | null
  action: string
}

type PipelineError = { ok: false; error: string }

function getEditHeaders(): Record<string, string> {
  const secret = getElectionsEditSecret()
  return {
    'Content-Type': 'application/json',
    ...(secret ? { 'X-Elections-Edit-Secret': secret } : {}),
  }
}

function devOnlyError(): PipelineError {
  return {
    ok: false,
    error: 'זמין רק בסביבת פיתוח (npm run dev)',
  }
}

async function parseResponse<T extends { ok: boolean }>(
  response: Response,
): Promise<T | PipelineError> {
  const body = (await response.json()) as T | PipelineError
  if (!response.ok && 'ok' in body && body.ok === false) {
    return body as PipelineError
  }
  if (!response.ok) {
    return { ok: false, error: 'בקשה נכשלה' }
  }
  return body
}

export async function previewPartyPipelineList(input: {
  partyId: number
  text: string
  format?: PipelineListFormat
}): Promise<
  | { ok: true; candidates: PipelinePreviewCandidate[]; count: number }
  | PipelineError
> {
  if (!isDev) {
    return devOnlyError()
  }

  const response = await fetch('/api/elections/pipeline/preview', {
    method: 'POST',
    headers: getEditHeaders(),
    body: JSON.stringify(input),
  })

  return parseResponse(response)
}

export async function insertPartyPipelineList(input: {
  partyId: number
  text: string
  format?: PipelineListFormat
}): Promise<
  | {
      ok: true
      inserted: number
      replaced: number
      alreadyProcessed: number
    }
  | PipelineError
> {
  if (!isDev) {
    return devOnlyError()
  }

  const response = await fetch('/api/elections/pipeline/insert', {
    method: 'POST',
    headers: getEditHeaders(),
    body: JSON.stringify(input),
  })

  return parseResponse(response)
}

export async function runPartyPipelineStage(stage: number): Promise<
  | { ok: true; message?: string; reviewCount?: number }
  | PipelineError
> {
  if (!isDev) {
    return devOnlyError()
  }

  const response = await fetch('/api/elections/pipeline/stage', {
    method: 'POST',
    headers: getEditHeaders(),
    body: JSON.stringify({ stage }),
  })

  return parseResponse(response)
}

export async function fetchPartyReviewQueue(partyId: number): Promise<
  | { ok: true; items: PipelineReviewItem[] }
  | PipelineError
> {
  if (!isDev) {
    return devOnlyError()
  }

  const response = await fetch(
    `/api/elections/pipeline/review-queue?partyId=${partyId}`,
    {
      method: 'GET',
      headers: getEditHeaders(),
    },
  )

  return parseResponse(response)
}

export async function resolvePartyReviewQueue(input: {
  partyId: number
  actions: Array<{
    rawId: number
    action: 'approve' | 'new'
    correctPersonId?: number
  }>
}): Promise<
  | { ok: true; updated: number; remaining: number; message?: string }
  | PipelineError
> {
  if (!isDev) {
    return devOnlyError()
  }

  const response = await fetch('/api/elections/pipeline/resolve-review', {
    method: 'POST',
    headers: getEditHeaders(),
    body: JSON.stringify(input),
  })

  return parseResponse(response)
}

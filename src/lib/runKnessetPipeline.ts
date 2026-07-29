import { isDev, getKnessetEditSecret } from './runtimeEnv'

type PipelineError = { ok: false; error: string }

export type KnessetTableCounts = {
  knessets: number
  people: number
  knesset_factions: number
  offices: number
  governments: number
  knesset_memberships: number
  minister_appointments: number
}

export type PipelineUpsertStats = {
  table?: string
  upserted: number
  inserted: number
  updated: number
  unmatched?: number
}

export type PipelineStageSummary = {
  stage?: number
  label: string
  entries?: PipelineUpsertStats[]
  note?: string
  upserted: number
  inserted: number
  updated: number
}

export type PipelineRunSummary = {
  stages: PipelineStageSummary[]
  totals: {
    upserted: number
    inserted: number
    updated: number
  }
}

export type KnessetStatusResult =
  | {
      ok: true
      tables: KnessetTableCounts
      membershipsMissingFaction: number
      lastPipelineRunAt: string | null
      lastPipelineAction: string | null
      lastPipelineStage: number | null
      lastRunSummary: PipelineRunSummary | null
    }
  | PipelineError

export type KnessetStageResult =
  | {
      ok: true
      stage: number
      label: string
      elapsedSeconds: number
      message: string
      summary: PipelineRunSummary
    }
  | PipelineError

export type KnessetFullSyncResult =
  | {
      ok: true
      elapsedSeconds: number
      message: string
      lastPipelineRunAt: string
      summary: PipelineRunSummary
    }
  | PipelineError

export type FactionLinkPreviewItem = {
  membershipId: number
  knessetNumber: number
  personName: string
  currentFactionId: number | null
  targetFactionId: number
  factionName: string
  referenceDate: string
}

export type FactionLinkPreviewResult =
  | {
      ok: true
      count: number
      byKnesset: Record<number, number>
      items: FactionLinkPreviewItem[]
    }
  | PipelineError

export type FactionLinkApplyResult =
  | {
      ok: true
      applied: number
      lastPipelineRunAt: string
      summary: PipelineRunSummary
    }
  | PipelineError

export type KmImagesResult =
  | {
      ok: true
      matched: string[]
      unmatched: string[]
      matchedCount: number
      unmatchedCount: number
      lastPipelineRunAt: string
      summary: PipelineRunSummary
    }
  | PipelineError

function getEditHeaders(): Record<string, string> {
  const secret = getKnessetEditSecret()
  return {
    'Content-Type': 'application/json',
    ...(secret ? { 'X-Knesset-Edit-Secret': secret } : {}),
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

export async function fetchKnessetStatus(): Promise<KnessetStatusResult> {
  if (!isDev) {
    return devOnlyError()
  }

  const response = await fetch('/api/knesset/status', {
    method: 'GET',
    headers: getEditHeaders(),
  })

  return parseResponse(response)
}

export async function runKnessetStage(stage: number): Promise<KnessetStageResult> {
  if (!isDev) {
    return devOnlyError()
  }

  const response = await fetch('/api/knesset/pipeline/stage', {
    method: 'POST',
    headers: getEditHeaders(),
    body: JSON.stringify({ stage }),
  })

  return parseResponse(response)
}

export async function runKnessetFullSync(): Promise<KnessetFullSyncResult> {
  if (!isDev) {
    return devOnlyError()
  }

  const response = await fetch('/api/knesset/pipeline/sync-full', {
    method: 'POST',
    headers: getEditHeaders(),
  })

  return parseResponse(response)
}

export async function previewFactionLinks(): Promise<FactionLinkPreviewResult> {
  if (!isDev) {
    return devOnlyError()
  }

  const response = await fetch('/api/knesset/faction-preview', {
    method: 'POST',
    headers: getEditHeaders(),
  })

  return parseResponse(response)
}

export async function applyFactionLinks(): Promise<FactionLinkApplyResult> {
  if (!isDev) {
    return devOnlyError()
  }

  const response = await fetch('/api/knesset/faction-apply', {
    method: 'POST',
    headers: getEditHeaders(),
  })

  return parseResponse(response)
}

export async function runKmImages(): Promise<KmImagesResult> {
  if (!isDev) {
    return devOnlyError()
  }

  const response = await fetch('/api/knesset/images', {
    method: 'POST',
    headers: getEditHeaders(),
  })

  return parseResponse(response)
}

export const KNESSET_STAGE_LABELS: Record<number, string> = {
  1: 'כנסות',
  2: 'אנשים',
  3: 'סיעות',
  4: 'משרדים',
  5: 'ממשלות',
  6: 'חברויות ומינויים',
}

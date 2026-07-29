import { isDev, getElectionsEditSecret } from './runtimeEnv'

type PipelineError = { ok: false; error: string }

export type PollsTableCounts = {
  polls: number
  poll_results: number
  raw_poll_rows: number
  poll_aggregates: number
}

export type PollsSyncResource = {
  resource: string
  lastRevid: number | null
  lastRunAt: string | null
  lastSuccessAt: string | null
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

export type PollsStatusResult =
  | {
      ok: true
      tables: PollsTableCounts
      pendingRawRows: number
      reviewQueueCount: number
      syncResources: PollsSyncResource[]
      dbLastSuccessAt: string | null
      lastPipelineRunAt: string | null
      lastPipelineAction: string | null
      lastPipelineStage: number | null
      lastRunSummary: PipelineRunSummary | null
    }
  | PipelineError

export type PollsStageResult =
  | {
      ok: true
      stage: number
      label: string
      elapsedSeconds: number
      message: string
      summary: PipelineRunSummary
    }
  | PipelineError

export type PollsFullSyncResult =
  | {
      ok: true
      elapsedSeconds: number
      message: string
      lastPipelineRunAt: string
      summary: PipelineRunSummary
    }
  | PipelineError

export type PollsRunOptions = {
  backfill?: boolean
  force?: boolean
}

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

export async function fetchPollsStatus(): Promise<PollsStatusResult> {
  if (!isDev) {
    return devOnlyError()
  }

  const response = await fetch('/api/polls/status', {
    method: 'GET',
    headers: getEditHeaders(),
  })

  return parseResponse(response)
}

export async function runPollsStage(
  stage: number,
  options: PollsRunOptions = {},
): Promise<PollsStageResult> {
  if (!isDev) {
    return devOnlyError()
  }

  const response = await fetch('/api/polls/pipeline/stage', {
    method: 'POST',
    headers: getEditHeaders(),
    body: JSON.stringify({
      stage,
      backfill: Boolean(options.backfill),
      force: Boolean(options.force),
    }),
  })

  return parseResponse(response)
}

export async function runPollsFullSync(
  options: PollsRunOptions = {},
): Promise<PollsFullSyncResult> {
  if (!isDev) {
    return devOnlyError()
  }

  const response = await fetch('/api/polls/pipeline/sync-full', {
    method: 'POST',
    headers: getEditHeaders(),
    body: JSON.stringify({
      backfill: Boolean(options.backfill),
      force: Boolean(options.force),
    }),
  })

  return parseResponse(response)
}

export const POLLS_STAGE_LABELS: Record<number, string> = {
  1: 'משיכת ויקיפדיה',
  2: 'פירוק טבלאות',
  3: 'מיפוי מפלגות',
  4: 'נרמול סקרים',
  5: 'חישוב ממוצעים',
  6: 'ולידציה',
}

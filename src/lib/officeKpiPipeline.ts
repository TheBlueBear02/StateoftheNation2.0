import { getPipelineEditSecret } from './runtimeEnv'

const secretHeaders = (): HeadersInit => {
  const secret = getPipelineEditSecret()
  return secret ? { 'X-Pipeline-Edit-Secret': secret } : {}
}

export type OfficeKpiRunSummary = {
  date?: string
  due?: number
  overdue?: number
  found?: number[]
  new?: number
  revisions?: number
  published?: number
  pending?: number
  rejected?: number
  errors?: Record<string, string>
}

export type OfficeKpiPipelineRun = {
  id: number
  pipeline: string
  action: string
  status: 'success' | 'error' | 'warning'
  started_at: string
  finished_at: string
  message: string | null
  error: string | null
  summary: OfficeKpiRunSummary | null
  source: string
}

export type OfficeKpiStatusCounts = {
  pending: number
  approved: number
  rejected: number
  published: number
  superseded: number
}

export type OfficeKpiCandidate = {
  id: number
  indexId: number
  indexName: string
  officeName: string
  recordedAt: string
  label: string
  value: number
  previousValue: number | null
  rawValue: string | null
  method: string
  confidence: number
  sourceUrl: string | null
  evidence: Record<string, unknown> | null
  flags: string[]
  kind: string
  status: string
  reviewedBy: string | null
  reviewedAt: string | null
  createdAt: string
  needsApproval: boolean
}

export type OfficeKpiFreshnessItem = {
  indexId: number
  indexName: string
  officeName: string
  targetPeriod: string
  windowStart: string | null
  windowEnd: string | null
  lastCheckedAt: string | null
  attempts: number
  status: string
  lastError: string | null
}

export type OfficeKpiSiteUpdate = {
  id: number
  event_type: string
  headline: string
  href: string
  payload: Record<string, unknown> | null
  dedupe_key: string | null
  pipeline_run_id: number | null
  occurred_at: string
}

export type OfficeKpiStatusResult =
  | {
      ok: true
      pipeline: string
      lastRun: OfficeKpiPipelineRun | null
      recentRuns: OfficeKpiPipelineRun[]
      statusCounts: OfficeKpiStatusCounts
      overdueChecks: number
      lastSiteUpdate: OfficeKpiSiteUpdate | null
      recentSiteUpdates: OfficeKpiSiteUpdate[]
    }
  | { ok: false; error: string }

async function parseJson<T>(response: Response): Promise<T> {
  return (await response.json()) as T
}

export async function fetchOfficeKpiStatus(): Promise<OfficeKpiStatusResult> {
  try {
    const response = await fetch('/api/office-kpis/status', {
      headers: { ...secretHeaders() },
      cache: 'no-store',
    })
    const body = await parseJson<OfficeKpiStatusResult>(response)
    if (!response.ok) {
      return body.ok === false
        ? body
        : { ok: false, error: 'טעינת סטטוס נכשלה' }
    }
    return body
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'טעינת סטטוס נכשלה',
    }
  }
}

export async function fetchOfficeKpiCandidates(
  status: string = 'all',
): Promise<
  { ok: true; candidates: OfficeKpiCandidate[] } | { ok: false; error: string }
> {
  try {
    const params = new URLSearchParams({ status, limit: '150' })
    const response = await fetch(`/api/office-kpis/candidates?${params}`, {
      headers: { ...secretHeaders() },
      cache: 'no-store',
    })
    const body = await parseJson<
      | { ok: true; candidates: OfficeKpiCandidate[] }
      | { ok: false; error: string }
    >(response)
    if (!response.ok) {
      return body.ok === false
        ? body
        : { ok: false, error: 'טעינת מועמדים נכשלה' }
    }
    return body
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'טעינת מועמדים נכשלה',
    }
  }
}

export async function fetchOfficeKpiFreshness(): Promise<
  | { ok: true; items: OfficeKpiFreshnessItem[] }
  | { ok: false; error: string }
> {
  try {
    const response = await fetch('/api/office-kpis/freshness', {
      headers: { ...secretHeaders() },
      cache: 'no-store',
    })
    const body = await parseJson<
      | { ok: true; items: OfficeKpiFreshnessItem[] }
      | { ok: false; error: string }
    >(response)
    if (!response.ok) {
      return body.ok === false
        ? body
        : { ok: false, error: 'טעינת רעננות נכשלה' }
    }
    return body
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'טעינת רעננות נכשלה',
    }
  }
}

export async function reviewOfficeKpiCandidate(input: {
  candidateId: number
  action: 'approve' | 'reject'
  value?: number
}): Promise<{ ok: true; status: string } | { ok: false; error: string }> {
  try {
    const response = await fetch('/api/office-kpis/review', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...secretHeaders(),
      },
      body: JSON.stringify(input),
    })
    const body = await parseJson<
      | { ok: true; status: string }
      | { ok: false; error: string }
    >(response)
    if (!response.ok) {
      return body.ok === false ? body : { ok: false, error: 'הפעולה נכשלה' }
    }
    return body
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'הפעולה נכשלה',
    }
  }
}

export async function saveOfficeKpiSiteUpdate(
  id: number,
  headline: string,
): Promise<
  | { ok: true; siteUpdate: OfficeKpiSiteUpdate }
  | { ok: false; error: string }
> {
  try {
    const response = await fetch('/api/office-kpis/site-update', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...secretHeaders(),
      },
      body: JSON.stringify({ id, headline }),
    })
    const body = await parseJson<
      | { ok: true; siteUpdate: OfficeKpiSiteUpdate }
      | { ok: false; error: string }
    >(response)
    if (!response.ok) {
      return body.ok === false
        ? body
        : { ok: false, error: 'שמירת הכותרת נכשלה' }
    }
    return body
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'שמירת הכותרת נכשלה',
    }
  }
}

export const CANDIDATE_STATUS_HE: Record<string, string> = {
  pending: 'ממתין לאישור',
  approved: 'אושר (ממתין לפרסום)',
  rejected: 'נדחה',
  published: 'פורסם',
  superseded: 'הוחלף',
}

export const CANDIDATE_KIND_HE: Record<string, string> = {
  new: 'חדש',
  revision: 'תיקון',
  same: 'זהה',
}

export const METHOD_HE: Record<string, string> = {
  api: 'ממשק רשמי',
  api_unofficial: 'ממשק לא רשמי',
  table: 'טבלה / קובץ',
  llm: 'חילוץ ממודל',
  manual: 'הזנה ידנית',
}

export const CHECK_STATUS_HE: Record<string, string> = {
  waiting: 'ממתין',
  checking: 'בבדיקה',
  found: 'נמצא',
  overdue: 'באיחור',
  error: 'שגיאה',
}

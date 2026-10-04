import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { NextRequest } from 'next/server'
import { OFFICE_KPI_REGISTRY } from '@/content/officeKpiRegistry'
import {
  isCurrentThroughExpected,
  officesMatch,
  type Frequency,
} from '@/lib/officeKpiPeriods'
import {
  assertPipelineEnabled,
  getServiceEnv,
  jsonError,
  jsonOk,
  requirePipelineSecret,
} from '@/server/apiCommon'

const OFFICE_DISPLAY_ORDER = ['ביטחון לאומי', 'תחבורה', 'אוצר', 'חינוך'] as const

export const maxDuration = 60

const PIPELINE_ID = 'office-kpis'
const CANDIDATE_STATUSES = [
  'pending',
  'approved',
  'rejected',
  'published',
  'superseded',
] as const

type CandidateStatus = (typeof CANDIDATE_STATUSES)[number]

function getAdminClient() {
  const { SUPABASE_URL, SUPABASE_SERVICE_KEY } = getServiceEnv()
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return null
  }
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
}

type RouteContext = { params: Promise<{ path: string[] }> }

type CandidateRow = {
  id: number
  index_id: number
  recorded_at: string
  label: string
  value: number
  raw_value: string | null
  method: string
  confidence: number
  source_url: string | null
  evidence: Record<string, unknown> | null
  validation: Record<string, unknown> | null
  kind: string
  previous_value: number | null
  status: CandidateStatus
  reviewed_by: string | null
  reviewed_at: string | null
  created_at: string
}

async function loadIndexMap(
  client: SupabaseClient,
  indexIds: number[],
): Promise<Map<number, { name: string; officeName: string }>> {
  const unique = [...new Set(indexIds)]
  const map = new Map<number, { name: string; officeName: string }>()
  if (unique.length === 0) return map

  const { data: indexes, error } = await client
    .from('indexes')
    .select('id, name, office_id')
    .in('id', unique)

  if (error) throw new Error(error.message)

  const officeIds = [
    ...new Set((indexes ?? []).map((row) => row.office_id as number)),
  ]
  const officeNames = new Map<number, string>()
  if (officeIds.length > 0) {
    const { data: offices, error: officeError } = await client
      .from('offices')
      .select('id, name, knesset_category_name')
      .in('id', officeIds)
    if (officeError) throw new Error(officeError.message)
    for (const office of offices ?? []) {
      officeNames.set(
        office.id as number,
        (office.knesset_category_name as string | null) ||
          (office.name as string | null) ||
          '',
      )
    }
  }

  for (const row of indexes ?? []) {
    map.set(row.id as number, {
      name: row.name as string,
      officeName: officeNames.get(row.office_id as number) ?? '',
    })
  }
  return map
}

async function countByStatus(client: SupabaseClient) {
  const counts: Record<string, number> = {}
  for (const status of CANDIDATE_STATUSES) {
    const { count, error } = await client
      .from('index_data_candidates')
      .select('id', { count: 'exact', head: true })
      .eq('status', status)
    if (error) throw new Error(error.message)
    counts[status] = count ?? 0
  }
  return counts
}

async function handleStatus(client: SupabaseClient) {
  const [{ data: runs, error: runsError }, statusCounts, siteUpdatesResult] =
    await Promise.all([
      client
        .from('pipeline_runs')
        .select(
          'id, pipeline, action, status, started_at, finished_at, message, error, summary, source',
        )
        .eq('pipeline', PIPELINE_ID)
        .order('finished_at', { ascending: false })
        .limit(20),
      countByStatus(client),
      client
        .from('site_updates')
        .select(
          'id, event_type, headline, href, payload, dedupe_key, pipeline_run_id, occurred_at',
        )
        .eq('event_type', PIPELINE_ID)
        .order('occurred_at', { ascending: false })
        .limit(20),
    ])

  if (runsError) return jsonError(runsError.message, 500)

  // site_updates may be missing on a fresh DB — don't fail the whole status page
  const siteUpdates = siteUpdatesResult.error ? [] : (siteUpdatesResult.data ?? [])
  if (siteUpdatesResult.error) {
    console.warn('office-kpis status: site_updates', siteUpdatesResult.error.message)
  }

  const { count: overdueCount, error: overdueError } = await client
    .from('kpi_check_state')
    .select('index_id', { count: 'exact', head: true })
    .eq('status', 'overdue')

  if (overdueError) return jsonError(overdueError.message, 500)

  const lastRun = runs?.[0] ?? null
  const lastRunId = lastRun?.id as number | undefined
  const lastRunDate =
    lastRun?.summary &&
    typeof lastRun.summary === 'object' &&
    lastRun.summary !== null &&
    'date' in lastRun.summary
      ? String((lastRun.summary as { date?: unknown }).date ?? '')
      : ''

  const lastSiteUpdate =
    siteUpdates.find(
      (u) =>
        (lastRunId != null && u.pipeline_run_id === lastRunId) ||
        (lastRunDate && u.dedupe_key === `${PIPELINE_ID}:${lastRunDate}`),
    ) ??
    siteUpdates[0] ??
    null

  return jsonOk({
    ok: true,
    pipeline: PIPELINE_ID,
    lastRun,
    recentRuns: runs ?? [],
    statusCounts,
    overdueChecks: overdueCount ?? 0,
    lastSiteUpdate,
    recentSiteUpdates: siteUpdates,
  })
}

async function handleSaveSiteUpdate(
  request: NextRequest,
  client: SupabaseClient,
) {
  const body = (await request.json()) as {
    id?: number
    headline?: string
  }
  const updateId = Number(body.id)
  const headline = typeof body.headline === 'string' ? body.headline.trim() : ''

  if (!Number.isInteger(updateId) || updateId < 1) {
    return jsonError('מזהה עדכון לא תקין', 400)
  }
  if (!headline) {
    return jsonError('חסרה כותרת', 400)
  }

  const { data, error } = await client
    .from('site_updates')
    .update({ headline })
    .eq('id', updateId)
    .eq('event_type', PIPELINE_ID)
    .select(
      'id, event_type, headline, href, payload, dedupe_key, pipeline_run_id, occurred_at',
    )
    .maybeSingle()

  if (error) return jsonError(error.message, 500)
  if (!data) return jsonError('עדכון לא נמצא', 404)

  return jsonOk({ ok: true, siteUpdate: data })
}

async function handleCandidates(request: NextRequest, client: SupabaseClient) {
  const url = new URL(request.url)
  const statusParam = url.searchParams.get('status')
  const limit = Math.min(
    200,
    Math.max(1, Number(url.searchParams.get('limit') || 100)),
  )

  let query = client
    .from('index_data_candidates')
    .select(
      'id, index_id, recorded_at, label, value, raw_value, method, confidence, source_url, evidence, validation, kind, previous_value, status, reviewed_by, reviewed_at, created_at',
    )
    .order('created_at', { ascending: false })
    .limit(limit)

  if (statusParam && statusParam !== 'all') {
    if (!(CANDIDATE_STATUSES as readonly string[]).includes(statusParam)) {
      return jsonError('סטטוס לא תקין', 400)
    }
    query = query.eq('status', statusParam)
  }

  const { data, error } = await query
  if (error) return jsonError(error.message, 500)

  const rows = (data ?? []) as CandidateRow[]
  const indexMap = await loadIndexMap(
    client,
    rows.map((r) => r.index_id),
  )

  const candidates = rows.map((row) => {
    const meta = indexMap.get(row.index_id)
    const flags =
      Array.isArray(row.validation?.flags)
        ? (row.validation!.flags as string[])
        : []
    return {
      id: row.id,
      indexId: row.index_id,
      indexName: meta?.name ?? `מדד ${row.index_id}`,
      officeName: meta?.officeName ?? '',
      recordedAt: row.recorded_at,
      label: row.label,
      value: Number(row.value),
      previousValue:
        row.previous_value === null || row.previous_value === undefined
          ? null
          : Number(row.previous_value),
      rawValue: row.raw_value,
      method: row.method,
      confidence: row.confidence,
      sourceUrl: row.source_url,
      evidence: row.evidence,
      flags,
      kind: row.kind,
      status: row.status,
      reviewedBy: row.reviewed_by,
      reviewedAt: row.reviewed_at,
      createdAt: row.created_at,
      needsApproval: row.status === 'pending' || row.status === 'approved',
    }
  })

  return jsonOk({ ok: true, candidates })
}

async function handleFreshness(client: SupabaseClient) {
  const { data, error } = await client
    .from('kpi_check_state')
    .select(
      'index_id, target_period, window_start, window_end, last_checked_at, attempts, status, last_error',
    )
    .order('status', { ascending: true })
    .order('target_period', { ascending: false })
    .limit(200)

  if (error) return jsonError(error.message, 500)

  const rows = data ?? []
  const indexMap = await loadIndexMap(
    client,
    rows.map((r) => r.index_id as number),
  )

  const items = rows.map((row) => {
    const meta = indexMap.get(row.index_id as number)
    return {
      indexId: row.index_id,
      indexName: meta?.name ?? `מדד ${row.index_id}`,
      officeName: meta?.officeName ?? '',
      targetPeriod: row.target_period,
      windowStart: row.window_start,
      windowEnd: row.window_end,
      lastCheckedAt: row.last_checked_at,
      attempts: row.attempts,
      status: row.status,
      lastError: row.last_error,
    }
  })

  return jsonOk({ ok: true, items })
}

async function handleBoard(client: SupabaseClient) {
  const { data: offices, error: officeError } = await client
    .from('offices')
    .select('id, name, knesset_category_name, is_shown')
    .eq('is_shown', true)
  if (officeError) return jsonError(officeError.message, 500)

  const officeRows = offices ?? []
  const officeIds = officeRows.map((o) => o.id as number)
  if (officeIds.length === 0) {
    return jsonOk({ ok: true, asOf: new Date().toISOString(), offices: [] })
  }

  const { data: indexes, error: indexError } = await client
    .from('indexes')
    .select('id, office_id, name, is_kpi, is_shown')
    .in('office_id', officeIds)
    .eq('is_shown', true)
  if (indexError) return jsonError(indexError.message, 500)

  const indexRows = indexes ?? []
  const indexIds = indexRows.map((i) => i.id as number)

  const latestByIndex = new Map<
    number,
    { recordedAt: string; label: string; value: number }
  >()
  if (indexIds.length > 0) {
    // Newest point per index — fetch descending and keep first hit.
    const { data: points, error: pointsError } = await client
      .from('index_data')
      .select('index_id, recorded_at, label, value')
      .in('index_id', indexIds)
      .order('recorded_at', { ascending: false })
      .limit(5000)
    if (pointsError) return jsonError(pointsError.message, 500)
    for (const row of points ?? []) {
      const id = row.index_id as number
      if (latestByIndex.has(id)) continue
      latestByIndex.set(id, {
        recordedAt: String(row.recorded_at),
        label: String(row.label),
        value: Number(row.value),
      })
    }
  }

  const officeNameById = new Map<number, string>()
  for (const o of officeRows) {
    officeNameById.set(o.id as number, String(o.name))
  }

  const today = new Date()
  type BoardIndex = {
    indexId: number
    registryKey: number | null
    name: string
    kind: 'kpi' | 'policy'
    frequency: Frequency | null
    adapterFamily: string | null
    tier: string | null
    automated: boolean
    upToDate: boolean
    latestLabel: string | null
    latestRecordedAt: string | null
    targetPeriod: string | null
    windowEnd: string | null
  }

  const byOffice = new Map<
    number,
    { officeId: number; officeName: string; indexes: BoardIndex[] }
  >()

  for (const idx of indexRows) {
    const officeId = idx.office_id as number
    const officeName = officeNameById.get(officeId) ?? ''
    const registry = OFFICE_KPI_REGISTRY.find(
      (e) => e.name === idx.name && officesMatch(e.office, officeName),
    )
    const latest = latestByIndex.get(idx.id as number) ?? null
    const frequency = (registry?.frequency ?? null) as Frequency | null
    let upToDate = false
    let targetPeriod: string | null = null
    let windowEnd: string | null = null
    if (registry && latest && frequency) {
      const status = isCurrentThroughExpected(
        latest.recordedAt.slice(0, 10),
        frequency,
        registry.release,
        today,
      )
      upToDate = status.upToDate
      targetPeriod = status.targetPeriod
      windowEnd = status.windowEnd
    } else if (!latest) {
      upToDate = false
    } else if (!registry) {
      // No registry release window — treat as stale unknown → red.
      upToDate = false
    }

    const item: BoardIndex = {
      indexId: idx.id as number,
      registryKey: registry?.key ?? null,
      name: String(idx.name),
      kind: idx.is_kpi ? 'kpi' : 'policy',
      frequency,
      adapterFamily: registry?.adapterFamily ?? null,
      tier: registry?.tier ?? null,
      automated: Boolean(registry?.automated),
      upToDate,
      latestLabel: latest?.label ?? null,
      latestRecordedAt: latest?.recordedAt ?? null,
      targetPeriod,
      windowEnd,
    }

    const bucket = byOffice.get(officeId) ?? {
      officeId,
      officeName,
      indexes: [],
    }
    bucket.indexes.push(item)
    byOffice.set(officeId, bucket)
  }

  const rank = (name: string) => {
    const idx = OFFICE_DISPLAY_ORDER.findIndex((fragment) =>
      name.includes(fragment),
    )
    return idx === -1 ? 999 : idx
  }

  const officesOut = [...byOffice.values()]
    .map((o) => ({
      ...o,
      indexes: o.indexes.sort((a, b) => {
        if (a.kind !== b.kind) return a.kind === 'kpi' ? -1 : 1
        return a.name.localeCompare(b.name, 'he')
      }),
    }))
    .sort((a, b) => {
      const ra = rank(a.officeName)
      const rb = rank(b.officeName)
      if (ra !== rb) return ra - rb
      return a.officeName.localeCompare(b.officeName, 'he')
    })

  const totals = {
    indexes: officesOut.reduce((n, o) => n + o.indexes.length, 0),
    upToDate: officesOut.reduce(
      (n, o) => n + o.indexes.filter((i) => i.upToDate).length,
      0,
    ),
    automated: officesOut.reduce(
      (n, o) => n + o.indexes.filter((i) => i.automated).length,
      0,
    ),
  }

  return jsonOk({
    ok: true,
    asOf: today.toISOString(),
    totals,
    offices: officesOut,
  })
}

async function publishCandidate(
  client: SupabaseClient,
  candidate: CandidateRow,
  value: number,
) {
  const { error: upsertError } = await client.from('index_data').upsert(
    {
      index_id: candidate.index_id,
      recorded_at: candidate.recorded_at,
      label: candidate.label,
      value,
    },
    { onConflict: 'index_id,recorded_at' },
  )
  if (upsertError) throw new Error(upsertError.message)

  const now = new Date().toISOString()
  const { error: updateError } = await client
    .from('index_data_candidates')
    .update({
      status: 'published',
      value,
      reviewed_by: 'dashboard-edit',
      reviewed_at: now,
    })
    .eq('id', candidate.id)
  if (updateError) throw new Error(updateError.message)

  await client
    .from('index_data_candidates')
    .update({ status: 'superseded' })
    .eq('index_id', candidate.index_id)
    .eq('recorded_at', candidate.recorded_at)
    .eq('status', 'pending')
    .neq('id', candidate.id)
}

async function handleReview(request: NextRequest, client: SupabaseClient) {
  const body = (await request.json()) as {
    candidateId?: number
    action?: 'approve' | 'reject'
    value?: number
  }

  const candidateId = Number(body.candidateId)
  if (!Number.isInteger(candidateId) || candidateId < 1) {
    return jsonError('מזהה מועמד לא תקין', 400)
  }
  if (body.action !== 'approve' && body.action !== 'reject') {
    return jsonError('פעולה לא תקינה', 400)
  }

  const { data, error } = await client
    .from('index_data_candidates')
    .select(
      'id, index_id, recorded_at, label, value, raw_value, method, confidence, source_url, evidence, validation, kind, previous_value, status, reviewed_by, reviewed_at, created_at',
    )
    .eq('id', candidateId)
    .maybeSingle()

  if (error) return jsonError(error.message, 500)
  if (!data) return jsonError('מועמד לא נמצא', 404)

  const candidate = data as CandidateRow
  if (candidate.status === 'published' || candidate.status === 'superseded') {
    return jsonError('לא ניתן לשנות מועמד שכבר פורסם או הוחלף', 409)
  }

  if (body.action === 'reject') {
    const { error: rejectError } = await client
      .from('index_data_candidates')
      .update({
        status: 'rejected',
        reviewed_by: 'dashboard-edit',
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', candidateId)
    if (rejectError) return jsonError(rejectError.message, 500)
    return jsonOk({ ok: true, status: 'rejected' })
  }

  const nextValue =
    body.value === undefined || body.value === null
      ? Number(candidate.value)
      : Number(body.value)
  if (!Number.isFinite(nextValue)) {
    return jsonError('ערך לא תקין', 400)
  }

  try {
    await publishCandidate(client, candidate, nextValue)
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : 'פרסום נכשל', 500)
  }

  // Homepage news strip — LLM values only land here after approve.
  try {
    const meta = (await loadIndexMap(client, [candidate.index_id])).get(
      candidate.index_id,
    )
    const indexName = meta?.name ?? `מדד ${candidate.index_id}`
    const dedupeKey = `${PIPELINE_ID}:publish:${candidate.id}:${candidate.recorded_at}`
    const headline = `דשבורד הממשלה עודכן — ${indexName}`
    await client.from('site_updates').upsert(
      {
        event_type: PIPELINE_ID,
        headline,
        href: '/government/dashboard',
        payload: {
          pipeline: PIPELINE_ID,
          page: 'דשבורד הממשלה',
          href: '/government/dashboard',
          updated_indexes: [indexName],
          published: 1,
        },
        dedupe_key: dedupeKey,
        occurred_at: new Date().toISOString(),
      },
      { onConflict: 'dedupe_key' },
    )
  } catch (err) {
    console.warn('office-kpis review: site_updates emit failed', err)
  }

  return jsonOk({ ok: true, status: 'published', value: nextValue })
}

export async function GET(request: NextRequest, context: RouteContext) {
  const gated = assertPipelineEnabled()
  if (gated) return gated

  const auth = requirePipelineSecret(request)
  if (auth.error) return auth.error

  const client = getAdminClient()
  if (!client) {
    return jsonError('חסר SUPABASE_SERVICE_KEY או SUPABASE_URL', 503)
  }

  const { path: segments } = await context.params
  const route = segments.join('/')

  try {
    if (route === 'status') return await handleStatus(client)
    if (route === 'candidates') return await handleCandidates(request, client)
    if (route === 'freshness') return await handleFreshness(client)
    if (route === 'board') return await handleBoard(client)
    return jsonError('נתיב לא נמצא', 404)
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : 'שגיאה', 500)
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  const gated = assertPipelineEnabled()
  if (gated) return gated

  const auth = requirePipelineSecret(request)
  if (auth.error) return auth.error

  const client = getAdminClient()
  if (!client) {
    return jsonError('חסר SUPABASE_SERVICE_KEY או SUPABASE_URL', 503)
  }

  const { path: segments } = await context.params
  const route = segments.join('/')

  try {
    if (route === 'review') return await handleReview(request, client)
    if (route === 'site-update') return await handleSaveSiteUpdate(request, client)
    return jsonError('נתיב לא נמצא', 404)
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : 'שגיאה', 500)
  }
}

import type { DreamOfficeId } from './dreamGovernmentOffices'
import { DREAM_ALL_OFFICES } from './dreamGovernmentOffices'

export type DreamCabinetOfficeStats = {
  total: number
  byCandidate: Record<number, number>
}

export type DreamCabinetStats = {
  electionId: number | null
  offices: Record<DreamOfficeId, DreamCabinetOfficeStats>
}

export type DreamCabinetStatsRpcRow = {
  office_id: string
  candidate_id: number
  pick_count: number | string
}

export type DreamCabinetSubmitPick = {
  officeId: DreamOfficeId
  candidateId: number
}

export function emptyDreamCabinetStats(
  electionId: number | null = null,
): DreamCabinetStats {
  const offices = {} as Record<DreamOfficeId, DreamCabinetOfficeStats>
  for (const office of DREAM_ALL_OFFICES) {
    offices[office.id] = { total: 0, byCandidate: {} }
  }
  return { electionId, offices }
}

export function buildDreamCabinetStats(
  rows: DreamCabinetStatsRpcRow[],
  electionId: number | null = null,
): DreamCabinetStats {
  const stats = emptyDreamCabinetStats(electionId)
  const validOffices = new Set<string>(DREAM_ALL_OFFICES.map((o) => o.id))

  for (const row of rows) {
    if (!validOffices.has(row.office_id)) continue
    const officeId = row.office_id as DreamOfficeId
    const count = Number(row.pick_count)
    if (!Number.isFinite(count) || count <= 0) continue

    const office = stats.offices[officeId]
    office.byCandidate[row.candidate_id] =
      (office.byCandidate[row.candidate_id] ?? 0) + count
    office.total += count
  }

  return stats
}

export function getDreamPickPercentage(
  officeStats: DreamCabinetOfficeStats | undefined,
  candidateId: number,
): number | null {
  if (!officeStats || officeStats.total <= 0) return null
  const count = officeStats.byCandidate[candidateId] ?? 0
  return Math.round((100 * count) / officeStats.total)
}

export function getDreamPickStat(
  officeStats: DreamCabinetOfficeStats | undefined,
  candidateId: number,
): { percentage: number; total: number; count: number } | null {
  if (!officeStats || officeStats.total <= 0) return null
  const count = officeStats.byCandidate[candidateId] ?? 0
  return {
    percentage: Math.round((100 * count) / officeStats.total),
    total: officeStats.total,
    count,
  }
}

/**
 * After share unlock, always return a bar for a filled seat.
 * If aggregates are empty/unavailable (or this pick is not in them yet),
 * show this browser's pick as 100% of 1 until a refetch arrives.
 */
export function getDreamPickStatForDisplay(
  officeStats: DreamCabinetOfficeStats | undefined,
  candidateId: number,
): { percentage: number; total: number; count: number } {
  return (
    getDreamPickStat(officeStats, candidateId) ?? {
      percentage: 100,
      total: 1,
      count: 1,
    }
  )
}

/** Merge the current browser's shared picks into aggregates for instant UI. */
export function mergeLocalPicksIntoStats(
  stats: DreamCabinetStats,
  picks: DreamCabinetSubmitPick[],
): DreamCabinetStats {
  const next = emptyDreamCabinetStats(stats.electionId)

  for (const office of DREAM_ALL_OFFICES) {
    const incoming = stats.offices[office.id]
    next.offices[office.id] = {
      total: incoming.total,
      byCandidate: { ...incoming.byCandidate },
    }
  }

  for (const pick of picks) {
    const office = next.offices[pick.officeId]
    if (!office) continue
    const prev = office.byCandidate[pick.candidateId] ?? 0
    if (prev <= 0) {
      office.byCandidate[pick.candidateId] = 1
      office.total += 1
    }
  }

  return next
}

/** Load aggregates via public Next API (service-role RPC under the hood). */
export async function fetchDreamCabinetStats(
  electionId?: number | null,
): Promise<DreamCabinetStats> {
  const params = new URLSearchParams()
  if (electionId != null) {
    params.set('electionId', String(electionId))
  }
  const query = params.toString()
  const url = query
    ? `/api/elections/dream-government/stats?${query}`
    : '/api/elections/dream-government/stats'

  const response = await fetch(url, { method: 'GET' })
  const body = (await response.json()) as {
    ok?: boolean
    error?: string
    electionId?: number
    offices?: Record<string, DreamCabinetOfficeStats>
  }

  if (!response.ok || body.ok === false) {
    throw new Error(body.error ?? 'Failed to load dream cabinet stats')
  }

  const base = emptyDreamCabinetStats(body.electionId ?? null)
  if (!body.offices) return base

  for (const office of DREAM_ALL_OFFICES) {
    const incoming = body.offices[office.id]
    if (!incoming) continue
    base.offices[office.id] = {
      total: Number(incoming.total) || 0,
      byCandidate: Object.fromEntries(
        Object.entries(incoming.byCandidate ?? {}).map(([id, count]) => [
          Number(id),
          Number(count) || 0,
        ]),
      ),
    }
  }

  return base
}

export async function submitDreamCabinetPicks(input: {
  clientId: string
  electionId?: number | null
  picks: DreamCabinetSubmitPick[]
}): Promise<void> {
  const response = await fetch('/api/elections/dream-government/submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      clientId: input.clientId,
      electionId: input.electionId ?? undefined,
      picks: input.picks,
    }),
  })

  const body = (await response.json()) as {
    ok?: boolean
    error?: string
  }

  if (!response.ok || body.ok === false) {
    throw new Error(body.error ?? 'Failed to submit dream cabinet picks')
  }
}

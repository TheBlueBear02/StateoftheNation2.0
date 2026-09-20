import {
  DREAM_ALL_OFFICES,
  type DreamOfficeId,
} from './dreamGovernmentOffices'
import {
  buildDreamCabinetStats,
  type DreamCabinetStatsRpcRow,
} from './fetchDreamCabinetStats'

export const DREAM_DASHBOARD_ACTIVITY_DAYS = 30
export const DREAM_DASHBOARD_LEADER_LIMIT = 10

export type DreamDashboardLeader = {
  candidateId: number
  fullName: string
  imageUrl: string | null
  partyName: string | null
  partyShortName: string | null
  partyColor: string | null
  pickCount: number
  percentage: number
}

export type DreamDashboardOfficeBoard = {
  officeId: DreamOfficeId
  label: string
  total: number
  leaders: DreamDashboardLeader[]
}

export type DreamDashboardActivityDay = {
  date: string
  uniqueClients: number
  pickWrites: number
}

export type DreamCabinetDashboard = {
  electionId: number
  uniqueVoters: number
  totalPicks: number
  activityByDay: DreamDashboardActivityDay[]
  offices: DreamDashboardOfficeBoard[]
}

export type DreamCabinetPersonJoin = {
  full_name: string | null
  image_url: string | null
}

export type DreamCabinetPartyJoin = {
  name: string | null
  short_name: string | null
  color: string | null
}

export type DreamCabinetCandidateMetaRow = {
  id: number
  people: DreamCabinetPersonJoin | DreamCabinetPersonJoin[] | null
  election_parties: DreamCabinetPartyJoin | DreamCabinetPartyJoin[] | null
}

export type DreamCabinetPickActivityRow = {
  client_id: string
  updated_at: string
}

function unwrapRelation<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}

/** Calendar date in Asia/Jerusalem as YYYY-MM-DD. */
export function toIsraelDate(iso: string): string {
  const trimmed = iso.trim()
  // Naive DB timestamps are already Israel local wall-clock — use the date part.
  if (
    !/[zZ]|[+-]\d{2}:?\d{2}$/.test(trimmed) &&
    /^\d{4}-\d{2}-\d{2}/.test(trimmed)
  ) {
    return trimmed.slice(0, 10)
  }
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jerusalem',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(trimmed))
}

function israelToday(): string {
  return toIsraelDate(new Date().toISOString())
}

function addDaysIso(yyyyMmDd: string, delta: number): string {
  const [y, m, d] = yyyyMmDd.split('-').map(Number)
  const utc = new Date(Date.UTC(y, m - 1, d))
  utc.setUTCDate(utc.getUTCDate() + delta)
  const year = utc.getUTCFullYear()
  const month = String(utc.getUTCMonth() + 1).padStart(2, '0')
  const day = String(utc.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function buildActivityByDay(
  rows: DreamCabinetPickActivityRow[],
  dayCount: number = DREAM_DASHBOARD_ACTIVITY_DAYS,
): DreamDashboardActivityDay[] {
  const today = israelToday()
  const start = addDaysIso(today, -(dayCount - 1))
  const byDay = new Map<string, { clients: Set<string>; pickWrites: number }>()

  for (let i = 0; i < dayCount; i += 1) {
    byDay.set(addDaysIso(start, i), { clients: new Set(), pickWrites: 0 })
  }

  for (const row of rows) {
    const date = toIsraelDate(row.updated_at)
    const bucket = byDay.get(date)
    if (!bucket) continue
    bucket.pickWrites += 1
    bucket.clients.add(row.client_id)
  }

  return [...byDay.entries()].map(([date, bucket]) => ({
    date,
    uniqueClients: bucket.clients.size,
    pickWrites: bucket.pickWrites,
  }))
}

export function buildDreamCabinetDashboard(input: {
  electionId: number
  statsRows: DreamCabinetStatsRpcRow[]
  activityRows: DreamCabinetPickActivityRow[]
  candidates: DreamCabinetCandidateMetaRow[]
  leaderLimit?: number
  activityDays?: number
}): DreamCabinetDashboard {
  const leaderLimit = input.leaderLimit ?? DREAM_DASHBOARD_LEADER_LIMIT
  const stats = buildDreamCabinetStats(input.statsRows, input.electionId)

  const candidateMeta = new Map<
    number,
    {
      fullName: string
      imageUrl: string | null
      partyName: string | null
      partyShortName: string | null
      partyColor: string | null
    }
  >()

  for (const row of input.candidates) {
    const person = unwrapRelation(row.people)
    const party = unwrapRelation(row.election_parties)
    candidateMeta.set(row.id, {
      fullName: person?.full_name?.trim() || `מועמד #${row.id}`,
      imageUrl: person?.image_url ?? null,
      partyName: party?.name ?? null,
      partyShortName: party?.short_name ?? null,
      partyColor: party?.color ?? null,
    })
  }

  const uniqueVoters = new Set(
    input.activityRows.map((row) => row.client_id),
  ).size

  let totalPicks = 0
  const offices: DreamDashboardOfficeBoard[] = DREAM_ALL_OFFICES.map(
    (office) => {
      const officeStats = stats.offices[office.id]
      totalPicks += officeStats.total

      const leaders = Object.entries(officeStats.byCandidate)
        .map(([candidateIdRaw, pickCount]) => {
          const candidateId = Number(candidateIdRaw)
          const meta = candidateMeta.get(candidateId)
          return {
            candidateId,
            fullName: meta?.fullName ?? `מועמד #${candidateId}`,
            imageUrl: meta?.imageUrl ?? null,
            partyName: meta?.partyName ?? null,
            partyShortName: meta?.partyShortName ?? null,
            partyColor: meta?.partyColor ?? null,
            pickCount,
            percentage:
              officeStats.total > 0
                ? Math.round((100 * pickCount) / officeStats.total)
                : 0,
          } satisfies DreamDashboardLeader
        })
        .sort((a, b) => {
          if (b.pickCount !== a.pickCount) return b.pickCount - a.pickCount
          return a.fullName.localeCompare(b.fullName, 'he')
        })
        .slice(0, leaderLimit)

      return {
        officeId: office.id,
        label: office.label,
        total: officeStats.total,
        leaders,
      }
    },
  )

  return {
    electionId: input.electionId,
    uniqueVoters,
    totalPicks,
    activityByDay: buildActivityByDay(
      input.activityRows,
      input.activityDays ?? DREAM_DASHBOARD_ACTIVITY_DAYS,
    ),
    offices,
  }
}

export async function fetchDreamCabinetDashboard(): Promise<DreamCabinetDashboard> {
  const response = await fetch('/api/elections/dream-government/dashboard', {
    method: 'GET',
  })
  const body = (await response.json()) as {
    ok?: boolean
    error?: string
    electionId?: number
    uniqueVoters?: number
    totalPicks?: number
    activityByDay?: DreamDashboardActivityDay[]
    offices?: DreamDashboardOfficeBoard[]
  }

  if (!response.ok || body.ok === false) {
    throw new Error(body.error ?? 'Failed to load dream cabinet dashboard')
  }

  return {
    electionId: body.electionId ?? 0,
    uniqueVoters: body.uniqueVoters ?? 0,
    totalPicks: body.totalPicks ?? 0,
    activityByDay: body.activityByDay ?? [],
    offices: body.offices ?? [],
  }
}

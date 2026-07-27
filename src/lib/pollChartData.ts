import type { PartyBloc } from './supabase'
import type { PollWithResults } from '../hooks/usePolls'

export const KNESSET_SEATS = 120

export const BLOC_COLORS: Record<PartyBloc, string> = {
  coalition: '#4890fd',
  opposition: '#e74c3c',
  unaligned: '#f5c518',
}

export const BLOC_LABELS: Record<PartyBloc, string> = {
  coalition: 'קואליציה',
  opposition: 'אופוזיציה',
  unaligned: 'לא מזוהים',
}

export type DisplayBlocKey = 'coalition' | 'raam' | 'hadashTaal' | 'opposition'

export const DISPLAY_BLOC_ORDER: DisplayBlocKey[] = [
  'coalition',
  'raam',
  'hadashTaal',
  'opposition',
]

export const DISPLAY_BLOC_COLORS: Record<DisplayBlocKey, string> = {
  coalition: '#4890fd',
  raam: '#228B22',
  hadashTaal: '#CC0000',
  opposition: '#e74c3c',
}

export const DISPLAY_BLOC_LABELS: Record<DisplayBlocKey, string> = {
  coalition: 'קואליציה',
  raam: 'רע״ם',
  hadashTaal: 'חד״ש-תע״ל',
  opposition: 'אופוזיציה',
}

const RAAM_PARTY_NAME = 'רע״ם'
const HADASH_TAAL_PARTY_NAME = 'חד״ש-תע״ל'

export type DisplayBlocTotals = Record<DisplayBlocKey, number>

function classifyDisplayBloc(party: {
  partyName: string
  bloc: PartyBloc | null
}): DisplayBlocKey {
  if (party.partyName === RAAM_PARTY_NAME) return 'raam'
  if (party.partyName === HADASH_TAAL_PARTY_NAME) return 'hadashTaal'
  if (party.bloc === 'coalition') return 'coalition'
  return 'opposition'
}

export function displayBlocColorForParty(party: {
  partyName: string
  bloc: PartyBloc | null
}): string {
  return DISPLAY_BLOC_COLORS[classifyDisplayBloc(party)]
}

function buildDisplayBlocShares(totals: DisplayBlocTotals): DisplayBlocTotals {
  return {
    coalition: (totals.coalition / KNESSET_SEATS) * 100,
    raam: (totals.raam / KNESSET_SEATS) * 100,
    hadashTaal: (totals.hadashTaal / KNESSET_SEATS) * 100,
    opposition: (totals.opposition / KNESSET_SEATS) * 100,
  }
}

export function sumDisplayBlocTotals(
  parties: Pick<PartySeatAverage, 'partyName' | 'bloc' | 'seatsAvg'>[],
): DisplayBlocTotals {
  const totals: DisplayBlocTotals = {
    coalition: 0,
    raam: 0,
    hadashTaal: 0,
    opposition: 0,
  }
  for (const party of parties) {
    totals[classifyDisplayBloc(party)] += party.seatsAvg
  }
  return totals
}

function sumDisplayBlocTotalsFromParties(
  parties: Pick<PartySnapshot, 'partyName' | 'bloc' | 'seats'>[],
): DisplayBlocTotals {
  const totals: DisplayBlocTotals = {
    coalition: 0,
    raam: 0,
    hadashTaal: 0,
    opposition: 0,
  }
  for (const party of parties) {
    totals[classifyDisplayBloc(party)] += party.seats
  }
  return totals
}

export type PartySeatAverage = {
  partyId: number
  partyName: string
  partyColor: string | null
  bloc: PartyBloc | null
  seatsAvg: number
}

export type BlocTotals = {
  coalition: number
  opposition: number
  unaligned: number
}

export type PartySnapshot = {
  partyId: number
  partyName: string
  partyColor: string | null
  bloc: PartyBloc | null
  seats: number
  share: number
}

export type PollSnapshot = {
  pollId: number
  date: string
  label: string
  shortLabel: string
  pollster: string
  pollsterHe: string | null
  publisher: string
  sampleSize: number | null
  fieldworkStart: string
  fieldworkEnd: string
  parties: PartySnapshot[]
  blocTotals: BlocTotals
  blocShares: Record<PartyBloc, number>
  displayBlocTotals: DisplayBlocTotals
  displayBlocShares: DisplayBlocTotals
}

export function todayJerusalem(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jerusalem',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

export function selectRecentRegularPolls(
  polls: PollWithResults[],
  n: number,
  asOfDate = todayJerusalem(),
): PollWithResults[] {
  const regular = polls.filter((p) => !p.isScenario)
  const onOrBefore = regular.filter((p) => p.fieldworkEnd <= asOfDate)
  // If the device clock is behind the dataset (or all rows look "future"),
  // fall back to the latest regular polls so the page is never empty.
  const pool = onOrBefore.length > 0 ? onOrBefore : regular
  return pool.slice(0, n)
}

export type PartySeatsTrendPoint = {
  pollId: number
  seats: number
  fieldworkStart: string
  fieldworkEnd: string
  pollster: string
  pollsterHe: string | null
  publisher: string
  sampleSize: number | null
}

export type PartySeatsTrend = {
  seatsAvg: number | null
  /** Chronological points (oldest → newest) for the last N regular polls. */
  points: PartySeatsTrendPoint[]
  /** Seat values only — same order as `points`. */
  trend: number[]
  pollCount: number
}

/** Per-party average + sparkline points from the N most recent non-scenario polls. */
export function computePartyLastNTrend(
  polls: PollWithResults[],
  partyId: number,
  n: number,
  asOfDate = todayJerusalem(),
): PartySeatsTrend {
  const regular = selectRecentRegularPolls(polls, n, asOfDate)
  if (regular.length === 0) {
    return { seatsAvg: null, points: [], trend: [], pollCount: 0 }
  }

  // Newest-first from selectRecentRegularPolls → chronological for the sparkline.
  const chronological = [...regular].reverse()
  const points: PartySeatsTrendPoint[] = chronological.map((poll) => {
    const result = poll.results.find((r) => r.partyId === partyId)
    return {
      pollId: poll.id,
      seats: result?.seats ?? 0,
      fieldworkStart: poll.fieldworkStart,
      fieldworkEnd: poll.fieldworkEnd,
      pollster: poll.pollster,
      pollsterHe: poll.pollsterHe,
      publisher: poll.publisher,
      sampleSize: poll.sampleSize,
    }
  })
  const trend = points.map((p) => p.seats)

  const appearing = chronological.filter((poll) =>
    poll.results.some((r) => r.partyId === partyId && r.seats !== null),
  )
  const seatsAvg =
    appearing.length === 0
      ? 0
      : appearing.reduce((sum, poll) => {
          const seats = poll.results.find((r) => r.partyId === partyId)?.seats ?? 0
          return sum + seats
        }, 0) / appearing.length

  return {
    seatsAvg,
    points,
    trend,
    pollCount: regular.length,
  }
}

export function computeLastNAverage(
  polls: PollWithResults[],
  n: number,
  partyBlocs: Map<number, PartyBloc | null>,
  asOfDate = todayJerusalem(),
): PartySeatAverage[] {
  const regular = selectRecentRegularPolls(polls, n, asOfDate)
  if (regular.length === 0) return []

  const sums = new Map<number, { total: number; name: string; color: string | null }>()
  const appearances = new Map<number, number>()

  for (const poll of regular) {
    for (const result of poll.results) {
      if (result.seats === null) continue
      const existing = sums.get(result.partyId)
      if (existing) {
        existing.total += result.seats
      } else {
        sums.set(result.partyId, {
          total: result.seats,
          name: result.partyName,
          color: result.partyColor,
        })
      }
      appearances.set(result.partyId, (appearances.get(result.partyId) ?? 0) + 1)
    }
  }

  return [...sums.entries()]
    .map(([partyId, { total, name, color }]) => ({
      partyId,
      partyName: name,
      partyColor: color,
      bloc: partyBlocs.get(partyId) ?? null,
      seatsAvg: total / (appearances.get(partyId) ?? 1),
    }))
    .sort((a, b) => b.seatsAvg - a.seatsAvg)
}

export function sumBlocTotals(parties: PartySeatAverage[]): BlocTotals {
  const totals: BlocTotals = { coalition: 0, opposition: 0, unaligned: 0 }
  for (const party of parties) {
    if (party.bloc === 'coalition') totals.coalition += party.seatsAvg
    else if (party.bloc === 'opposition') totals.opposition += party.seatsAvg
    else if (party.bloc === 'unaligned') totals.unaligned += party.seatsAvg
  }
  return totals
}

export function formatPollDate(date: string): string {
  return new Intl.DateTimeFormat('he-IL', {
    timeZone: 'Asia/Jerusalem',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(date))
}

/** Compact day.month label, e.g. 17.7 */
export function formatPollDayMonth(date: string): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jerusalem',
    day: 'numeric',
    month: 'numeric',
  }).formatToParts(new Date(date))

  const day = parts.find((p) => p.type === 'day')?.value ?? ''
  const month = parts.find((p) => p.type === 'month')?.value ?? ''
  return `${day}.${month}`
}

export function formatPollMonth(date: string): string {
  return new Intl.DateTimeFormat('he-IL', {
    timeZone: 'Asia/Jerusalem',
    month: 'short',
    year: 'numeric',
  }).format(new Date(date))
}

/** Strip Wikipedia footnote markers like [20] or [ 21 ] from publisher labels. */
export function cleanPollPublisher(publisher: string): string {
  return publisher.replace(/\s*\[[^\]]*\]\s*/g, ' ').replace(/\s+/g, ' ').trim()
}

export function snapshotSeatTotal(snapshot: PollSnapshot): number {
  return snapshot.parties.reduce((sum, party) => sum + party.seats, 0)
}

/** Most recent N polls whose party seat projections sum to 120. */
export function selectRecentCompleteSnapshots(
  snapshots: PollSnapshot[],
  n: number,
): PollSnapshot[] {
  return snapshots
    .filter((s) => Math.round(snapshotSeatTotal(s)) === KNESSET_SEATS)
    .slice(-n)
}

function buildBlocShares(totals: BlocTotals): Record<PartyBloc, number> {
  return {
    coalition: (totals.coalition / KNESSET_SEATS) * 100,
    opposition: (totals.opposition / KNESSET_SEATS) * 100,
    unaligned: (totals.unaligned / KNESSET_SEATS) * 100,
  }
}

export function buildPollSnapshots(
  polls: PollWithResults[],
  partyBlocs: Map<number, PartyBloc | null>,
  asOfDate = todayJerusalem(),
): PollSnapshot[] {
  const regular = [...polls].filter((p) => !p.isScenario)
  const onOrBefore = regular.filter((p) => p.fieldworkEnd <= asOfDate)
  const pool = onOrBefore.length > 0 ? onOrBefore : regular
  const sorted = pool.sort((a, b) => a.fieldworkEnd.localeCompare(b.fieldworkEnd))

  return sorted.map((poll) => {
    const parties: PartySnapshot[] = poll.results
      .filter(
        (r) =>
          (r.seats !== null && r.seats > 0) || r.belowThreshold === true,
      )
      .map((r) => ({
        partyId: r.partyId,
        partyName: r.partyName,
        partyColor: r.partyColor,
        bloc: partyBlocs.get(r.partyId) ?? null,
        seats: r.seats ?? 0,
        share: ((r.seats ?? 0) / KNESSET_SEATS) * 100,
      }))
      .sort((a, b) => b.seats - a.seats)

    const blocTotals: BlocTotals = { coalition: 0, opposition: 0, unaligned: 0 }
    for (const party of parties) {
      if (party.bloc === 'coalition') blocTotals.coalition += party.seats
      else if (party.bloc === 'opposition') blocTotals.opposition += party.seats
      else if (party.bloc === 'unaligned') blocTotals.unaligned += party.seats
    }

    const displayBlocTotals = sumDisplayBlocTotalsFromParties(parties)

    return {
      pollId: poll.id,
      date: poll.fieldworkEnd,
      label: formatPollDate(poll.fieldworkEnd),
      shortLabel: formatPollDayMonth(poll.fieldworkEnd),
      pollster: poll.pollster,
      pollsterHe: poll.pollsterHe,
      publisher: poll.publisher,
      sampleSize: poll.sampleSize,
      fieldworkStart: poll.fieldworkStart,
      fieldworkEnd: poll.fieldworkEnd,
      parties,
      blocTotals,
      blocShares: buildBlocShares(blocTotals),
      displayBlocTotals,
      displayBlocShares: buildDisplayBlocShares(displayBlocTotals),
    }
  })
}

export function collectLegendParties(snapshots: PollSnapshot[]): PartySnapshot[] {
  const byId = new Map<number, PartySnapshot>()
  for (const snapshot of snapshots) {
    for (const party of snapshot.parties) {
      if (!byId.has(party.partyId)) {
        byId.set(party.partyId, party)
      }
    }
  }
  return [...byId.values()].sort((a, b) => a.partyName.localeCompare(b.partyName, 'he'))
}

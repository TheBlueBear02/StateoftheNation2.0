import type { BordersTopic } from '../content/governmentBordersTopics'
import type { PollPartyResult, PollWithResults } from './fetchPolls'
import {
  cleanPollPublisher,
  formatPollPublisher,
  KNESSET_SEATS,
  normalizePartyShortName,
  selectRecentRegularPolls,
  selectRecentRegularPollsForPublisher,
} from './pollChartData'
import type { ElectionPartyLeader, PartyBloc } from './supabase'

/** Seats needed for a governing majority. */
export const BORDERS_MAJORITY = 61

export { KNESSET_SEATS }

export type BordersChannel = {
  /** cleanPollPublisher key */
  key: string
  label: string
  logoUrl: string | null
  poll: PollWithResults
}

export type BordersPartyColumn = {
  partyId: number
  partyName: string
  partyShortName: string
  partyColor: string | null
  partyLogoUrl: string | null
  bloc: PartyBloc | null
  seats: number
  leader: ElectionPartyLeader | null
}

export type BordersRange = {
  /** Inclusive start column index (0 = rightmost in RTL DOM). */
  start: number
  /** Inclusive end column index. */
  end: number
}

const BLOC_APPEND_ORDER: PartyBloc[] = ['coalition', 'unaligned', 'opposition']

function blocAppendRank(bloc: PartyBloc | null): number {
  if (!bloc) return BLOC_APPEND_ORDER.length
  const idx = BLOC_APPEND_ORDER.indexOf(bloc)
  return idx === -1 ? BLOC_APPEND_ORDER.length : idx
}

/** Newest non-scenario poll per publisher (channel). Sorted by fieldwork end desc. */
export function listBordersChannels(polls: PollWithResults[]): BordersChannel[] {
  const recent = selectRecentRegularPolls(polls, polls.length)
  const seen = new Set<string>()
  const channels: BordersChannel[] = []

  for (const poll of recent) {
    const key = cleanPollPublisher(poll.publisher)
    if (!key || seen.has(key)) continue
    seen.add(key)
    channels.push({
      key,
      label: formatPollPublisher(poll),
      logoUrl: poll.publisherLogoUrl,
      poll,
    })
  }

  return channels
}

export function getChannelPoll(
  polls: PollWithResults[],
  channelKey: string,
): PollWithResults | null {
  return selectRecentRegularPollsForPublisher(polls, channelKey, 1)[0] ?? null
}

function toColumn(
  result: PollPartyResult,
  leadersByPartyId: Map<number, ElectionPartyLeader>,
): BordersPartyColumn | null {
  const seats = result.seats ?? 0
  if (seats <= 0) return null

  return {
    partyId: result.partyId,
    partyName: result.partyName,
    partyShortName: result.partyShortName?.trim() || result.partyName,
    partyColor: result.partyColor,
    partyLogoUrl: result.partyLogoUrl,
    bloc: result.bloc,
    seats,
    leader: leadersByPartyId.get(result.partyId) ?? null,
  }
}

/**
 * Order poll parties by topic. Missing parties are appended at the end
 * (sorted by bloc), with a dev console warning.
 */
export function orderPartiesByTopic(
  results: PollPartyResult[],
  topic: BordersTopic,
  leadersByPartyId: Map<number, ElectionPartyLeader> = new Map(),
): BordersPartyColumn[] {
  const columns = results
    .map((result) => toColumn(result, leadersByPartyId))
    .filter((col): col is BordersPartyColumn => col !== null)

  const byNorm = new Map<string, BordersPartyColumn>()
  for (const col of columns) {
    byNorm.set(normalizePartyShortName(col.partyShortName), col)
  }

  const ordered: BordersPartyColumn[] = []
  const used = new Set<number>()

  for (const shortName of topic.order) {
    const key = normalizePartyShortName(shortName)
    const col = byNorm.get(key)
    if (!col || used.has(col.partyId)) continue
    ordered.push(col)
    used.add(col.partyId)
  }

  const missing = columns
    .filter((col) => !used.has(col.partyId))
    .sort((a, b) => {
      const blocDiff = blocAppendRank(a.bloc) - blocAppendRank(b.bloc)
      if (blocDiff !== 0) return blocDiff
      return b.seats - a.seats
    })

  if (missing.length > 0 && typeof console !== 'undefined') {
    console.warn(
      `[government-borders] topic "${topic.id}" missing parties:`,
      missing.map((col) => col.partyShortName),
    )
  }

  return [...ordered, ...missing]
}

export function sumRange(
  columns: BordersPartyColumn[],
  range: BordersRange,
): number {
  if (columns.length === 0) return 0
  const start = Math.max(0, Math.min(range.start, range.end))
  const end = Math.min(columns.length - 1, Math.max(range.start, range.end))
  let total = 0
  for (let i = start; i <= end; i += 1) {
    total += columns[i]!.seats
  }
  return total
}

/** Grow from the rightmost column until seats ≥ majority (or all parties). */
export function defaultRange(columns: BordersPartyColumn[]): BordersRange {
  if (columns.length === 0) {
    return { start: 0, end: 0 }
  }

  let end = 0
  let total = 0
  for (let i = 0; i < columns.length; i += 1) {
    total += columns[i]!.seats
    end = i
    if (total >= BORDERS_MAJORITY) break
  }

  return { start: 0, end }
}

export function clampRange(
  range: BordersRange,
  columnCount: number,
): BordersRange {
  if (columnCount <= 0) {
    return { start: 0, end: 0 }
  }

  let start = Math.max(0, Math.min(columnCount - 1, range.start))
  let end = Math.max(0, Math.min(columnCount - 1, range.end))
  if (start > end) {
    ;[start, end] = [end, start]
  }
  return { start, end }
}

export function isPartyInRange(index: number, range: BordersRange): boolean {
  const start = Math.min(range.start, range.end)
  const end = Math.max(range.start, range.end)
  return index >= start && index <= end
}

export function majorityStatus(seats: number): {
  hasMajority: boolean
  label: string
} {
  if (seats >= BORDERS_MAJORITY) {
    return { hasMajority: true, label: 'יש רוב' }
  }
  const missing = BORDERS_MAJORITY - seats
  return {
    hasMajority: false,
    label: missing === 1 ? 'חסר מנדט אחד' : `חסרים ${missing}`,
  }
}

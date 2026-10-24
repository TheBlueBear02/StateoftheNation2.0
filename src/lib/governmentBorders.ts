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

/** Always pinned to the far left (end of RTL order). Normalized short names. */
const BORDERS_LEFTMOST_PARTY_KEYS = new Set([
  normalizePartyShortName('רע"ם'),
  normalizePartyShortName('הרשימה המשותפת'),
])

/** Always pinned to the far right (start of RTL order). Normalized short names. */
const BORDERS_RIGHTMOST_PARTY_KEYS = new Set([
  normalizePartyShortName('ש"ס'),
  normalizePartyShortName('יהדות התורה'),
  normalizePartyShortName('הציבור החרדי'),
])

/**
 * Always between coalition and opposition wings (RTL: earlier = further right).
 * עמך ישראל sits closer to coalition; המילואימניקים to its left.
 */
const BORDERS_CENTER_PARTY_ORDER = [
  normalizePartyShortName('עמך ישראל'),
  normalizePartyShortName('עמיחא ישראל'),
  normalizePartyShortName('עמיחאי ישראל'),
  normalizePartyShortName('המילואימניקים'),
] as const

const BORDERS_CENTER_PARTY_KEYS = new Set(BORDERS_CENTER_PARTY_ORDER)

/** Anchor party; follower is inserted immediately after it (further left in RTL). */
const BORDERS_FOLLOW_AFTER_KEY = normalizePartyShortName('ישר')
const BORDERS_FOLLOWER_KEY = normalizePartyShortName('ישראל ביתנו')

/** Pairs whose seats-based positions should be swapped after sorting. */
const BORDERS_SWAP_PAIRS: Array<readonly [string, string]> = [
  [
    normalizePartyShortName('עוצמה יהודית'),
    normalizePartyShortName('הציונות הדתית'),
  ],
]

/** Seats needed for a governing majority. */
export const BORDERS_MAJORITY = 61

/** How many distinct publishers appear in the channel logo row. */
export const BORDERS_CHANNEL_LIMIT = 5

/**
 * Summary 0–120 strip colors (selected government vs outside).
 * Deliberately distinct from party-bar bloc blues/reds (`#4890fd` / `#e74c3c`)
 * so the strip is not read as the same coalition/opposition coding.
 */
export const BORDERS_SUMMARY_GOV_COLOR = '#1f7a6c'
export const BORDERS_SUMMARY_OUT_COLOR = '#c47a3a'

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

function bySeatsAsc(a: BordersPartyColumn, b: BordersPartyColumn): number {
  if (a.seats !== b.seats) return a.seats - b.seats
  return a.partyShortName.localeCompare(b.partyShortName, 'he')
}

function bySeatsDesc(a: BordersPartyColumn, b: BordersPartyColumn): number {
  if (a.seats !== b.seats) return b.seats - a.seats
  return a.partyShortName.localeCompare(b.partyShortName, 'he')
}

function resolveBordersBloc(bloc: PartyBloc | null): PartyBloc {
  if (bloc === 'coalition' || bloc === 'opposition') return bloc
  return 'unaligned'
}

function isBordersLeftmostParty(col: BordersPartyColumn): boolean {
  return BORDERS_LEFTMOST_PARTY_KEYS.has(
    normalizePartyShortName(col.partyShortName),
  )
}

function isBordersRightmostParty(col: BordersPartyColumn): boolean {
  return BORDERS_RIGHTMOST_PARTY_KEYS.has(
    normalizePartyShortName(col.partyShortName),
  )
}

function isBordersCenterParty(col: BordersPartyColumn): boolean {
  return BORDERS_CENTER_PARTY_KEYS.has(
    normalizePartyShortName(col.partyShortName),
  )
}

function partyKey(col: BordersPartyColumn): string {
  return normalizePartyShortName(col.partyShortName)
}

/**
 * Circular crop tweaks when source photos frame the face too low.
 * Matched by party short_name and/or leader full_name.
 */
const BORDERS_AVATAR_OBJECT_POSITION_BY_PARTY = new Map<string, string>([
  [normalizePartyShortName('בנט 2026'), 'center 18%'],
  [normalizePartyShortName('הרשימה המשותפת'), 'center 18%'],
])

const BORDERS_AVATAR_OBJECT_POSITION_BY_LEADER = new Map<string, string>([
  ['נפתלי בנט', 'center 18%'],
])

/** `object-position` for leader avatars that need an upper focal point. */
export function bordersAvatarObjectPosition(
  column: Pick<BordersPartyColumn, 'partyShortName' | 'leader'>,
): string | undefined {
  const partyNorm = normalizePartyShortName(column.partyShortName)
  const byParty = BORDERS_AVATAR_OBJECT_POSITION_BY_PARTY.get(partyNorm)
  if (byParty) return byParty
  // Bennett party may appear as "בנט" / "בנט 2026".
  if (partyNorm.includes('בנט')) return 'center 18%'

  const leaderName = column.leader?.fullName?.trim()
  if (leaderName) {
    return BORDERS_AVATAR_OBJECT_POSITION_BY_LEADER.get(leaderName)
  }
  return undefined
}

/** Place ישראל ביתנו immediately after ישר when both appear. */
function applyBordersFollowPairs(
  ordered: BordersPartyColumn[],
  follower: BordersPartyColumn | null,
): BordersPartyColumn[] {
  if (!follower) return ordered

  const anchorIndex = ordered.findIndex(
    (col) => partyKey(col) === BORDERS_FOLLOW_AFTER_KEY,
  )
  if (anchorIndex === -1) return ordered

  const next = [...ordered]
  next.splice(anchorIndex + 1, 0, follower)
  return next
}

/** Swap specific party pairs after the size/bloc sort. */
function applyBordersSwapPairs(
  ordered: BordersPartyColumn[],
): BordersPartyColumn[] {
  const next = [...ordered]
  for (const [keyA, keyB] of BORDERS_SWAP_PAIRS) {
    const indexA = next.findIndex((col) => partyKey(col) === keyA)
    const indexB = next.findIndex((col) => partyKey(col) === keyB)
    if (indexA === -1 || indexB === -1) continue
    ;[next[indexA], next[indexB]] = [next[indexB]!, next[indexA]!]
  }
  return next
}

/**
 * Newest non-scenario poll per publisher (channel), sorted by fieldwork end
 * desc, capped at {@link BORDERS_CHANNEL_LIMIT}.
 */
export function listBordersChannels(polls: PollWithResults[]): BordersChannel[] {
  const recent = selectRecentRegularPolls(polls, polls.length)
  const seen = new Set<string>()
  const channels: BordersChannel[] = []

  for (const poll of recent) {
    if (channels.length >= BORDERS_CHANNEL_LIMIT) break
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
 * Order poll parties for the ג"ג axis (RTL: index 0 = rightmost):
 * - Far right = pinned Haredi parties (ש"ס, יהדות התורה, הציבור החרדי),
 *   seats ascending so the smaller sits on the outer edge
 * - Right wing = remaining coalition, seats ascending (toward center)
 * - Other unaligned / null bloc, seats descending
 * - Center pin = עמך ישראל then המילואימניקים (between the two blocs;
 *   מילואימניקים to the left of עמך)
 * - Left wing = remaining opposition, seats descending
 * - Far left = pinned Arabic parties (רע"ם, הרשימה המשותפת), seats ascending
 * - ישראל ביתנו is forced immediately after ישר (further left) when both appear
 * - עוצמה יהודית and הציונות הדתית swap after the seats sort
 */
export function orderBordersParties(
  results: PollPartyResult[],
  leadersByPartyId: Map<number, ElectionPartyLeader> = new Map(),
): BordersPartyColumn[] {
  const columns = results
    .map((result) => toColumn(result, leadersByPartyId))
    .filter((col): col is BordersPartyColumn => col !== null)

  const rightmost: BordersPartyColumn[] = []
  const coalition: BordersPartyColumn[] = []
  const opposition: BordersPartyColumn[] = []
  const unaligned: BordersPartyColumn[] = []
  const center: BordersPartyColumn[] = []
  const leftmost: BordersPartyColumn[] = []
  let follower: BordersPartyColumn | null = null

  for (const col of columns) {
    if (partyKey(col) === BORDERS_FOLLOWER_KEY) {
      follower = col
      continue
    }
    if (isBordersRightmostParty(col)) {
      rightmost.push(col)
      continue
    }
    if (isBordersLeftmostParty(col)) {
      leftmost.push(col)
      continue
    }
    if (isBordersCenterParty(col)) {
      center.push(col)
      continue
    }
    const wing = resolveBordersBloc(col.bloc)
    if (wing === 'coalition') coalition.push(col)
    else if (wing === 'opposition') opposition.push(col)
    else unaligned.push(col)
  }

  const hasYashar = columns.some((col) => partyKey(col) === BORDERS_FOLLOW_AFTER_KEY)
  if (follower && !hasYashar) {
    if (isBordersCenterParty(follower)) {
      center.push(follower)
    } else {
      const wing = resolveBordersBloc(follower.bloc)
      if (wing === 'coalition') coalition.push(follower)
      else if (wing === 'opposition') opposition.push(follower)
      else unaligned.push(follower)
    }
    follower = null
  }

  rightmost.sort(bySeatsAsc)
  coalition.sort(bySeatsAsc)
  unaligned.sort(bySeatsDesc)
  center.sort((a, b) => {
    const rank = (col: BordersPartyColumn) => {
      const idx = BORDERS_CENTER_PARTY_ORDER.findIndex(
        (key) => key === partyKey(col),
      )
      return idx === -1 ? BORDERS_CENTER_PARTY_ORDER.length : idx
    }
    const rankDiff = rank(a) - rank(b)
    if (rankDiff !== 0) return rankDiff
    return bySeatsDesc(a, b)
  })
  opposition.sort(bySeatsDesc)
  leftmost.sort(bySeatsAsc)

  return applyBordersSwapPairs(
    applyBordersFollowPairs(
      [
        ...rightmost,
        ...coalition,
        ...unaligned,
        ...center,
        ...opposition,
        ...leftmost,
      ],
      follower,
    ),
  )
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

/**
 * Default selection: Haredi pin + full coalition wing (right-side prefix)
 * when present; otherwise grow from the rightmost column until seats ≥ majority.
 */
export function defaultRange(columns: BordersPartyColumn[]): BordersRange {
  if (columns.length === 0) {
    return { start: 0, end: 0 }
  }

  let lastCoalition = -1
  for (let i = 0; i < columns.length; i += 1) {
    const col = columns[i]!
    if (
      isBordersRightmostParty(col) ||
      resolveBordersBloc(col.bloc) === 'coalition'
    ) {
      lastCoalition = i
      continue
    }
    break
  }
  if (lastCoalition >= 0) {
    return { start: 0, end: lastCoalition }
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

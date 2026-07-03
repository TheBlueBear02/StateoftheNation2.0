export const GRID_COLS = 17
export const GRID_ROWS = 15
export const CELL = 40
/** Tighter than `CELL` so the hemicycle reads squarer on screen (wing columns need ≥32). */
export const CELL_HEIGHT = 34

export const HEMICYCLE_VIEWBOX = {
  width: GRID_COLS * CELL,
  height: GRID_ROWS * CELL_HEIGHT,
} as const

/** 'X' = seat, '.' = empty (center void or corner aisle) */
export const SEAT_GRID: readonly string[] = [
  '...XXXXXXXXXXX...',
  'X...XXXXXXXXX...X',
  'XX...XXXXXXX...XX',
  'XXX...XXXXX...XXX',
  'XXXX.........XXXX',
  'XXXX.........XXXX',
  'XXXX.........XXXX',
  'XXXX.........XXXX',
  'XXXX.........XXXX',
  'XXXX.........XXXX',
  'XXXX.........XXXX',
  'XXXX.........XXXX',
  'XXX...........XXX',
  'XX.............XX',
  'X...............X',
]
export const TOTAL_SEATS = SEAT_GRID.reduce(
  (sum, row) => sum + [...row].filter((cell) => cell === 'X').length,
  0,
)

export const COALITION_COLOR = '#5C63E3'
export const OPPOSITION_COLOR = '#FFC25E'

export const DOT_RADIUS = 16
export const DOT_BORDER = 2.5
export const COUNTER_RADIUS = 74

export type SeatPosition = {
  index: number
  row: number
  col: number
  x: number
  y: number
}

export type PlacedMember = {
  seatIndex: number
  x: number
  y: number
  fullName: string
  imageUrl: string | null
  factionName: string | null
  factionColor: string | null
  isCoalition: boolean
  knessetNumber: number | null
  firstElectedYear: number | null
  totalDaysInKnesset: number
  totalYearsInKnesset: number
}

export type FactionGroup = {
  factionId: number | null
  factionName: string
  factionColor: string | null
  factionLogoUrl: string | null
  isCoalition: boolean
  members: Array<{
    fullName: string
    imageUrl: string | null
    knessetNumber: number | null
    firstElectedYear: number | null
    totalDaysInKnesset: number
    totalYearsInKnesset: number
  }>
}

export function computeSeatPositions(): SeatPosition[] {
  const positions: SeatPosition[] = []
  let globalIndex = 0

  SEAT_GRID.forEach((row, rowIndex) => {
    ;[...row].forEach((cell, colIndex) => {
      if (cell !== 'X') {
        return
      }

      positions.push({
        index: globalIndex,
        row: rowIndex,
        col: colIndex,
        x: colIndex * CELL + CELL / 2,
        y: rowIndex * CELL_HEIGHT + CELL_HEIGHT / 2,
      })
      globalIndex += 1
    })
  })

  return positions
}

function sortFactionGroups(groups: FactionGroup[]): FactionGroup[] {
  return [...groups].sort((left, right) => {
    if (left.isCoalition !== right.isCoalition) {
      return left.isCoalition ? -1 : 1
    }

    return right.members.length - left.members.length
  })
}

function sortFactionGroupsBySize(groups: FactionGroup[]): FactionGroup[] {
  return [...groups].sort(
    (left, right) => right.members.length - left.members.length,
  )
}

function groupMembersByFaction(
  members: Array<{
    factionId: number | null
    factionName: string | null
    factionColor: string | null
    factionLogoUrl: string | null
    isCoalition: boolean
    fullName: string
    imageUrl: string | null
    knessetNumber: number | null
    firstElectedYear: number | null
    totalDaysInKnesset: number
    totalYearsInKnesset: number
  }>,
  splitByBloc = true,
): FactionGroup[] {
  const groups = groupMembersByFactionUnsorted(members)
  return splitByBloc ? sortFactionGroups(groups) : sortFactionGroupsBySize(groups)
}

function groupMembersByFactionUnsorted(
  members: Array<{
    factionId: number | null
    factionName: string | null
    factionColor: string | null
    factionLogoUrl: string | null
    isCoalition: boolean
    fullName: string
    imageUrl: string | null
    knessetNumber: number | null
    firstElectedYear: number | null
    totalDaysInKnesset: number
    totalYearsInKnesset: number
  }>,
): FactionGroup[] {
  const groups = new Map<number | null, FactionGroup>()

  for (const member of members) {
    const key = member.factionId
    const existing = groups.get(key)

    if (existing) {
      existing.members.push({
        fullName: member.fullName,
        imageUrl: member.imageUrl,
        knessetNumber: member.knessetNumber,
        firstElectedYear: member.firstElectedYear,
        totalDaysInKnesset: member.totalDaysInKnesset,
        totalYearsInKnesset: member.totalYearsInKnesset,
      })
      continue
    }

    groups.set(key, {
      factionId: key,
      factionName: member.factionName ?? 'ללא סיעה',
      factionColor: member.factionColor,
      factionLogoUrl: member.factionLogoUrl,
      isCoalition: member.isCoalition,
      members: [
        {
          fullName: member.fullName,
          imageUrl: member.imageUrl,
          knessetNumber: member.knessetNumber,
          firstElectedYear: member.firstElectedYear,
          totalDaysInKnesset: member.totalDaysInKnesset,
          totalYearsInKnesset: member.totalYearsInKnesset,
        },
      ],
    })
  }

  return [...groups.values()]
}

function orderSeatsLeftToRight(seats: SeatPosition[]): SeatPosition[] {
  return [...seats].sort((left, right) => {
    if (left.x !== right.x) {
      return left.x - right.x
    }

    return left.y - right.y
  })
}

const LEFT_WING_MAX_COL = 3
const RIGHT_WING_MIN_COL = GRID_COLS - 4

/** Bottom rows first (y desc), then across the row. `xAscending` mirrors the
 * horizontal direction so each wing fills from its outer edge inward. */
function orderSeatsBottomUp(
  seats: SeatPosition[],
  xAscending: boolean,
): SeatPosition[] {
  return [...seats].sort((left, right) => {
    if (left.y !== right.y) {
      return right.y - left.y
    }

    return xAscending ? left.x - right.x : right.x - left.x
  })
}

/** Columns from the outer side inward (x from the edge toward the center), then
 * top-to-bottom within a column. Used for the top arc so factions there read as
 * vertical stripes growing from the sides toward the middle. */
function orderSeatsSideToMiddle(
  seats: SeatPosition[],
  xAscending: boolean,
): SeatPosition[] {
  return [...seats].sort((left, right) => {
    if (left.x !== right.x) {
      return xAscending ? left.x - right.x : right.x - left.x
    }

    return left.y - right.y
  })
}

/**
 * Fill order for one bloc's seats: the physical wing first, then the shared top
 * arc. Filling the wing as one contiguous cluster before spilling into the arc
 * keeps each faction together — big factions form clean blocks in the wing and
 * only leftover (small) factions land in the arc, instead of a single faction
 * straddling the aisle between the wing and the arc.
 *
 * The wing fills bottom-up in horizontal bands; the arc fills side-to-middle in
 * vertical columns (from its outer edge toward the center).
 */
function isLeftWingSeat(seat: SeatPosition): boolean {
  return seat.col <= LEFT_WING_MAX_COL
}

function isRightWingSeat(seat: SeatPosition): boolean {
  return seat.col >= RIGHT_WING_MIN_COL
}

function isArcSeat(seat: SeatPosition): boolean {
  return !isLeftWingSeat(seat) && !isRightWingSeat(seat)
}

/** Left-to-right across the arc; within a column, top-to-bottom. */
function orderArcSeatsForReveal(seats: SeatPosition[]): SeatPosition[] {
  return [...seats].sort((left, right) => {
    if (left.x !== right.x) {
      return left.x - right.x
    }

    return left.y - right.y
  })
}

/** Top-to-bottom down the right wing; within a row, outer edge (right) first. */
function orderRightWingSeatsForReveal(seats: SeatPosition[]): SeatPosition[] {
  return [...seats].sort((left, right) => {
    if (left.y !== right.y) {
      return left.y - right.y
    }

    return right.x - left.x
  })
}

/**
 * Spatial reveal order for the entrance animation: left wing (bottom-left
 * first), then the shared top arc (left-to-right), then the right wing (top-to-bottom).
 */
function computeSeatRevealSequence(seats: SeatPosition[]): SeatPosition[] {
  const leftWing = seats.filter(isLeftWingSeat)
  const arc = seats.filter(isArcSeat)
  const rightWing = seats.filter(isRightWingSeat)

  return [
    ...orderSeatsBottomUp(leftWing, true),
    ...orderArcSeatsForReveal(arc),
    ...orderRightWingSeatsForReveal(rightWing),
  ]
}

function buildSeatRevealOrderMap(
  seats: SeatPosition[],
): ReadonlyMap<number, number> {
  const map = new Map<number, number>()

  computeSeatRevealSequence(seats).forEach((seat, order) => {
    map.set(seat.index, order)
  })

  return map
}

const _seatPositions = computeSeatPositions()

export const SEAT_REVEAL_ORDER = buildSeatRevealOrderMap(_seatPositions)

export const ARC_REVEAL_START_INDEX = Math.min(
  ..._seatPositions
    .filter(isArcSeat)
    .map((seat) => SEAT_REVEAL_ORDER.get(seat.index) ?? 0),
)

export const SEAT_REVEAL_STAGGER_MS = 25
export const SEAT_REVEAL_DURATION_MS = 350

function orderRegionForFill(
  seats: SeatPosition[],
  side: 'left' | 'right',
): SeatPosition[] {
  const xAscending = side === 'left'
  const isWingSeat = (seat: SeatPosition) =>
    side === 'left'
      ? seat.col <= LEFT_WING_MAX_COL
      : seat.col >= RIGHT_WING_MIN_COL

  const wingSeats = seats.filter(isWingSeat)
  const arcSeats = seats.filter((seat) => !isWingSeat(seat))

  return [
    ...orderSeatsBottomUp(wingSeats, xAscending),
    ...orderSeatsSideToMiddle(arcSeats, xAscending),
  ]
}

function countMembers(groups: FactionGroup[]): number {
  return groups.reduce((sum, group) => sum + group.members.length, 0)
}

function fillRegion(
  groups: FactionGroup[],
  regionSeats: SeatPosition[],
  placed: Array<PlacedMember | undefined>,
): void {
  let pointer = 0

  for (const group of groups) {
    for (const member of group.members) {
      if (pointer >= regionSeats.length) {
        return
      }

      const seat = regionSeats[pointer]
      placed[seat.index] = {
        seatIndex: seat.index,
        x: seat.x,
        y: seat.y,
        fullName: member.fullName,
        imageUrl: member.imageUrl,
        factionName: group.factionName,
        factionColor: group.factionColor,
        isCoalition: group.isCoalition,
        knessetNumber: member.knessetNumber,
        firstElectedYear: member.firstElectedYear,
        totalDaysInKnesset: member.totalDaysInKnesset,
        totalYearsInKnesset: member.totalYearsInKnesset,
      }
      pointer += 1
    }
  }
}

function assignMembersToSeats(
  coalitionGroups: FactionGroup[],
  oppositionGroups: FactionGroup[],
  seatPositions: SeatPosition[],
): PlacedMember[] {
  const placed: Array<PlacedMember | undefined> = []

  // Split the hemicycle into a left (coalition) and right (opposition) region
  // by taking the leftmost `coalitionCount` seats for the coalition.
  const orderedSeats = orderSeatsLeftToRight(seatPositions)
  const coalitionCount = Math.min(
    countMembers(coalitionGroups),
    orderedSeats.length,
  )
  const coalitionSeats = orderedSeats.slice(0, coalitionCount)
  const oppositionSeats = orderedSeats.slice(coalitionCount)

  // Fill each wing bottom-up in horizontal bands, keeping factions contiguous:
  // the largest faction (first in each sorted bloc) lands on the bottom rows,
  // smaller factions stack above, and only leftover factions spill into the arc.
  fillRegion(coalitionGroups, orderRegionForFill(coalitionSeats, 'left'), placed)
  fillRegion(
    oppositionGroups,
    orderRegionForFill(oppositionSeats, 'right'),
    placed,
  )

  return seatPositions.map((seat, index) => {
    const member = placed[index]

    if (member) {
      return member
    }

    return {
      seatIndex: seat.index,
      x: seat.x,
      y: seat.y,
      fullName: '',
      imageUrl: null,
      factionName: null,
      factionColor: null,
      isCoalition: false,
      knessetNumber: null,
      firstElectedYear: null,
      totalDaysInKnesset: 0,
      totalYearsInKnesset: 0,
    }
  })
}

function splitGroupsBySeatHalf(
  groups: FactionGroup[],
): [FactionGroup[], FactionGroup[]] {
  const total = countMembers(groups)
  const threshold = total / 2
  const left: FactionGroup[] = []
  const right: FactionGroup[] = []
  let leftSeats = 0

  for (const group of groups) {
    if (leftSeats < threshold) {
      left.push(group)
      leftSeats += group.members.length
    } else {
      right.push(group)
    }
  }

  if (right.length === 0 && left.length > 1) {
    const last = left.pop()
    if (last) {
      right.push(last)
    }
  }

  return [left, right]
}

function assignMembersToSeatsFactionOnly(
  groups: FactionGroup[],
  seatPositions: SeatPosition[],
): PlacedMember[] {
  const sorted = sortFactionGroupsBySize(groups)
  const [leftGroups, rightGroups] = splitGroupsBySeatHalf(sorted)

  return assignMembersToSeats(leftGroups, rightGroups, seatPositions)
}

export type HemicycleLayoutOptions = {
  splitByBloc?: boolean
}

export function buildFactionGroups(
  members: Array<{
    factionId: number | null
    factionName: string | null
    factionColor: string | null
    factionLogoUrl: string | null
    isCoalition: boolean
    fullName: string
    imageUrl: string | null
    knessetNumber: number | null
    firstElectedYear: number | null
    totalDaysInKnesset: number
    totalYearsInKnesset: number
  }>,
  options?: HemicycleLayoutOptions,
): FactionGroup[] {
  return groupMembersByFaction(members, options?.splitByBloc ?? true)
}

export function buildHemicycleLayout(
  members: Array<{
    factionId: number | null
    factionName: string | null
    factionColor: string | null
    factionLogoUrl: string | null
    isCoalition: boolean
    fullName: string
    imageUrl: string | null
    knessetNumber: number | null
    firstElectedYear: number | null
    totalDaysInKnesset: number
    totalYearsInKnesset: number
  }>,
  options?: HemicycleLayoutOptions,
): PlacedMember[] {
  const splitByBloc = options?.splitByBloc ?? true
  const seatPositions = computeSeatPositions()
  const groups = groupMembersByFaction(members, splitByBloc)

  if (!splitByBloc) {
    return assignMembersToSeatsFactionOnly(groups, seatPositions)
  }

  const coalitionGroups = groups.filter((group) => group.isCoalition)
  const oppositionGroups = groups.filter((group) => !group.isCoalition)

  return assignMembersToSeats(coalitionGroups, oppositionGroups, seatPositions)
}

export function buildSkeletonLayout(): PlacedMember[] {
  return computeSeatPositions().map((seat) => ({
    seatIndex: seat.index,
    x: seat.x,
    y: seat.y,
    fullName: '',
    imageUrl: null,
    factionName: null,
    factionColor: null,
    isCoalition: false,
    knessetNumber: null,
    firstElectedYear: null,
    totalDaysInKnesset: 0,
    totalYearsInKnesset: 0,
  }))
}

export function getInitials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean)

  if (parts.length === 0) {
    return '?'
  }

  if (parts.length === 1) {
    return parts[0].slice(0, 2)
  }

  return `${parts[0][0] ?? ''}${parts[parts.length - 1][0] ?? ''}`
}

export function tintColor(hex: string, alpha = 0.2): string {
  const normalized = hex.replace('#', '')

  if (normalized.length === 6) {
    const red = Number.parseInt(normalized.slice(0, 2), 16)
    const green = Number.parseInt(normalized.slice(2, 4), 16)
    const blue = Number.parseInt(normalized.slice(4, 6), 16)

    return `rgba(${red}, ${green}, ${blue}, ${alpha})`
  }

  const hslMatch = hex.match(/^hsl\((\d+),\s*([\d.]+)%,\s*([\d.]+)%\)$/)

  if (hslMatch) {
    const [, hue, saturation, lightness] = hslMatch
    return `hsla(${hue}, ${saturation}%, ${lightness}%, ${alpha})`
  }

  return `rgba(180, 180, 180, ${alpha})`
}

function hashString(value: string): number {
  let hash = 0

  for (let index = 0; index < value.length; index += 1) {
    hash = Math.imul(31, hash) + value.charCodeAt(index)
    hash = Math.imul(hash ^ (hash >>> 16), 0x45d9f3b)
    hash = hash ^ (hash >>> 16)
  }

  return Math.abs(hash)
}

export function factionColorFromId(
  factionId: number | null,
  factionName?: string | null,
): string {
  if (factionId !== null) {
    let hash = factionId
    hash = Math.imul(hash ^ (hash >>> 16), 0x45d9f3b)
    hash = Math.imul(hash ^ (hash >>> 16), 0x45d9f3b)
    hash = hash ^ (hash >>> 16)
    const hue = Math.abs(hash) % 360

    return `hsl(${hue}, 55%, 45%)`
  }

  if (factionName?.trim()) {
    const hue = hashString(factionName.trim()) % 360
    return `hsl(${hue}, 55%, 45%)`
  }

  return '#c8c8c8'
}

export function resolveFactionColor(
  factionId: number | null,
  color: string | null | undefined,
  factionName?: string | null,
): string {
  const dbColor = color?.trim()

  if (dbColor) {
    return dbColor
  }

  return factionColorFromId(factionId, factionName)
}

export function donutDashArray(
  coalitionCount: number,
  oppositionCount: number,
  circumference: number,
): { coalition: string; opposition: string; coalitionOffset: number } {
  const total = coalitionCount + oppositionCount

  if (total === 0) {
    return {
      coalition: `0 ${circumference}`,
      opposition: `0 ${circumference}`,
      coalitionOffset: 0,
    }
  }

  const coalitionLength = (coalitionCount / total) * circumference
  const oppositionLength = (oppositionCount / total) * circumference

  return {
    coalition: `${coalitionLength} ${circumference - coalitionLength}`,
    opposition: `${oppositionLength} ${circumference - oppositionLength}`,
    coalitionOffset: coalitionLength,
  }
}

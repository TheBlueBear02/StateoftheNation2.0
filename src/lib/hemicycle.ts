export const GRID_COLS = 19
export const GRID_ROWS = 14
export const CELL = 40

export const HEMICYCLE_VIEWBOX = {
  width: GRID_COLS * CELL,
  height: GRID_ROWS * CELL,
} as const

/** 'X' = seat, '.' = empty (center void or corner aisle) */
export const SEAT_GRID: readonly string[] = [
  'X...XXXXXXXXXXX...X',
  'XX...XXXXXXXXX...XX',
  'XXX...XXXXXXX...XXX',
  'XXXX...XXXXX...XXXX',
  'XXXX...........XXXX',
  'XXXX...........XXXX',
  'XXXX...........XXXX',
  'XXXX...........XXXX',
  'XXXX...........XXXX',
  'XXXX...........XXXX',
  'XXXX...........XXXX',
  'XXX.............XXX',
  'XX...............XX',
  'X.................X',
]

export const TOTAL_SEATS = SEAT_GRID.reduce(
  (sum, row) => sum + [...row].filter((cell) => cell === 'X').length,
  0,
)

export const COALITION_COLOR = '#4890fd'
export const OPPOSITION_COLOR = '#ff6200'

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
}

export type FactionGroup = {
  factionId: number | null
  factionName: string
  factionColor: string | null
  isCoalition: boolean
  members: Array<{
    fullName: string
    imageUrl: string | null
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
        y: rowIndex * CELL + CELL / 2,
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

function groupMembersByFaction(
  members: Array<{
    factionId: number | null
    factionName: string | null
    factionColor: string | null
    isCoalition: boolean
    fullName: string
    imageUrl: string | null
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
      })
      continue
    }

    groups.set(key, {
      factionId: key,
      factionName: member.factionName ?? 'ללא סיעה',
      factionColor: member.factionColor,
      isCoalition: member.isCoalition,
      members: [
        {
          fullName: member.fullName,
          imageUrl: member.imageUrl,
        },
      ],
    })
  }

  return sortFactionGroups([...groups.values()])
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
    }
  })
}

export function buildFactionGroups(
  members: Array<{
    factionId: number | null
    factionName: string | null
    factionColor: string | null
    isCoalition: boolean
    fullName: string
    imageUrl: string | null
  }>,
): FactionGroup[] {
  return groupMembersByFaction(members)
}

export function buildHemicycleLayout(
  members: Array<{
    factionId: number | null
    factionName: string | null
    factionColor: string | null
    isCoalition: boolean
    fullName: string
    imageUrl: string | null
  }>,
): PlacedMember[] {
  const seatPositions = computeSeatPositions()
  const groups = groupMembersByFaction(members)
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

  if (normalized.length !== 6) {
    return `rgba(180, 180, 180, ${alpha})`
  }

  const red = Number.parseInt(normalized.slice(0, 2), 16)
  const green = Number.parseInt(normalized.slice(2, 4), 16)
  const blue = Number.parseInt(normalized.slice(4, 6), 16)

  return `rgba(${red}, ${green}, ${blue}, ${alpha})`
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

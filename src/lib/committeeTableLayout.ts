import type { CommitteeMember, CommitteeSeatRole } from './committeeTypes'

export type LaidOutSeatKind = 'member' | 'legal_counsel' | 'committee_manager'

export type LaidOutSeat = {
  key: string
  kind: LaidOutSeatKind
  x: number
  y: number
  member: CommitteeMember | null
  label: string
  /** False when protocol attendance exists and this MK was not listed as present. */
  attended: boolean
}

/** Portrait viewBox — tall racetrack table for mobile. */
const VIEW_W = 420
const VIEW_H = 720
const CX = VIEW_W / 2
const CY = VIEW_H / 2 + 8

/**
 * Outer / inner rounded-rect (racetrack): straighter long sides,
 * rounded ends — less “ellipse” than the previous shape.
 */
const OUTER = { w: 250, h: 520, r: 78 }
const INNER = { w: 100, h: 340, r: 42 }
const SEAT_PAD = 44
const MAX_SIDE_SEATS = 22

const OUTER_X = CX - OUTER.w / 2
const OUTER_Y = CY - OUTER.h / 2
const INNER_X = CX - INNER.w / 2
const INNER_Y = CY - INNER.h / 2

export const COMMITTEE_TABLE_VIEWBOX = `0 0 ${VIEW_W} ${VIEW_H}`

export const COMMITTEE_TABLE_GEOMETRY = {
  cx: CX,
  cy: CY,
  outerX: OUTER_X,
  outerY: OUTER_Y,
  outerW: OUTER.w,
  outerH: OUTER.h,
  outerR: OUTER.r,
  innerX: INNER_X,
  innerY: INNER_Y,
  innerW: INNER.w,
  innerH: INNER.h,
  innerR: INNER.r,
  viewW: VIEW_W,
  viewH: VIEW_H,
}

function roleRank(role: CommitteeSeatRole): number {
  switch (role) {
    case 'chair':
      return 0
    case 'legal_counsel':
      return 1
    case 'committee_manager':
      return 2
    case 'member':
      return 3
    case 'alternate':
      return 4
    case 'observer':
      return 5
    default:
      return 6
  }
}

type RoundedRect = { x: number; y: number; w: number; h: number; r: number }

function clampRadius(rect: RoundedRect): number {
  return Math.min(rect.r, rect.w / 2, rect.h / 2)
}

/** Point on rounded-rect perimeter; t in [0, 1), starting at top-center, clockwise. */
function pointOnRoundedRect(rect: RoundedRect, t: number): { x: number; y: number } {
  const r = clampRadius(rect)
  const { x, y, w, h } = rect
  const straightW = Math.max(0, w - 2 * r)
  const straightH = Math.max(0, h - 2 * r)
  const arc = (Math.PI / 2) * r
  const segments = [
    straightW / 2, // top center → top-right before corner
    arc, // top-right corner
    straightH, // right side
    arc, // bottom-right
    straightW, // bottom
    arc, // bottom-left
    straightH, // left
    arc, // top-left
    straightW / 2, // top left → top center
  ]
  const total = segments.reduce((a, b) => a + b, 0)
  let dist = ((t % 1) + 1) % 1 * total

  // 0: top edge from center to right
  if (dist <= segments[0]!) {
    return { x: x + w / 2 + dist, y: y }
  }
  dist -= segments[0]!

  // 1: top-right quarter (from north to east)
  if (dist <= segments[1]!) {
    const a = -Math.PI / 2 + dist / r
    return { x: x + w - r + r * Math.cos(a), y: y + r + r * Math.sin(a) }
  }
  dist -= segments[1]!

  // 2: right edge top→bottom
  if (dist <= segments[2]!) {
    return { x: x + w, y: y + r + dist }
  }
  dist -= segments[2]!

  // 3: bottom-right quarter (east → south)
  if (dist <= segments[3]!) {
    const a = 0 + dist / r
    return { x: x + w - r + r * Math.cos(a), y: y + h - r + r * Math.sin(a) }
  }
  dist -= segments[3]!

  // 4: bottom edge right→left
  if (dist <= segments[4]!) {
    return { x: x + w - r - dist, y: y + h }
  }
  dist -= segments[4]!

  // 5: bottom-left quarter (south → west)
  if (dist <= segments[5]!) {
    const a = Math.PI / 2 + dist / r
    return { x: x + r + r * Math.cos(a), y: y + h - r + r * Math.sin(a) }
  }
  dist -= segments[5]!

  // 6: left edge bottom→top
  if (dist <= segments[6]!) {
    return { x: x, y: y + h - r - dist }
  }
  dist -= segments[6]!

  // 7: top-left quarter (west → north)
  if (dist <= segments[7]!) {
    const a = Math.PI + dist / r
    return { x: x + r + r * Math.cos(a), y: y + r + r * Math.sin(a) }
  }
  dist -= segments[7]!

  // 8: top edge left→center
  return { x: x + r + dist, y: y }
}

function seatOrbitRect(): RoundedRect {
  return {
    x: OUTER_X - SEAT_PAD,
    y: OUTER_Y - SEAT_PAD,
    w: OUTER.w + SEAT_PAD * 2,
    h: OUTER.h + SEAT_PAD * 2,
    r: OUTER.r + SEAT_PAD * 0.55,
  }
}

/**
 * Place chair at the head (top), legal counsel and committee manager on the
 * MK orbit beside them, remaining members around the racetrack perimeter.
 *
 * Orbit MKs (everyone except chair / יועמ״ש / מנהל/ת) are ordered clockwise
 * from the top-right by session message count (most speeches first). Ties
 * break by committee membership (חברי ועדה before guests), then attendance,
 * then role, then Hebrew name.
 *
 * When `attendedPersonIds` is provided, seats whose person is not in the set
 * are marked `attended: false` (gray photo in the UI). When null, everyone
 * counts as attended (no attendance data for the session).
 */
export function layoutCommitteeSeats(
  members: CommitteeMember[],
  attendedPersonIds: Set<number> | null = null,
  messageCountByPersonId: Map<number, number> | null = null,
): {
  seats: LaidOutSeat[]
  overflowCount: number
} {
  const isAttended = (personId: number | undefined | null): boolean => {
    if (attendedPersonIds == null || personId == null) {
      return true
    }
    return attendedPersonIds.has(personId)
  }

  const messageCount = (personId: number): number =>
    messageCountByPersonId?.get(personId) ?? 0

  const compareMembers = (a: CommitteeMember, b: CommitteeMember): number => {
    const byMessages = messageCount(b.personId) - messageCount(a.personId)
    if (byMessages !== 0) {
      return byMessages
    }
    // Same speech volume: חברי ועדה before guest MKs.
    const aGuest = a.isGuestMk ? 1 : 0
    const bGuest = b.isGuestMk ? 1 : 0
    if (aGuest !== bGuest) {
      return aGuest - bGuest
    }
    if (attendedPersonIds != null) {
      const aPresent = attendedPersonIds.has(a.personId) ? 0 : 1
      const bPresent = attendedPersonIds.has(b.personId) ? 0 : 1
      if (aPresent !== bPresent) {
        return aPresent - bPresent
      }
    }
    const rank = roleRank(a.seatRole) - roleRank(b.seatRole)
    if (rank !== 0) {
      return rank
    }
    return a.fullName.localeCompare(b.fullName, 'he')
  }

  const chair = members.find((m) => m.seatRole === 'chair') ?? null
  const counsel =
    members.find((m) => m.seatRole === 'legal_counsel') ?? null
  const manager =
    members.find((m) => m.seatRole === 'committee_manager') ?? null
  // Clockwise from top-right: highest message count first.
  const others = members
    .filter(
      (m) =>
        m.personId !== chair?.personId &&
        m.seatRole !== 'legal_counsel' &&
        m.seatRole !== 'committee_manager',
    )
    .sort(compareMembers)
  const orbit = seatOrbitRect()
  const seats: LaidOutSeat[] = []

  const chairPos = pointOnRoundedRect(orbit, 0)
  seats.push({
    key: chair ? `person-${chair.personId}` : 'chair-empty',
    kind: 'member',
    x: chairPos.x,
    y: chairPos.y,
    member: chair,
    label: chair?.fullName ?? 'יו״ר',
    attended: isAttended(chair?.personId),
  })

  // Staff seats flank the chair on the MK orbit (manager left, counsel right).
  const managerT = 1 - 0.042
  const managerPos = pointOnRoundedRect(orbit, managerT)
  seats.push({
    key: manager ? `person-${manager.personId}` : 'committee-manager',
    kind: 'committee_manager',
    x: managerPos.x,
    y: managerPos.y,
    member: manager,
    label: manager?.fullName ?? 'מנהל/ת',
    attended: true,
  })

  const counselT = 0.042
  const counselPos = pointOnRoundedRect(orbit, counselT)
  seats.push({
    key: counsel ? `person-${counsel.personId}` : 'legal-counsel',
    kind: 'legal_counsel',
    x: counselPos.x,
    y: counselPos.y,
    member: counsel,
    label: counsel?.fullName ?? 'יועמ״ש',
    attended: true,
  })

  const displayOthers = others.slice(0, MAX_SIDE_SEATS)
  const overflowCount = Math.max(0, others.length - displayOthers.length)

  if (displayOthers.length === 0) {
    return { seats, overflowCount }
  }

  // Clear arc at the head for chair + staff so member seats don't collide.
  // Staff sit at ±0.042; keep members just past them so the ring feels tight.
  const headGap = 0.088
  const start = headGap
  const sweep = 1 - headGap * 2
  const n = displayOthers.length

  displayOthers.forEach((member, index) => {
    const u = n === 1 ? 0.5 : index / (n - 1)
    const t = start + u * sweep
    const pos = pointOnRoundedRect(orbit, t)
    seats.push({
      key: `person-${member.personId}`,
      kind: 'member',
      x: pos.x,
      y: pos.y,
      member,
      label: member.fullName,
      attended: isAttended(member.personId),
    })
  })

  return { seats, overflowCount }
}

export function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) {
    return '?'
  }
  if (parts.length === 1) {
    return parts[0]!.slice(0, 2)
  }
  return `${parts[0]!.slice(0, 1)}${parts[parts.length - 1]!.slice(0, 1)}`
}

export function roundedRectPath(
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): string {
  const rr = Math.min(r, w / 2, h / 2)
  return [
    `M ${x + rr} ${y}`,
    `H ${x + w - rr}`,
    `A ${rr} ${rr} 0 0 1 ${x + w} ${y + rr}`,
    `V ${y + h - rr}`,
    `A ${rr} ${rr} 0 0 1 ${x + w - rr} ${y + h}`,
    `H ${x + rr}`,
    `A ${rr} ${rr} 0 0 1 ${x} ${y + h - rr}`,
    `V ${y + rr}`,
    `A ${rr} ${rr} 0 0 1 ${x + rr} ${y}`,
    'Z',
  ].join(' ')
}

/** Hollow racetrack ring (outer rounded rect minus inner hole). */
export function committeeTableRingPath(): string {
  const outer = roundedRectPath(OUTER_X, OUTER_Y, OUTER.w, OUTER.h, OUTER.r)
  const inner = roundedRectPath(INNER_X, INNER_Y, INNER.w, INNER.h, INNER.r)
  // evenodd: draw outer, then inner in opposite winding via reverse arcs — simpler to
  // concatenate both closed paths; evenodd punches the second.
  return `${outer} ${inner}`
}

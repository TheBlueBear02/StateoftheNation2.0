import type {
  LaidOutEvent,
  Person,
  SharedEvent,
  TimelineEra,
  TimelineEvent,
  TimelineEventKind,
} from '@/content/timeline/types'
import { dateToYear, eventYearRange, MIN_EVENT_YEARS } from './dates'

export const STATE_ROW_ID = '__state__'
export const STATE_COLOR = '#0038b8'
/** Emblem used for the state filter and state event blocks. */
export const STATE_EMBLEM = '/timeline/israel-logo.png'

/** Preferred number of shared horizontal event layers on the canvas. */
export const EVENT_LAYER_COUNT = 16

/** Fixed pixel height of each event block (layers no longer stretch to fill the canvas). */
export const EVENT_BLOCK_HEIGHT = 36

/** Vertical gap between event layers (split as top/bottom margin around each block). */
export const EVENT_LAYER_GAP = 16

/** Minimum clickable width for an event block (px). */
export const MIN_EVENT_WIDTH_PX = 28

/** Horizontal gap between neighboring event blocks on the same layer (px). */
export const EVENT_H_GAP_PX = 3

/** True when the portrait public path is a PNG (SVG placeholders are not shown). */
export function hasPngPortrait(portrait: string): boolean {
  return /\.png(\?|$)/i.test(portrait)
}

/** People eligible for the public timeline (must have a PNG portrait). */
export function peopleWithPngPortraits(people: Person[]): Person[] {
  return people.filter((p) => hasPngPortrait(p.portrait))
}

/** Slot height used when stacking layers from the top. */
export const EVENT_LAYER_SLOT =
  EVENT_BLOCK_HEIGHT + EVENT_LAYER_GAP

/** Height of the top era band (above event layers). */
export const ERA_BAND_HEIGHT = 32

/** Vertical gap between the era band and the first event layer. */
export const ERA_TO_EVENTS_GAP = 10

export interface TimelineRow {
  id: string
  kind: 'state' | 'person'
  person?: Person
  label: string
  color: string
  portrait?: string
  /** Collapsed when the person/state toggle is off. */
  collapsed?: boolean
}

interface RawEvent {
  event: TimelineEvent
  kind: TimelineEventKind
  personIds: string[]
  colors: string[]
  portraits: string[]
  startYear: number
  endYear: number
}

/**
 * Order people by birth year for the portrait filter column.
 * Shared-event participants stay near each other when cheap (≤8 people).
 */
export function orderRows(
  people: Person[],
  sharedEvents: SharedEvent[],
): Person[] {
  if (people.length <= 1) return [...people]

  const birthOrder = [...people].sort((a, b) => {
    const ay = a.birthDate ? dateToYear(a.birthDate) : 0
    const by = b.birthDate ? dateToYear(b.birthDate) : 0
    return ay - by
  })

  const birthIndex = new Map(birthOrder.map((p, i) => [p.id, i]))
  const groups = sharedEvents
    .map((e) => e.personIds.filter((id) => people.some((p) => p.id === id)))
    .filter((g) => g.length >= 2)

  if (groups.length === 0) return birthOrder

  const scoreOrder = (order: Person[]): [number, number, number] => {
    const index = new Map(order.map((p, i) => [p.id, i]))
    let nonContiguous = 0
    let spanSum = 0
    for (const group of groups) {
      const positions = group
        .map((id) => index.get(id))
        .filter((v): v is number => v !== undefined)
        .sort((a, b) => a - b)
      if (positions.length < 2) continue
      const span = positions[positions.length - 1] - positions[0]
      spanSum += span
      const contiguous =
        positions[positions.length - 1] - positions[0] === positions.length - 1
      if (!contiguous) nonContiguous += 1
    }
    let birthDistance = 0
    for (let i = 0; i < order.length; i++) {
      birthDistance += Math.abs(i - (birthIndex.get(order[i].id) ?? i))
    }
    return [nonContiguous, spanSum, birthDistance]
  }

  const better = (a: [number, number, number], b: [number, number, number]) => {
    for (let i = 0; i < 3; i++) {
      if (a[i] < b[i]) return true
      if (a[i] > b[i]) return false
    }
    return false
  }

  if (people.length <= 8) {
    let best = birthOrder
    let bestScore = scoreOrder(best)
    const permute = (arr: Person[], start: number) => {
      if (start === arr.length) {
        const score = scoreOrder(arr)
        if (better(score, bestScore)) {
          bestScore = score
          best = [...arr]
        }
        return
      }
      for (let i = start; i < arr.length; i++) {
        ;[arr[start], arr[i]] = [arr[i], arr[start]]
        permute(arr, start + 1)
        ;[arr[start], arr[i]] = [arr[i], arr[start]]
      }
    }
    permute([...birthOrder], 0)
    return best
  }

  let current = [...birthOrder]
  let currentScore = scoreOrder(current)
  let improved = true
  while (improved) {
    improved = false
    for (let i = 0; i < current.length - 1; i++) {
      const next = [...current]
      ;[next[i], next[i + 1]] = [next[i + 1], next[i]]
      const score = scoreOrder(next)
      if (better(score, currentScore)) {
        current = next
        currentScore = score
        improved = true
      }
    }
  }
  return current
}

/** Build filter-column entries (state + people). Not tied to canvas layers. */
export function buildRows(
  orderedPeople: Person[],
  visiblePersonIds: Set<string>,
  includeState: boolean,
): TimelineRow[] {
  const rows: TimelineRow[] = []
  rows.push({
    id: STATE_ROW_ID,
    kind: 'state',
    label: 'מדינת ישראל',
    color: STATE_COLOR,
    collapsed: !includeState,
  })
  for (const person of orderedPeople) {
    const visible = visiblePersonIds.has(person.id)
    rows.push({
      id: person.id,
      kind: 'person',
      person,
      label: person.name,
      color: person.color,
      portrait: person.portrait,
      collapsed: !visible,
    })
  }
  return rows
}

function rangesOverlap(
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number,
): boolean {
  return aStart < bEnd && aEnd > bStart
}

/**
 * Which people / state have at least one event intersecting the current
 * viewport year range (solo or shared). Used to slim the left portrait bar
 * when zoomed into an era.
 */
export function entitiesInViewport(
  people: Person[],
  stateEvents: TimelineEvent[],
  sharedEvents: SharedEvent[],
  viewStart: number,
  viewEnd: number,
): { personIds: Set<string>; stateInView: boolean } {
  const personIds = new Set<string>()

  for (const person of people) {
    for (const event of person.events) {
      const { startYear, endYear } = eventYearRange(
        event.startDate,
        event.endDate,
      )
      if (rangesOverlap(startYear, endYear, viewStart, viewEnd)) {
        personIds.add(person.id)
        break
      }
    }
  }

  for (const event of sharedEvents) {
    const { startYear, endYear } = eventYearRange(event.startDate, event.endDate)
    if (!rangesOverlap(startYear, endYear, viewStart, viewEnd)) continue
    for (const id of event.personIds) personIds.add(id)
  }

  let stateInView = false
  for (const event of stateEvents) {
    const { startYear, endYear } = eventYearRange(event.startDate, event.endDate)
    if (rangesOverlap(startYear, endYear, viewStart, viewEnd)) {
      stateInView = true
      break
    }
  }

  return { personIds, stateInView }
}

function collectRawEvents(
  people: Person[],
  stateEvents: TimelineEvent[],
  sharedEvents: SharedEvent[],
  visiblePersonIds: Set<string>,
  includeState: boolean,
  colorByPerson: Map<string, string>,
  portraitByPerson: Map<string, string>,
): RawEvent[] {
  const raw: RawEvent[] = []

  if (includeState) {
    for (const event of stateEvents) {
      const range = eventYearRange(event.startDate, event.endDate)
      raw.push({
        event,
        kind: 'state',
        personIds: [],
        colors: [STATE_COLOR],
        portraits: [],
        ...range,
      })
    }
  }

  for (const person of people) {
    if (!visiblePersonIds.has(person.id)) continue
    for (const event of person.events) {
      const range = eventYearRange(event.startDate, event.endDate)
      raw.push({
        event,
        kind: 'person',
        personIds: [person.id],
        colors: [person.color],
        portraits: [person.portrait],
        ...range,
      })
    }
  }

  for (const event of sharedEvents) {
    const visibleParticipants = event.personIds.filter((id) =>
      visiblePersonIds.has(id),
    )
    if (visibleParticipants.length === 0) continue
    const range = eventYearRange(event.startDate, event.endDate)
    raw.push({
      event,
      kind: 'shared',
      personIds: visibleParticipants,
      colors: visibleParticipants.map(
        (id) => colorByPerson.get(id) ?? '#888888',
      ),
      portraits: visibleParticipants
        .map((id) => portraitByPerson.get(id))
        .filter((p): p is string => Boolean(p)),
      ...range,
    })
  }

  return raw
}

/**
 * Lane search order: middle first, then alternate below / above
 * (lane 0 is the top of the canvas).
 */
export function middleOutLaneOrder(layerCount: number): number[] {
  const n = Math.max(layerCount, 1)
  const middle = Math.floor((n - 1) / 2)
  const order = [middle]
  for (let d = 1; d < n; d++) {
    if (middle + d < n) order.push(middle + d)
    if (middle - d >= 0) order.push(middle - d)
  }
  return order
}

/**
 * Prefer lanes already used by the event's people, then neighbors of that
 * cluster, then the global middle-out fallback.
 */
export function personClusterLaneOrder(
  personIds: string[],
  personLanes: Map<string, Set<number>>,
  baseLayers: number,
  fallback: number[],
): number[] {
  const anchors = new Set<number>()
  for (const id of personIds) {
    const set = personLanes.get(id)
    if (!set) continue
    for (const lane of set) anchors.add(lane)
  }
  if (anchors.size === 0) return fallback

  const anchorList = [...anchors].sort((a, b) => a - b)
  const center = anchorList[Math.floor((anchorList.length - 1) / 2)]
  const order: number[] = []
  const seen = new Set<number>()
  const push = (lane: number) => {
    if (lane < 0 || seen.has(lane)) return
    seen.add(lane)
    order.push(lane)
  }

  // Reuse the person's existing lanes first (same layer when free)
  for (const lane of anchorList) push(lane)

  // Then grow to neighboring layers around the cluster center
  const maxAnchor = anchorList[anchorList.length - 1] ?? center
  const reach = Math.max(baseLayers, maxAnchor) + baseLayers
  for (let d = 1; d <= reach; d++) {
    push(center + d)
    push(center - d)
  }

  for (const lane of fallback) push(lane)
  return order
}

/**
 * Pack all visible events into a shared pool of horizontal layers.
 * Starts at the middle layer, then fills outward below and above.
 * Same-person events prefer neighboring layers around that person's cluster.
 * Collision uses the *visual* span (min width + horizontal gap at zoom).
 * Uses at least EVENT_LAYER_COUNT layers; grows downward if more needed.
 */
export function layoutEvents(
  people: Person[],
  stateEvents: TimelineEvent[],
  sharedEvents: SharedEvent[],
  visiblePersonIds: Set<string>,
  includeState: boolean,
  pixelsPerYear = 1,
): { events: LaidOutEvent[]; layerCount: number } {
  const colorByPerson = new Map(people.map((p) => [p.id, p.color]))
  const portraitByPerson = new Map(people.map((p) => [p.id, p.portrait]))
  const raw = collectRawEvents(
    people,
    stateEvents,
    sharedEvents,
    visiblePersonIds,
    includeState,
    colorByPerson,
    portraitByPerson,
  )

  const minYears =
    pixelsPerYear > 0 ? MIN_EVENT_WIDTH_PX / pixelsPerYear : MIN_EVENT_YEARS
  const gapYears =
    pixelsPerYear > 0 ? EVENT_H_GAP_PX / pixelsPerYear : 0

  const withVisual = raw.map((item) => {
    const dataSpan = item.endYear - item.startYear
    const visualEnd =
      item.startYear + Math.max(dataSpan, minYears) + gapYears
    return { ...item, visualEnd }
  })

  withVisual.sort(
    (a, b) => a.startYear - b.startYear || a.visualEnd - b.visualEnd,
  )

  const baseLayers = Math.max(EVENT_LAYER_COUNT, 1)
  const preferredLanes = middleOutLaneOrder(baseLayers)
  const occupied: { lane: number; visualEnd: number }[] = []
  const personLanes = new Map<string, Set<number>>()
  let maxLane = -1
  const laidOut: LaidOutEvent[] = []

  const laneFree = (lane: number, startYear: number) =>
    !occupied.some((o) => o.lane === lane && o.visualEnd > startYear)

  const rememberPersonLane = (personIds: string[], lane: number) => {
    for (const id of personIds) {
      let set = personLanes.get(id)
      if (!set) {
        set = new Set()
        personLanes.set(id, set)
      }
      set.add(lane)
    }
  }

  for (const item of withVisual) {
    const candidates =
      item.personIds.length > 0
        ? personClusterLaneOrder(
            item.personIds,
            personLanes,
            baseLayers,
            preferredLanes,
          )
        : preferredLanes

    let lane = -1
    for (const candidate of candidates) {
      if (laneFree(candidate, item.startYear)) {
        lane = candidate
        break
      }
    }
    // Overflow: grow downward past the preferred band
    if (lane < 0) {
      lane = Math.max(baseLayers, maxLane + 1)
      while (!laneFree(lane, item.startYear)) lane += 1
    }

    occupied.push({ lane, visualEnd: item.visualEnd })
    maxLane = Math.max(maxLane, lane)
    rememberPersonLane(item.personIds, lane)

    laidOut.push({
      event: item.event,
      kind: item.kind,
      personIds: item.personIds,
      portraits: item.portraits,
      lane,
      startYear: item.startYear,
      endYear: item.endYear,
      colors: item.colors,
    })
  }

  const needed = maxLane + 1
  const layerCount = Math.max(EVENT_LAYER_COUNT, needed, 1)

  return { events: laidOut, layerCount }
}

export function computeDataRange(
  people: Person[],
  stateEvents: TimelineEvent[],
  sharedEvents: SharedEvent[],
  eras: TimelineEra[] = [],
): { minYear: number; maxYear: number } {
  let minYear = Infinity
  let maxYear = -Infinity

  const consider = (start: string, end?: string) => {
    const range = eventYearRange(start, end)
    minYear = Math.min(minYear, range.startYear)
    maxYear = Math.max(maxYear, range.endYear)
  }

  for (const person of people) {
    if (person.birthDate) consider(person.birthDate, person.birthDate)
    if (person.deathDate) consider(person.deathDate, person.deathDate)
    for (const e of person.events) consider(e.startDate, e.endDate)
  }
  for (const e of stateEvents) consider(e.startDate, e.endDate)
  for (const e of sharedEvents) consider(e.startDate, e.endDate)
  for (const era of eras) consider(era.startDate, era.endDate)

  if (!Number.isFinite(minYear)) {
    minYear = 1948
    maxYear = 2000
  }

  const padding = Math.max(1, (maxYear - minYear) * 0.04)
  return { minYear: minYear - padding, maxYear: maxYear + padding }
}

/** Map a year to an x pixel within the canvas width. */
export function yearToX(
  year: number,
  viewStart: number,
  viewEnd: number,
  width: number,
): number {
  if (viewEnd <= viewStart) return 0
  return ((year - viewStart) / (viewEnd - viewStart)) * width
}

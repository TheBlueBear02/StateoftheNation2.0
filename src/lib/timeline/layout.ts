import type {
  LaidOutEvent,
  Person,
  SharedEvent,
  TimelineEvent,
  TimelineEventKind,
} from '@/content/timeline/types'
import { dateToYear, eventYearRange } from './dates'

export const STATE_ROW_ID = '__state__'
export const STATE_COLOR = '#0038b8'

export interface TimelineRow {
  id: string
  kind: 'state' | 'person'
  person?: Person
  label: string
  color: string
  portrait?: string
  laneCount: number
  /** Collapsed when the person/state toggle is off. */
  collapsed?: boolean
}

interface RawEvent {
  event: TimelineEvent
  kind: TimelineEventKind
  personIds: string[]
  colors: string[]
  startYear: number
  endYear: number
}

/**
 * Order people so shared-event participants sit in contiguous rows.
 * Starts from birth-year order; brute-force ≤8 people, greedy neighbor swaps otherwise.
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
      const contiguous = positions[positions.length - 1] - positions[0] === positions.length - 1
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
    laneCount: 1,
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
      laneCount: 1,
      collapsed: !visible,
    })
  }
  return rows
}

function collectRawEvents(
  people: Person[],
  stateEvents: TimelineEvent[],
  sharedEvents: SharedEvent[],
  visiblePersonIds: Set<string>,
  includeState: boolean,
  colorByPerson: Map<string, string>,
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
      ...range,
    })
  }

  return raw
}

/**
 * Assign sub-lanes so overlapping events in the same rows don't cover each other.
 * Shared events use the same lane index across all covered rows.
 */
export function assignLanes(
  rows: TimelineRow[],
  people: Person[],
  stateEvents: TimelineEvent[],
  sharedEvents: SharedEvent[],
  visiblePersonIds: Set<string>,
  includeState: boolean,
): { rows: TimelineRow[]; events: LaidOutEvent[] } {
  const rowIndex = new Map(rows.map((r, i) => [r.id, i]))
  const colorByPerson = new Map(people.map((p) => [p.id, p.color]))
  const raw = collectRawEvents(
    people,
    stateEvents,
    sharedEvents,
    visiblePersonIds,
    includeState,
    colorByPerson,
  )

  raw.sort((a, b) => a.startYear - b.startYear || a.endYear - b.endYear)

  // Per-row: list of { lane, endYear } occupied intervals
  const occupied: { lane: number; endYear: number }[][] = rows.map(() => [])
  const laneCounts = rows.map(() => 1)
  const laidOut: LaidOutEvent[] = []

  for (const item of raw) {
    let rowStart: number
    let rowEnd: number

    if (item.kind === 'state') {
      const idx = rowIndex.get(STATE_ROW_ID)
      if (idx === undefined) continue
      rowStart = idx
      rowEnd = idx
    } else {
      const indices = item.personIds
        .map((id) => rowIndex.get(id))
        .filter((v): v is number => v !== undefined)
        .sort((a, b) => a - b)
      if (indices.length === 0) continue
      rowStart = indices[0]
      rowEnd = indices[indices.length - 1]
    }

    let lane = 0
    // Find lowest lane free on ALL covered rows
    // eslint-disable-next-line no-constant-condition
    while (true) {
      let free = true
      for (let r = rowStart; r <= rowEnd; r++) {
        const conflicts = occupied[r].some(
          (o) => o.lane === lane && o.endYear > item.startYear,
        )
        if (conflicts) {
          free = false
          break
        }
      }
      if (free) break
      lane += 1
    }

    for (let r = rowStart; r <= rowEnd; r++) {
      occupied[r].push({ lane, endYear: item.endYear })
      if (!rows[r].collapsed) {
        laneCounts[r] = Math.max(laneCounts[r], lane + 1)
      }
    }

    laidOut.push({
      event: item.event,
      kind: item.kind,
      personIds: item.personIds,
      rowStart,
      rowEnd,
      lane,
      startYear: item.startYear,
      endYear: item.endYear,
      colors: item.colors,
    })
  }

  const updatedRows = rows.map((row, i) => ({
    ...row,
    laneCount: laneCounts[i],
  }))

  return { rows: updatedRows, events: laidOut }
}

export function computeDataRange(
  people: Person[],
  stateEvents: TimelineEvent[],
  sharedEvents: SharedEvent[],
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

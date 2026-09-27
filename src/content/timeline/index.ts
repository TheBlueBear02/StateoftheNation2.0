import herzl from './people/herzl.json'
import weizmann from './people/weizmann.json'
import jabotinsky from './people/jabotinsky.json'
import benGurion from './people/ben-gurion.json'
import goldaMeir from './people/golda-meir.json'
import begin from './people/begin.json'
import rabin from './people/rabin.json'
import stateEventsJson from './state-events.json'
import sharedEventsJson from './shared-events.json'
import erasJson from './eras.json'
import type {
  Person,
  SharedEvent,
  TimelineData,
  TimelineDate,
  TimelineEra,
  TimelineEvent,
} from './types'

const DATE_RE = /^\d{4}(-\d{2}(-\d{2})?)?$/

function assertDate(value: string, label: string): asserts value is TimelineDate {
  if (!DATE_RE.test(value)) {
    throw new Error(`Invalid timeline date for ${label}: ${value}`)
  }
  const parts = value.split('-').map(Number)
  const year = parts[0]
  if (year < 1000 || year > 3000) {
    throw new Error(`Out-of-range year for ${label}: ${value}`)
  }
  if (parts.length >= 2) {
    const month = parts[1]
    if (month < 1 || month > 12) {
      throw new Error(`Invalid month for ${label}: ${value}`)
    }
  }
  if (parts.length === 3) {
    const day = parts[2]
    if (day < 1 || day > 31) {
      throw new Error(`Invalid day for ${label}: ${value}`)
    }
  }
}

function dateSortKey(value: TimelineDate, endOfPeriod: boolean): number {
  const parts = value.split('-').map(Number)
  const year = parts[0]
  const month = parts[1] ?? (endOfPeriod ? 12 : 1)
  const day = parts[2] ?? (endOfPeriod ? 28 : 1)
  return year * 10000 + month * 100 + day
}

function validateEvent(event: TimelineEvent, label: string): void {
  if (!event.id || !event.title || !event.description || !event.startDate) {
    throw new Error(`Incomplete event: ${label}`)
  }
  assertDate(event.startDate, `${label}.startDate`)
  if (event.endDate) {
    assertDate(event.endDate, `${label}.endDate`)
    if (dateSortKey(event.endDate, true) < dateSortKey(event.startDate, false)) {
      throw new Error(`endDate before startDate for ${label}`)
    }
  }
  if (event.location) {
    const { name, lat, lng } = event.location
    if (!name) {
      throw new Error(`location.name required for ${label}`)
    }
    const hasLat = typeof lat === 'number'
    const hasLng = typeof lng === 'number'
    if (hasLat !== hasLng) {
      throw new Error(`location needs both lat and lng for ${label}`)
    }
    if (hasLat && hasLng) {
      if (lat! < -90 || lat! > 90 || lng! < -180 || lng! > 180) {
        throw new Error(`location lat/lng out of range for ${label}`)
      }
    }
  }
}

function validatePerson(person: Person): void {
  if (!person.id || !person.name || !person.color || !person.portrait) {
    throw new Error(`Incomplete person: ${person.id ?? '(missing id)'}`)
  }
  if (person.birthDate) assertDate(person.birthDate, `${person.id}.birthDate`)
  if (person.deathDate) assertDate(person.deathDate, `${person.id}.deathDate`)
  for (const event of person.events) {
    validateEvent(event, `${person.id}/${event.id}`)
  }
}

/** Eras must not overlap — only one era at a time. Gaps are allowed. */
function validateEras(eras: TimelineEra[]): void {
  const ids = new Set<string>()
  for (const era of eras) {
    if (!era.id || !era.name || !era.color || !era.startDate || !era.endDate) {
      throw new Error(`Incomplete era: ${era.id ?? '(missing id)'}`)
    }
    if (ids.has(era.id)) throw new Error(`Duplicate era id: ${era.id}`)
    ids.add(era.id)
    assertDate(era.startDate, `era/${era.id}.startDate`)
    assertDate(era.endDate, `era/${era.id}.endDate`)
    if (dateSortKey(era.endDate, true) < dateSortKey(era.startDate, false)) {
      throw new Error(`endDate before startDate for era/${era.id}`)
    }
  }

  const sorted = [...eras].sort(
    (a, b) =>
      dateSortKey(a.startDate, false) - dateSortKey(b.startDate, false),
  )
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1]
    const curr = sorted[i]
    if (dateSortKey(curr.startDate, false) <= dateSortKey(prev.endDate, true)) {
      throw new Error(
        `Eras overlap: ${prev.id} and ${curr.id} (only one era at a time)`,
      )
    }
  }
}

export function loadTimelineData(): TimelineData {
  const people = [herzl, weizmann, jabotinsky, benGurion, goldaMeir, begin, rabin] as Person[]
  const stateEvents = stateEventsJson as TimelineEvent[]
  const sharedEvents = sharedEventsJson as SharedEvent[]
  const eras = erasJson as TimelineEra[]

  for (const person of people) validatePerson(person)
  for (const event of stateEvents) validateEvent(event, `state/${event.id}`)
  for (const event of sharedEvents) {
    validateEvent(event, `shared/${event.id}`)
    if (!event.personIds || event.personIds.length < 2) {
      throw new Error(`Shared event ${event.id} needs at least 2 personIds`)
    }
  }
  validateEras(eras)

  const personIds = new Set(people.map((p) => p.id))
  const allEventIds = new Set<string>()

  const trackId = (id: string, label: string) => {
    if (allEventIds.has(id)) throw new Error(`Duplicate event id: ${id} (${label})`)
    allEventIds.add(id)
  }

  const personIdSet = new Set<string>()
  for (const person of people) {
    if (personIdSet.has(person.id)) {
      throw new Error(`Duplicate person id: ${person.id}`)
    }
    personIdSet.add(person.id)
    for (const event of person.events) trackId(event.id, person.id)
  }
  for (const event of stateEvents) trackId(event.id, 'state')
  for (const event of sharedEvents) {
    trackId(event.id, 'shared')
    for (const pid of event.personIds) {
      if (!personIds.has(pid)) {
        throw new Error(`Shared event ${event.id} references unknown person ${pid}`)
      }
    }
  }

  const sortedEras = [...eras].sort(
    (a, b) =>
      dateSortKey(a.startDate, false) - dateSortKey(b.startDate, false),
  )

  return { people, stateEvents, sharedEvents, eras: sortedEras }
}

export type {
  TimelineData,
  Person,
  SharedEvent,
  TimelineEvent,
  TimelineDate,
  TimelineEra,
}

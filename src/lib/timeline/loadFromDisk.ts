import { promises as fs } from 'fs'
import path from 'path'
import type {
  Person,
  SharedEvent,
  TimelineData,
  TimelineEra,
  TimelineEvent,
} from '@/content/timeline/types'
import {
  dateSortKey,
  validateEras,
  validatePerson,
  validateSharedEvent,
  validateTimelineEvent,
} from '@/lib/timeline/validate'

const CONTENT_ROOT = path.join(process.cwd(), 'src', 'content', 'timeline')
const PEOPLE_DIR = path.join(CONTENT_ROOT, 'people')

/**
 * Read timeline JSON from disk (not webpack-cached imports).
 * Used by the edit page so saves are visible after refresh.
 */
export async function loadTimelineDataFromDisk(): Promise<TimelineData> {
  const peopleFiles = (await fs.readdir(PEOPLE_DIR))
    .filter((f) => f.endsWith('.json'))
    .sort()

  const people: Person[] = []
  for (const file of peopleFiles) {
    const raw = await fs.readFile(path.join(PEOPLE_DIR, file), 'utf8')
    people.push(JSON.parse(raw) as Person)
  }

  const stateEvents = JSON.parse(
    await fs.readFile(path.join(CONTENT_ROOT, 'state-events.json'), 'utf8'),
  ) as TimelineEvent[]
  const sharedEvents = JSON.parse(
    await fs.readFile(path.join(CONTENT_ROOT, 'shared-events.json'), 'utf8'),
  ) as SharedEvent[]
  const eras = JSON.parse(
    await fs.readFile(path.join(CONTENT_ROOT, 'eras.json'), 'utf8'),
  ) as TimelineEra[]

  for (const person of people) validatePerson(person)
  for (const event of stateEvents) validateTimelineEvent(event, `state/${event.id}`)
  for (const event of sharedEvents) {
    validateSharedEvent(event, `shared/${event.id}`)
  }
  validateEras(eras)

  const personIds = new Set(people.map((p) => p.id))
  const allEventIds = new Set<string>()
  const trackId = (id: string, label: string) => {
    if (allEventIds.has(id)) throw new Error(`Duplicate event id: ${id} (${label})`)
    allEventIds.add(id)
  }

  for (const person of people) {
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

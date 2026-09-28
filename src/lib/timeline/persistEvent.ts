import { promises as fs } from 'fs'
import path from 'path'
import type {
  Person,
  SharedEvent,
  TimelineEvent,
} from '@/content/timeline/types'
import {
  validateSharedEvent,
  validateTimelineEvent,
} from '@/lib/timeline/validate'

const CONTENT_ROOT = path.join(process.cwd(), 'src', 'content', 'timeline')
const PEOPLE_DIR = path.join(CONTENT_ROOT, 'people')
const STATE_PATH = path.join(CONTENT_ROOT, 'state-events.json')
const SHARED_PATH = path.join(CONTENT_ROOT, 'shared-events.json')

export type TimelineEventKindTarget = 'state' | 'person' | 'shared'

export interface TimelineEventMutation {
  action: 'upsert' | 'delete'
  event: TimelineEvent
  /** Empty = state; one id = person event; two+ = shared. */
  personIds: string[]
  /** Previous ownership, used to remove from old file when kind/person changes. */
  previousPersonIds?: string[]
}

function kindFromPersonIds(personIds: string[]): TimelineEventKindTarget {
  if (personIds.length === 0) return 'state'
  if (personIds.length === 1) return 'person'
  return 'shared'
}

async function readJson<T>(filePath: string): Promise<T> {
  const raw = await fs.readFile(filePath, 'utf8')
  return JSON.parse(raw) as T
}

async function writeJson(filePath: string, data: unknown): Promise<void> {
  const body = `${JSON.stringify(data, null, 2)}\n`
  await fs.writeFile(filePath, body, 'utf8')
}

function personFilePath(personId: string): string {
  return path.join(PEOPLE_DIR, `${personId}.json`)
}

async function removeEventFromPerson(
  personId: string,
  eventId: string,
): Promise<boolean> {
  const filePath = personFilePath(personId)
  const person = await readJson<Person>(filePath)
  const nextEvents = person.events.filter((e) => e.id !== eventId)
  if (nextEvents.length === person.events.length) return false
  person.events = nextEvents
  await writeJson(filePath, person)
  return true
}

async function removeEventFromState(eventId: string): Promise<boolean> {
  const events = await readJson<TimelineEvent[]>(STATE_PATH)
  const next = events.filter((e) => e.id !== eventId)
  if (next.length === events.length) return false
  await writeJson(STATE_PATH, next)
  return true
}

async function removeEventFromShared(eventId: string): Promise<boolean> {
  const events = await readJson<SharedEvent[]>(SHARED_PATH)
  const next = events.filter((e) => e.id !== eventId)
  if (next.length === events.length) return false
  await writeJson(SHARED_PATH, next)
  return true
}

async function removeEventEverywhere(
  eventId: string,
  hintPersonIds?: string[],
): Promise<void> {
  if (hintPersonIds && hintPersonIds.length === 1) {
    await removeEventFromPerson(hintPersonIds[0], eventId)
  } else if (hintPersonIds && hintPersonIds.length >= 2) {
    await removeEventFromShared(eventId)
  } else if (hintPersonIds && hintPersonIds.length === 0) {
    await removeEventFromState(eventId)
  }

  // Always sweep all stores so moved events don't leave orphans.
  const peopleFiles = await fs.readdir(PEOPLE_DIR)
  for (const file of peopleFiles) {
    if (!file.endsWith('.json')) continue
    const personId = file.replace(/\.json$/, '')
    await removeEventFromPerson(personId, eventId)
  }
  await removeEventFromState(eventId)
  await removeEventFromShared(eventId)
}

function cleanEvent(event: TimelineEvent): TimelineEvent {
  const cleaned: TimelineEvent = {
    id: event.id.trim(),
    title: event.title.trim(),
    description: event.description.trim(),
    startDate: event.startDate.trim(),
  }
  if (event.endDate?.trim()) cleaned.endDate = event.endDate.trim()
  if (event.image?.trim()) cleaned.image = event.image.trim()
  if (event.video?.trim()) cleaned.video = event.video.trim()
  if (event.location?.name?.trim()) {
    const loc: NonNullable<TimelineEvent['location']> = {
      name: event.location.name.trim(),
    }
    if (event.location.country?.trim()) {
      loc.country = event.location.country.trim()
    }
    if (
      typeof event.location.lat === 'number' &&
      typeof event.location.lng === 'number'
    ) {
      loc.lat = event.location.lat
      loc.lng = event.location.lng
    }
    cleaned.location = loc
  }
  return cleaned
}

export function assertTimelineEditAllowed(_secretHeader: string | null): void {
  if (process.env.NODE_ENV !== 'development') {
    throw new Error('Unauthorized timeline edit')
  }
}

export async function mutateTimelineEvent(
  mutation: TimelineEventMutation,
): Promise<{ ok: true }> {
  const personIds = [...new Set(mutation.personIds.map((id) => id.trim()).filter(Boolean))]
  const event = cleanEvent(mutation.event)
  if (!event.id) throw new Error('event.id required')

  if (mutation.action === 'delete') {
    await removeEventEverywhere(event.id, mutation.previousPersonIds ?? personIds)
    return { ok: true }
  }

  const kind = kindFromPersonIds(personIds)
  if (kind === 'shared') {
    validateSharedEvent({ ...event, personIds }, `shared/${event.id}`)
  } else {
    validateTimelineEvent(event, `${kind}/${event.id}`)
  }

  if (kind === 'person') {
    const personId = personIds[0]
    const filePath = personFilePath(personId)
    try {
      await fs.access(filePath)
    } catch {
      throw new Error(`Unknown person id: ${personId}`)
    }
  }

  await removeEventEverywhere(event.id, mutation.previousPersonIds)

  if (kind === 'state') {
    const events = await readJson<TimelineEvent[]>(STATE_PATH)
    events.push(event)
    await writeJson(STATE_PATH, events)
    return { ok: true }
  }

  if (kind === 'person') {
    const personId = personIds[0]
    const filePath = personFilePath(personId)
    const person = await readJson<Person>(filePath)
    person.events.push(event)
    await writeJson(filePath, person)
    return { ok: true }
  }

  const shared = await readJson<SharedEvent[]>(SHARED_PATH)
  shared.push({ ...event, personIds })
  await writeJson(SHARED_PATH, shared)
  return { ok: true }
}

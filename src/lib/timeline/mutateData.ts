import type {
  SharedEvent,
  TimelineData,
  TimelineEvent,
} from '@/content/timeline/types'

function stripEmptyFields(event: TimelineEvent): TimelineEvent {
  const next: TimelineEvent = {
    id: event.id.trim(),
    title: event.title.trim(),
    description: event.description.trim(),
    startDate: event.startDate.trim(),
  }
  if (event.endDate?.trim()) next.endDate = event.endDate.trim()
  if (event.image?.trim()) next.image = event.image.trim()
  if (event.video?.trim()) next.video = event.video.trim()
  if (event.location?.name?.trim()) {
    const location: NonNullable<TimelineEvent['location']> = {
      name: event.location.name.trim(),
    }
    if (event.location.country?.trim()) {
      location.country = event.location.country.trim()
    }
    if (
      typeof event.location.lat === 'number' &&
      typeof event.location.lng === 'number'
    ) {
      location.lat = event.location.lat
      location.lng = event.location.lng
    }
    next.location = location
  }
  return next
}

function removeEventId(data: TimelineData, eventId: string): TimelineData {
  return {
    ...data,
    people: data.people.map((person) => ({
      ...person,
      events: person.events.filter((e) => e.id !== eventId),
    })),
    stateEvents: data.stateEvents.filter((e) => e.id !== eventId),
    sharedEvents: data.sharedEvents.filter((e) => e.id !== eventId),
  }
}

export function upsertEventInData(
  data: TimelineData,
  event: TimelineEvent,
  personIds: string[],
): TimelineData {
  const cleaned = stripEmptyFields(event)
  const ids = [...new Set(personIds)]
  let next = removeEventId(data, cleaned.id)

  if (ids.length === 0) {
    return {
      ...next,
      stateEvents: [...next.stateEvents, cleaned],
    }
  }

  if (ids.length === 1) {
    return {
      ...next,
      people: next.people.map((person) =>
        person.id === ids[0]
          ? { ...person, events: [...person.events, cleaned] }
          : person,
      ),
    }
  }

  const shared: SharedEvent = { ...cleaned, personIds: ids }
  return {
    ...next,
    sharedEvents: [...next.sharedEvents, shared],
  }
}

export function deleteEventFromData(
  data: TimelineData,
  eventId: string,
): TimelineData {
  return removeEventId(data, eventId)
}

export async function saveTimelineEventApi(payload: {
  action: 'upsert' | 'delete'
  event: TimelineEvent
  personIds: string[]
  previousPersonIds?: string[]
}): Promise<void> {
  const response = await fetch('/api/timeline/events', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: string
    } | null
    throw new Error(body?.error || `Save failed (${response.status})`)
  }
}

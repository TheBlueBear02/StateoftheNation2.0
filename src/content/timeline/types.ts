/** Partial ISO-like date: year, year-month, or full day. */
export type TimelineDate = string

export interface TimelineLocation {
  name: string
  lat?: number
  lng?: number
}

export interface TimelineEvent {
  id: string
  title: string
  description: string
  image?: string
  startDate: TimelineDate
  endDate?: TimelineDate
  location?: TimelineLocation
}

export interface Person {
  id: string
  name: string
  nameEn?: string
  color: string
  portrait: string
  birthDate?: TimelineDate
  deathDate?: TimelineDate
  events: TimelineEvent[]
}

export interface SharedEvent extends TimelineEvent {
  /** At least two person ids. */
  personIds: string[]
}

export interface TimelineData {
  people: Person[]
  stateEvents: TimelineEvent[]
  sharedEvents: SharedEvent[]
}

/** Runtime event after layout — may span one or more person rows. */
export type TimelineEventKind = 'person' | 'state' | 'shared'

export interface LaidOutEvent {
  event: TimelineEvent
  kind: TimelineEventKind
  /** Person ids this event belongs to (empty for state). */
  personIds: string[]
  /** Inclusive row indices in the ordered visible rows. */
  rowStart: number
  rowEnd: number
  lane: number
  startYear: number
  endYear: number
  colors: string[]
}

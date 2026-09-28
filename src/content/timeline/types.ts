/** Partial ISO-like date: year, year-month, or full day. */
export type TimelineDate = string

export interface TimelineLocation {
  name: string
  /** Country in Hebrew — shown next to the place name on the map. */
  country?: string
  /** WGS84 latitude — with `lng`, enables the modal map. */
  lat?: number
  /** WGS84 longitude — with `lat`, enables the modal map. */
  lng?: number
}

export interface TimelineEvent {
  id: string
  title: string
  description: string
  image?: string
  /** Optional video URL for the modal media panel (preferred over `image` when set). */
  video?: string
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

/** Contiguous historical period shown on the top era band (non-overlapping). */
export interface TimelineEra {
  id: string
  name: string
  startDate: TimelineDate
  endDate: TimelineDate
  color: string
}

export interface TimelineData {
  people: Person[]
  stateEvents: TimelineEvent[]
  sharedEvents: SharedEvent[]
  eras: TimelineEra[]
}

/** Runtime event after layout — placed on a shared global layer. */
export type TimelineEventKind = 'person' | 'state' | 'shared'

export interface LaidOutEvent {
  event: TimelineEvent
  kind: TimelineEventKind
  /** Person ids this event belongs to (empty for state). */
  personIds: string[]
  /** Portrait URLs for person/shared events (empty for state — uses STATE_EMBLEM). */
  portraits: string[]
  /** Shared event-layer index (0-based), not tied to a person. */
  lane: number
  startYear: number
  endYear: number
  colors: string[]
}

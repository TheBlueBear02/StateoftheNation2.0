import type { EventEditDraft } from '@/components/timeline/EventEditForm'

const STORAGE_PREFIX = 'timeline-edit-draft:'
const LAST_PERSON_IDS_KEY = 'timeline-edit-last-person-ids'

function storageKey(draft: Pick<EventEditDraft, 'isNew' | 'event'>): string {
  return draft.isNew
    ? `${STORAGE_PREFIX}new`
    : `${STORAGE_PREFIX}event:${draft.event.id}`
}

export function draftStorageKeyForNew(): string {
  return `${STORAGE_PREFIX}new`
}

export function draftStorageKeyForEvent(eventId: string): string {
  return `${STORAGE_PREFIX}event:${eventId}`
}

export function saveEventDraft(draft: EventEditDraft): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(storageKey(draft), JSON.stringify(draft))
  } catch {
    // ignore quota / private mode
  }
}

export function loadEventDraft(key: string): EventEditDraft | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw) as EventEditDraft
    if (!parsed?.event?.id || !Array.isArray(parsed.personIds)) return null
    return parsed
  } catch {
    return null
  }
}

export function clearEventDraft(key: string): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(key)
  } catch {
    // ignore
  }
}

export function clearDraftFor(draft: EventEditDraft): void {
  clearEventDraft(storageKey(draft))
}

export function saveLastSelectedPersonIds(personIds: string[]): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(LAST_PERSON_IDS_KEY, JSON.stringify(personIds))
  } catch {
    // ignore
  }
}

export function loadLastSelectedPersonIds(): string[] | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(LAST_PERSON_IDS_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed) || !parsed.every((id) => typeof id === 'string')) {
      return null
    }
    return parsed
  } catch {
    return null
  }
}

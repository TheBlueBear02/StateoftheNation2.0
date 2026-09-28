'use client'

import { useMemo, useState } from 'react'
import type {
  LaidOutEvent,
  Person,
  TimelineEvent,
  TimelineLocation,
} from '@/content/timeline/types'
import {
  formatTimelineDate,
  parseTimelineDateInput,
} from '@/lib/timeline/dates'

export interface EventEditDraft {
  event: TimelineEvent
  personIds: string[]
  /** Ownership before this edit (for file moves / delete). */
  previousPersonIds: string[]
  isNew: boolean
}

interface EventEditFormProps {
  draft: EventEditDraft
  people: Person[]
  saving: boolean
  error: string | null
  onChange: (
    draft: EventEditDraft | ((prev: EventEditDraft) => EventEditDraft),
  ) => void
  onSave: () => void
  onDelete?: () => void
  onClose: () => void
}

function emptyLocation(): TimelineLocation {
  return { name: '', country: '', lat: undefined, lng: undefined }
}

export function createEmptyDraft(personIds: string[] = []): EventEditDraft {
  return {
    isNew: true,
    previousPersonIds: [],
    personIds: [...personIds],
    event: {
      id: `evt-${Date.now()}`,
      title: '',
      description: '',
      startDate: '',
      endDate: '',
      image: '',
      video: '',
      location: emptyLocation(),
    },
  }
}

export function draftFromLaid(laid: LaidOutEvent): EventEditDraft {
  const loc = laid.event.location
  return {
    isNew: false,
    previousPersonIds: [...laid.personIds],
    personIds: [...laid.personIds],
    event: {
      ...laid.event,
      endDate: laid.event.endDate ?? '',
      image: laid.event.image ?? '',
      video: laid.event.video ?? '',
      location: loc
        ? {
            name: loc.name,
            country: loc.country ?? '',
            lat: loc.lat,
            lng: loc.lng,
          }
        : emptyLocation(),
    },
  }
}

export function EventEditForm({
  draft,
  people,
  saving,
  error,
  onChange,
  onSave,
  onDelete,
  onClose,
}: EventEditFormProps) {
  const [latText, setLatText] = useState(
    draft.event.location?.lat != null ? String(draft.event.location.lat) : '',
  )
  const [lngText, setLngText] = useState(
    draft.event.location?.lng != null ? String(draft.event.location.lng) : '',
  )
  const [startDateText, setStartDateText] = useState(
    draft.event.startDate ? formatTimelineDate(draft.event.startDate) : '',
  )
  const [endDateText, setEndDateText] = useState(
    draft.event.endDate ? formatTimelineDate(draft.event.endDate) : '',
  )
  const [dateError, setDateError] = useState<string | null>(null)
  const [geocoding, setGeocoding] = useState(false)
  const [geocodeError, setGeocodeError] = useState<string | null>(null)

  const kindLabel = useMemo(() => {
    if (draft.personIds.length === 0) return 'אירוע מדינה'
    if (draft.personIds.length === 1) return 'אירוע אישי'
    return 'אירוע משותף'
  }, [draft.personIds.length])

  const canGeocode = Boolean(draft.event.location?.name?.trim()) && !saving && !geocoding

  const patchEvent = (patch: Partial<TimelineEvent>) => {
    onChange((prev) => ({ ...prev, event: { ...prev.event, ...patch } }))
  }

  const patchLocation = (patch: Partial<TimelineLocation>) => {
    onChange((prev) => {
      const current = prev.event.location ?? emptyLocation()
      return {
        ...prev,
        event: {
          ...prev.event,
          location: { ...current, ...patch },
        },
      }
    })
  }

  const lookupCoordinates = async () => {
    const name = draft.event.location?.name?.trim() ?? ''
    const country = draft.event.location?.country?.trim() ?? ''
    if (!name) {
      setGeocodeError('יש למלא עיר / מקום לפני חישוב הקואורדינטות')
      return
    }

    setGeocoding(true)
    setGeocodeError(null)
    try {
      const params = new URLSearchParams({ name })
      if (country) params.set('country', country)
      const response = await fetch(`/api/timeline/geocode?${params.toString()}`)
      const body = (await response.json().catch(() => null)) as {
        lat?: number
        lng?: number
        error?: string
      } | null
      if (!response.ok || body?.lat == null || body?.lng == null) {
        throw new Error(body?.error || 'לא הצלחנו למצוא קואורדינטות')
      }
      setLatText(String(body.lat))
      setLngText(String(body.lng))
      onChange((prev) => {
        const current = prev.event.location ?? emptyLocation()
        return {
          ...prev,
          event: {
            ...prev.event,
            location: {
              ...current,
              name: current.name || name,
              country: current.country || country,
              lat: body.lat,
              lng: body.lng,
            },
          },
        }
      })
    } catch (err) {
      setGeocodeError(err instanceof Error ? err.message : 'שגיאה בחישוב קואורדינטות')
    } finally {
      setGeocoding(false)
    }
  }

  const applyStartDate = (raw: string) => {
    setStartDateText(raw)
    const parsed = parseTimelineDateInput(raw)
    if (parsed === null) {
      setDateError('פורמט תאריך התחלה: 24.10.2026 / 10.1948 / 1948')
      return
    }
    setDateError(null)
    patchEvent({ startDate: parsed })
  }

  const applyEndDate = (raw: string) => {
    setEndDateText(raw)
    const parsed = parseTimelineDateInput(raw)
    if (parsed === null) {
      setDateError('פורמט תאריך סיום: 24.10.2026 / 10.1948 / 1948')
      return
    }
    setDateError(null)
    patchEvent({ endDate: parsed })
  }

  const togglePerson = (id: string) => {
    onChange((prev) => {
      const set = new Set(prev.personIds)
      if (set.has(id)) set.delete(id)
      else set.add(id)
      return { ...prev, personIds: [...set] }
    })
  }

  return (
    <div
      className="timeline-edit-form"
      role="dialog"
      aria-modal="true"
      aria-labelledby="timeline-edit-form-title"
      onClick={onClose}
      data-timeline-no-pan
    >
      <div
        className="timeline-edit-form__panel"
        dir="rtl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="timeline-edit-form__header">
          <h2 id="timeline-edit-form-title">
            {draft.isNew ? 'אירוע חדש' : 'עריכת אירוע'}
          </h2>
          <p className="timeline-edit-form__kind">{kindLabel}</p>
          <button
            type="button"
            className="timeline-edit-form__close"
            onClick={onClose}
            aria-label="סגור"
          >
            ×
          </button>
        </header>

        <div className="timeline-edit-form__body">
          <label className="timeline-edit-form__field">
            <span>כותרת</span>
            <input
              value={draft.event.title}
              onChange={(e) => patchEvent({ title: e.target.value })}
              required
            />
          </label>

          <label className="timeline-edit-form__field">
            <span>תיאור</span>
            <textarea
              value={draft.event.description}
              onChange={(e) => patchEvent({ description: e.target.value })}
              rows={4}
              required
            />
          </label>

          <div className="timeline-edit-form__row">
            <label className="timeline-edit-form__field">
              <span>תאריך התחלה</span>
              <input
                value={startDateText}
                onChange={(e) => applyStartDate(e.target.value)}
                placeholder="24.10.2026"
                required
              />
            </label>
            <label className="timeline-edit-form__field">
              <span>תאריך סיום (אופציונלי)</span>
              <input
                value={endDateText}
                onChange={(e) => applyEndDate(e.target.value)}
                placeholder="24.10.2026"
              />
            </label>
          </div>
          {dateError ? (
            <p className="timeline-edit-form__error" role="alert">
              {dateError}
            </p>
          ) : null}

          <fieldset className="timeline-edit-form__people">
            <legend>דמויות (ריק = אירוע מדינה)</legend>
            <div className="timeline-edit-form__people-list">
              {people.map((person) => (
                <label key={person.id} className="timeline-edit-form__person">
                  <input
                    type="checkbox"
                    checked={draft.personIds.includes(person.id)}
                    onChange={() => togglePerson(person.id)}
                  />
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={person.portrait} alt="" width={28} height={28} />
                  <span>{person.name}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="timeline-edit-form__location">
            <legend>מיקום</legend>
            <div className="timeline-edit-form__row">
              <label className="timeline-edit-form__field">
                <span>עיר / מקום</span>
                <input
                  value={draft.event.location?.name ?? ''}
                  onChange={(e) => patchLocation({ name: e.target.value })}
                />
              </label>
              <label className="timeline-edit-form__field">
                <span>מדינה</span>
                <input
                  value={draft.event.location?.country ?? ''}
                  onChange={(e) => patchLocation({ country: e.target.value })}
                />
              </label>
            </div>
            <div className="timeline-edit-form__row">
              <label className="timeline-edit-form__field">
                <span>קו רוחב (lat)</span>
                <input
                  value={latText}
                  onChange={(e) => {
                    setLatText(e.target.value)
                    const n = Number(e.target.value)
                    patchLocation({
                      lat: e.target.value.trim() === '' || Number.isNaN(n) ? undefined : n,
                    })
                  }}
                  inputMode="decimal"
                />
              </label>
              <label className="timeline-edit-form__field">
                <span>קו אורך (lng)</span>
                <input
                  value={lngText}
                  onChange={(e) => {
                    setLngText(e.target.value)
                    const n = Number(e.target.value)
                    patchLocation({
                      lng: e.target.value.trim() === '' || Number.isNaN(n) ? undefined : n,
                    })
                  }}
                  inputMode="decimal"
                />
              </label>
            </div>
            <div className="timeline-edit-form__geocode-row">
              <button
                type="button"
                className="timeline-edit-form__geocode"
                onClick={lookupCoordinates}
                disabled={!canGeocode}
              >
                {geocoding ? 'מחשב…' : 'חשב קואורדינטות'}
              </button>
              {geocodeError ? (
                <p className="timeline-edit-form__geocode-error" role="alert">
                  {geocodeError}
                </p>
              ) : (
                <p className="timeline-edit-form__geocode-hint">
                  לפי העיר והמדינה שהוזנו
                </p>
              )}
            </div>
          </fieldset>

          <div className="timeline-edit-form__row">
            <label className="timeline-edit-form__field">
              <span>קישור תמונה</span>
              <input
                value={draft.event.image ?? ''}
                onChange={(e) => patchEvent({ image: e.target.value })}
                placeholder="https://… או /timeline/…"
              />
            </label>
            <label className="timeline-edit-form__field">
              <span>קישור וידאו</span>
              <input
                value={draft.event.video ?? ''}
                onChange={(e) => patchEvent({ video: e.target.value })}
                placeholder="YouTube או קובץ וידאו"
              />
            </label>
          </div>

          {(draft.event.image || draft.event.video) && (
            <div className="timeline-edit-form__preview">
              {draft.event.video ? (
                <p className="timeline-edit-form__preview-note">
                  וידאו ייטען במודל מהקישור שנשמר
                </p>
              ) : draft.event.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={draft.event.image} alt="" />
              ) : null}
            </div>
          )}

          {error ? (
            <p className="timeline-edit-form__error" role="alert">
              {error}
            </p>
          ) : null}
        </div>

        <footer className="timeline-edit-form__footer">
          {!draft.isNew && onDelete ? (
            <button
              type="button"
              className="timeline-edit-form__delete"
              onClick={onDelete}
              disabled={saving}
            >
              מחק
            </button>
          ) : (
            <span />
          )}
          <div className="timeline-edit-form__actions">
            <button type="button" onClick={onClose} disabled={saving}>
              ביטול
            </button>
            <button
              type="button"
              className="timeline-edit-form__save"
              onClick={onSave}
              disabled={saving}
            >
              {saving ? 'שומר…' : 'שמור'}
            </button>
          </div>
        </footer>
      </div>
    </div>
  )
}

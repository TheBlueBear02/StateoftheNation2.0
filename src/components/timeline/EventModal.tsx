'use client'

import { useEffect } from 'react'
import type { LaidOutEvent, Person } from '@/content/timeline/types'
import { formatEventDateRange } from '@/lib/timeline/dates'

interface EventModalProps {
  laid: LaidOutEvent | null
  people: Person[]
  onClose: () => void
}

export function EventModal({ laid, people, onClose }: EventModalProps) {
  useEffect(() => {
    if (!laid) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [laid, onClose])

  if (!laid) return null

  const { event, personIds, colors, kind } = laid
  const participants = people.filter((p) => personIds.includes(p.id))
  const dateLabel = formatEventDateRange(event.startDate, event.endDate)

  return (
    <div
      className="timeline-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="timeline-modal-title"
      onClick={onClose}
      data-timeline-no-pan
    >
      <div
        className="timeline-modal__panel"
        dir="rtl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className="timeline-modal__close"
          onClick={onClose}
          aria-label="סגור"
        >
          ×
        </button>

        {event.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={event.image}
            alt=""
            className="timeline-modal__image"
          />
        ) : (
          <div
            className="timeline-modal__image timeline-modal__image--placeholder"
            style={{
              background:
                colors.length === 1
                  ? colors[0]
                  : `linear-gradient(135deg, ${colors.join(', ')})`,
            }}
          />
        )}

        <div className="timeline-modal__body">
          <p className="timeline-modal__kind">
            {kind === 'state'
              ? 'אירוע מדינה'
              : kind === 'shared'
                ? 'אירוע משותף'
                : 'אירוע אישי'}
          </p>
          <h2 id="timeline-modal-title" className="timeline-modal__title">
            {event.title}
          </h2>
          <p className="timeline-modal__meta">
            <span>{dateLabel}</span>
            {event.location ? (
              <>
                <span aria-hidden="true"> · </span>
                <span>{event.location.name}</span>
              </>
            ) : null}
          </p>
          <p className="timeline-modal__description">{event.description}</p>

          {participants.length > 0 ? (
            <ul className="timeline-modal__people">
              {participants.map((person) => (
                <li key={person.id} className="timeline-modal__person">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={person.portrait}
                    alt=""
                    width={36}
                    height={36}
                  />
                  <span>{person.name}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>
    </div>
  )
}

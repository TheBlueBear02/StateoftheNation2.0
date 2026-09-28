'use client'

import { useEffect, useMemo, useRef, useState, type TransitionEvent } from 'react'
import dynamic from 'next/dynamic'
import type { LaidOutEvent, Person } from '@/content/timeline/types'
import { formatEventDateRange } from '@/lib/timeline/dates'
import { EventMediaPanel } from '@/components/timeline/EventMediaPanel'

const EventMap = dynamic(
  () => import('@/components/timeline/EventMap').then((m) => m.EventMap),
  { ssr: false },
)

interface EventModalProps {
  laid: LaidOutEvent | null
  events: LaidOutEvent[]
  people: Person[]
  onSelect: (event: LaidOutEvent) => void
  onClose: () => void
}

function eventSequence(
  laid: LaidOutEvent,
  events: LaidOutEvent[],
): LaidOutEvent[] {
  const filtered =
    laid.kind === 'state'
      ? events.filter((e) => e.kind === 'state')
      : laid.personIds[0]
        ? events.filter((e) => e.personIds.includes(laid.personIds[0]))
        : []

  return [...filtered].sort((a, b) => {
    if (a.startYear !== b.startYear) return a.startYear - b.startYear
    if (a.endYear !== b.endYear) return a.endYear - b.endYear
    return a.event.id.localeCompare(b.event.id)
  })
}

export function EventModal({
  laid,
  events,
  people,
  onSelect,
  onClose,
}: EventModalProps) {
  const [display, setDisplay] = useState<LaidOutEvent | null>(null)
  const [isOpen, setIsOpen] = useState(false)
  const displayRef = useRef<LaidOutEvent | null>(null)

  useEffect(() => {
    displayRef.current = display
  }, [display])

  useEffect(() => {
    if (laid) {
      const current = displayRef.current
      if (!current) {
        setDisplay(laid)
        const frame = requestAnimationFrame(() => {
          requestAnimationFrame(() => setIsOpen(true))
        })
        return () => cancelAnimationFrame(frame)
      }
      if (laid.event.id !== current.event.id) {
        setDisplay(laid)
      }
      return
    }

    if (displayRef.current) {
      setIsOpen(false)
    }
  }, [laid])

  const { prev, next } = useMemo(() => {
    if (!display) return { prev: null, next: null }
    const sequence = eventSequence(display, events)
    const index = sequence.findIndex((e) => e.event.id === display.event.id)
    if (index < 0) return { prev: null, next: null }
    return {
      prev: index > 0 ? sequence[index - 1] : null,
      next: index < sequence.length - 1 ? sequence[index + 1] : null,
    }
  }, [display, events])

  useEffect(() => {
    if (!display) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
        return
      }
      if (!isOpen) return
      if (e.key === 'ArrowLeft' && prev) {
        e.preventDefault()
        onSelect(prev)
      }
      if (e.key === 'ArrowRight' && next) {
        e.preventDefault()
        onSelect(next)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [display, isOpen, prev, next, onClose, onSelect])

  const handleBackdropTransitionEnd = (
    e: TransitionEvent<HTMLDivElement>,
  ) => {
    if (e.target !== e.currentTarget) return
    if (!isOpen && !laid) {
      setDisplay(null)
    }
  }

  if (!display) return null

  const { event, personIds, colors } = display
  const participants = people.filter((p) => personIds.includes(p.id))
  const dateLabel = formatEventDateRange(event.startDate, event.endDate)

  return (
    <div
      className={`timeline-modal${isOpen ? ' timeline-modal--open' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="timeline-modal-title"
      onClick={onClose}
      onTransitionEnd={handleBackdropTransitionEnd}
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

        <div className="timeline-modal__main" dir="ltr">
          <EventMediaPanel
            image={event.image}
            video={event.video}
            colors={colors}
          />

          <div className="timeline-modal__body">
            <div className="timeline-modal__header">
              {participants.length > 0 ? (
                <ul className="timeline-modal__people" dir="ltr">
                  {participants.map((person) => (
                    <li key={person.id} className="timeline-modal__person">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={person.portrait}
                        alt=""
                        width={36}
                        height={36}
                      />
                      <span dir="rtl">{person.name}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <span className="timeline-modal__header-spacer" />
              )}
              <h2 id="timeline-modal-title" className="timeline-modal__title">
                {event.title}
              </h2>
            </div>
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

            {event.location &&
            typeof event.location.lat === 'number' &&
            typeof event.location.lng === 'number' ? (
              <EventMap
                name={event.location.name}
                country={event.location.country}
                lat={event.location.lat}
                lng={event.location.lng}
              />
            ) : (
              <div className="timeline-modal__map" aria-label="מפה">
                <span className="timeline-modal__map-label">
                  {event.location?.name
                    ? `מפה · ${event.location.name}`
                    : 'מפה · מיקום'}
                </span>
              </div>
            )}
          </div>
        </div>

        {prev || next ? (
          <nav className="timeline-modal__nav" dir="ltr" aria-label="אירועים סמוכים">
            {prev ? (
              <button
                type="button"
                className="timeline-modal__nav-btn timeline-modal__nav-btn--prev"
                onClick={() => onSelect(prev)}
              >
                <span className="timeline-modal__nav-arrow" aria-hidden="true">
                  ‹
                </span>
                <span className="timeline-modal__nav-label">{prev.event.title}</span>
              </button>
            ) : (
              <span className="timeline-modal__nav-spacer" />
            )}
            {next ? (
              <button
                type="button"
                className="timeline-modal__nav-btn timeline-modal__nav-btn--next"
                onClick={() => onSelect(next)}
              >
                <span className="timeline-modal__nav-label">{next.event.title}</span>
                <span className="timeline-modal__nav-arrow" aria-hidden="true">
                  ›
                </span>
              </button>
            ) : (
              <span className="timeline-modal__nav-spacer" />
            )}
          </nav>
        ) : null}
      </div>
    </div>
  )
}

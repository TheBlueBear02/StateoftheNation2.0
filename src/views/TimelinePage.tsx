'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import type { LaidOutEvent, TimelineData, TimelineEra } from '@/content/timeline/types'
import { EventModal } from '@/components/timeline/EventModal'
import { PortraitColumn } from '@/components/timeline/PortraitColumn'
import { TimelineCanvas } from '@/components/timeline/TimelineCanvas'
import { YearAxis } from '@/components/timeline/YearAxis'
import { ZoomControls } from '@/components/timeline/ZoomControls'
import { useTimelineViewport } from '@/hooks/useTimelineViewport'
import { eventYearRange } from '@/lib/timeline/dates'
import {
  buildRows,
  computeDataRange,
  entitiesInViewport,
  layoutEvents,
  orderRows,
  peopleWithPngPortraits,
} from '@/lib/timeline/layout'
import './TimelinePage.css'

interface TimelinePageProps {
  data: TimelineData
}

export function TimelinePage({ data }: TimelinePageProps) {
  // Public timeline hides people who only have SVG placeholder portraits.
  const people = useMemo(
    () => peopleWithPngPortraits(data.people),
    [data.people],
  )

  const orderedPeople = useMemo(
    () => orderRows(people, data.sharedEvents),
    [people, data.sharedEvents],
  )

  const [visiblePersonIds, setVisiblePersonIds] = useState(
    () => new Set(peopleWithPngPortraits(data.people).map((p) => p.id)),
  )
  const [stateVisible, setStateVisible] = useState(true)
  const [selected, setSelected] = useState<LaidOutEvent | null>(null)

  const trackRef = useRef<HTMLDivElement>(null)
  const [trackSize, setTrackSize] = useState({ width: 800, height: 500 })

  const { minYear, maxYear } = useMemo(
    () =>
      computeDataRange(
        people,
        data.stateEvents,
        data.sharedEvents,
        data.eras,
      ),
    [people, data.stateEvents, data.sharedEvents, data.eras],
  )

  const viewport = useTimelineViewport(trackRef, minYear, maxYear)

  useEffect(() => {
    const el = trackRef.current
    if (!el) return
    const measure = () => {
      const rect = el.getBoundingClientRect()
      setTrackSize({
        width: Math.max(rect.width, 1),
        height: Math.max(rect.height, 1),
      })
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const inView = useMemo(
    () =>
      entitiesInViewport(
        people,
        data.stateEvents,
        data.sharedEvents,
        viewport.viewStart,
        viewport.viewEnd,
      ),
    [
      people,
      data.stateEvents,
      data.sharedEvents,
      viewport.viewStart,
      viewport.viewEnd,
    ],
  )

  const filterRows = useMemo(() => {
    const rows = buildRows(orderedPeople, visiblePersonIds, stateVisible)
    return rows.filter((row) => {
      if (row.kind === 'state') return inView.stateInView
      return inView.personIds.has(row.id)
    })
  }, [orderedPeople, visiblePersonIds, stateVisible, inView])

  const { events, layerCount } = useMemo(() => {
    const span = viewport.viewEnd - viewport.viewStart
    const pixelsPerYear =
      span > 0 && trackSize.width > 0 ? trackSize.width / span : 1
    return layoutEvents(
      people,
      data.stateEvents,
      data.sharedEvents,
      visiblePersonIds,
      stateVisible,
      pixelsPerYear,
    )
  }, [
    people,
    data.stateEvents,
    data.sharedEvents,
    visiblePersonIds,
    stateVisible,
    viewport.viewStart,
    viewport.viewEnd,
    trackSize.width,
  ])

  const togglePerson = (id: string) => {
    setVisiblePersonIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        const othersInViewOn = [...inView.personIds].some(
          (pid) => pid !== id && next.has(pid),
        )
        const stateStillOn = stateVisible && inView.stateInView
        if (!othersInViewOn && !stateStillOn) return prev
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const toggleState = () => {
    setStateVisible((prev) => {
      if (prev) {
        const anyPersonInViewOn = [...inView.personIds].some((pid) =>
          visiblePersonIds.has(pid),
        )
        if (!anyPersonInViewOn) return prev
      }
      return !prev
    })
  }

  const focusEra = (era: TimelineEra) => {
    const { startYear, endYear } = eventYearRange(era.startDate, era.endDate)
    viewport.zoomToRange(startYear, endYear)
  }

  return (
    <div className="timeline-page">
      <header className="timeline-chrome" data-timeline-no-pan dir="ltr">
        <ZoomControls
          onZoomIn={viewport.zoomIn}
          onZoomOut={viewport.zoomOut}
          onShowAll={viewport.showAll}
          isFitted={viewport.isFitted}
        />
        <div className="timeline-chrome__branding">
          <h1 className="timeline-chrome__title">
            בזכותם | ציר זמן למדינת ישראל
          </h1>
          <p className="timeline-chrome__subtitle">
            דרך סיפור חייהם של דמויות מפתח בציונות
          </p>
        </div>
        <Link href="/" className="timeline-chrome__home" aria-label="מצב האומה - דף הבית">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/header-logo%203.svg"
            alt="מצב האומה"
            className="timeline-chrome__logo"
            width={140}
            height={36}
          />
        </Link>
      </header>

      <div className="timeline-body" dir="ltr">
        <PortraitColumn
          rows={filterRows}
          onTogglePerson={togglePerson}
          onToggleState={toggleState}
        />

        <div className="timeline-main">
          <div
            className="timeline-track"
            ref={trackRef}
            role="region"
            aria-label="ציר הזמן"
          >
            <TimelineCanvas
              eras={data.eras}
              events={events}
              layerCount={layerCount}
              viewStart={viewport.viewStart}
              viewEnd={viewport.viewEnd}
              width={trackSize.width}
              height={trackSize.height}
              onSelectEvent={setSelected}
              onSelectEra={focusEra}
            />
          </div>
          <YearAxis
            viewStart={viewport.viewStart}
            viewEnd={viewport.viewEnd}
            width={trackSize.width}
          />
        </div>
      </div>

      <EventModal
        laid={selected}
        events={events}
        people={people}
        onSelect={setSelected}
        onClose={() => setSelected(null)}
      />
    </div>
  )
}

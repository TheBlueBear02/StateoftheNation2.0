'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import type { LaidOutEvent, TimelineData } from '@/content/timeline/types'
import { EventModal } from '@/components/timeline/EventModal'
import { PortraitColumn } from '@/components/timeline/PortraitColumn'
import { TimelineCanvas } from '@/components/timeline/TimelineCanvas'
import { YearAxis } from '@/components/timeline/YearAxis'
import { ZoomControls } from '@/components/timeline/ZoomControls'
import { useTimelineViewport } from '@/hooks/useTimelineViewport'
import {
  assignLanes,
  buildRows,
  computeDataRange,
  orderRows,
} from '@/lib/timeline/layout'
import './TimelinePage.css'

interface TimelinePageProps {
  data: TimelineData
}

const COLLAPSED_ROW_HEIGHT = 36

export function TimelinePage({ data }: TimelinePageProps) {
  const orderedPeople = useMemo(
    () => orderRows(data.people, data.sharedEvents),
    [data.people, data.sharedEvents],
  )

  const [visiblePersonIds, setVisiblePersonIds] = useState(
    () => new Set(data.people.map((p) => p.id)),
  )
  const [stateVisible, setStateVisible] = useState(true)
  const [selected, setSelected] = useState<LaidOutEvent | null>(null)

  const trackRef = useRef<HTMLDivElement>(null)
  const [trackSize, setTrackSize] = useState({ width: 800, height: 500 })

  const { minYear, maxYear } = useMemo(
    () =>
      computeDataRange(data.people, data.stateEvents, data.sharedEvents),
    [data],
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

  const { rows, events, rowHeights } = useMemo(() => {
    const baseRows = buildRows(orderedPeople, visiblePersonIds, stateVisible)
    const laid = assignLanes(
      baseRows,
      data.people,
      data.stateEvents,
      data.sharedEvents,
      visiblePersonIds,
      stateVisible,
    )

    const collapsedCount = laid.rows.filter((r) => r.collapsed).length
    const expanded = laid.rows.filter((r) => !r.collapsed)
    const totalLanes =
      expanded.reduce((sum, r) => sum + r.laneCount, 0) || 1
    const available = Math.max(
      trackSize.height - collapsedCount * COLLAPSED_ROW_HEIGHT,
      80,
    )

    const heights = laid.rows.map((r) => {
      if (r.collapsed) return COLLAPSED_ROW_HEIGHT
      return Math.max((r.laneCount / totalLanes) * available, 48)
    })

    const expandedSum = heights
      .filter((_, i) => !laid.rows[i].collapsed)
      .reduce((a, b) => a + b, 0)
    if (expandedSum > 0 && Math.abs(expandedSum - available) > 1) {
      const scale = available / expandedSum
      for (let i = 0; i < heights.length; i++) {
        if (!laid.rows[i].collapsed) heights[i] *= scale
      }
    }

    return {
      rows: laid.rows,
      events: laid.events,
      rowHeights: heights,
    }
  }, [
    orderedPeople,
    visiblePersonIds,
    stateVisible,
    data.people,
    data.stateEvents,
    data.sharedEvents,
    trackSize.height,
  ])

  const canvasHeight = rowHeights.reduce((a, b) => a + b, 0)

  const togglePerson = (id: string) => {
    setVisiblePersonIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        if (next.size === 1 && !stateVisible) return prev
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const toggleState = () => {
    setStateVisible((prev) => {
      if (prev && visiblePersonIds.size === 0) return prev
      return !prev
    })
  }

  return (
    <div className="timeline-page">
      <header className="timeline-chrome" data-timeline-no-pan>
        <Link href="/" className="timeline-chrome__home">
          ← מצב האומה
        </Link>
        <h1 className="timeline-chrome__title">ציר זמן</h1>
        <ZoomControls
          onZoomIn={viewport.zoomIn}
          onZoomOut={viewport.zoomOut}
          onShowAll={viewport.showAll}
          isFitted={viewport.isFitted}
        />
      </header>

      <div className="timeline-body" dir="ltr">
        <PortraitColumn
          rows={rows}
          rowHeights={rowHeights}
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
              rows={rows}
              events={events}
              rowHeights={rowHeights}
              viewStart={viewport.viewStart}
              viewEnd={viewport.viewEnd}
              width={trackSize.width}
              height={canvasHeight}
              onSelectEvent={setSelected}
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
        people={data.people}
        onClose={() => setSelected(null)}
      />
    </div>
  )
}

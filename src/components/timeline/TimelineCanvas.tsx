'use client'

import type { LaidOutEvent } from '@/content/timeline/types'
import type { TimelineRow } from '@/lib/timeline/layout'
import { yearToX } from '@/lib/timeline/layout'
import { yearTicks } from '@/lib/timeline/ticks'
import { EventBlock } from './EventBlock'

interface TimelineCanvasProps {
  rows: TimelineRow[]
  events: LaidOutEvent[]
  rowHeights: number[]
  viewStart: number
  viewEnd: number
  width: number
  height: number
  onSelectEvent: (laid: LaidOutEvent) => void
}

export function TimelineCanvas({
  rows,
  events,
  rowHeights,
  viewStart,
  viewEnd,
  width,
  height,
  onSelectEvent,
}: TimelineCanvasProps) {
  const span = viewEnd - viewStart
  const pixelsPerYear = span > 0 && width > 0 ? width / span : 1
  const ticks = yearTicks(viewStart, viewEnd, pixelsPerYear)

  // Cumulative top offsets for rows
  const rowTops: number[] = []
  let y = 0
  for (const h of rowHeights) {
    rowTops.push(y)
    y += h
  }

  return (
    <div
      className="timeline-canvas"
      style={{ width, height }}
    >
      {/* Vertical year gridlines */}
      <div className="timeline-canvas__grid" aria-hidden="true">
        {ticks.map((year) => {
          const x = yearToX(year, viewStart, viewEnd, width)
          return (
            <span
              key={year}
              className="timeline-canvas__gridline"
              style={{ left: x }}
            />
          )
        })}
      </div>

      {/* Row backgrounds / separators */}
      {rows.map((row, i) => (
        <div
          key={row.id}
          className={`timeline-canvas__row timeline-canvas__row--${row.kind}`}
          style={{
            top: rowTops[i],
            height: rowHeights[i],
            borderColor: row.color,
          }}
        />
      ))}

      {/* Events */}
      {events.map((laid) => {
        const left = yearToX(laid.startYear, viewStart, viewEnd, width)
        const right = yearToX(laid.endYear, viewStart, viewEnd, width)
        const blockWidth = Math.max(right - left, 6)

        const topRow = laid.rowStart
        const bottomRow = laid.rowEnd
        const rowTop = rowTops[topRow] ?? 0

        // Sum heights of covered rows
        let blockHeight = 0
        for (let r = topRow; r <= bottomRow; r++) {
          blockHeight += rowHeights[r] ?? 0
        }

        const maxLanes = Math.max(
          ...Array.from(
            { length: bottomRow - topRow + 1 },
            (_, i) => rows[topRow + i]?.laneCount ?? 1,
          ),
        )
        const laneHeight = blockHeight / maxLanes
        const padding = 4
        const eventTop = rowTop + laid.lane * laneHeight + padding
        const eventHeight = Math.max(laneHeight - padding * 2, 10)

        return (
          <EventBlock
            key={laid.event.id}
            laid={laid}
            left={left}
            width={blockWidth}
            top={eventTop}
            height={eventHeight}
            onSelect={onSelectEvent}
          />
        )
      })}
    </div>
  )
}

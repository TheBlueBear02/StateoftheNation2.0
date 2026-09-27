'use client'

import type { LaidOutEvent, TimelineEra } from '@/content/timeline/types'
import {
  ERA_BAND_HEIGHT,
  ERA_TO_EVENTS_GAP,
  EVENT_BLOCK_HEIGHT,
  EVENT_H_GAP_PX,
  EVENT_LAYER_SLOT,
  MIN_EVENT_WIDTH_PX,
  yearToX,
} from '@/lib/timeline/layout'
import { yearTicks } from '@/lib/timeline/ticks'
import { EraBand } from './EraBand'
import { EventBlock } from './EventBlock'

interface TimelineCanvasProps {
  eras: TimelineEra[]
  events: LaidOutEvent[]
  layerCount: number
  viewStart: number
  viewEnd: number
  width: number
  height: number
  onSelectEvent: (laid: LaidOutEvent) => void
  onSelectEra: (era: TimelineEra) => void
}

export function TimelineCanvas({
  eras,
  events,
  layerCount,
  viewStart,
  viewEnd,
  width,
  height,
  onSelectEvent,
  onSelectEra,
}: TimelineCanvasProps) {
  const span = viewEnd - viewStart
  const pixelsPerYear = span > 0 && width > 0 ? width / span : 1
  const ticks = yearTicks(viewStart, viewEnd, pixelsPerYear)
  const layers = Math.max(layerCount, 1)
  const layerSlot = EVENT_LAYER_SLOT
  const blockHeight = EVENT_BLOCK_HEIGHT
  const eventsOffsetY = ERA_BAND_HEIGHT + ERA_TO_EVENTS_GAP

  return (
    <div className="timeline-canvas" style={{ width, height }}>
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

      <EraBand
        eras={eras}
        viewStart={viewStart}
        viewEnd={viewEnd}
        width={width}
        height={ERA_BAND_HEIGHT}
        onSelectEra={onSelectEra}
      />

      {/* Compact shared layers packed below the era band */}
      <div className="timeline-canvas__layers" aria-hidden="true">
        {Array.from({ length: layers }, (_, i) => (
          <div
            key={i}
            className="timeline-canvas__layer"
            style={{
              top: eventsOffsetY + i * layerSlot,
              height: layerSlot,
            }}
          />
        ))}
      </div>

      {events.map((laid) => {
        const left = yearToX(laid.startYear, viewStart, viewEnd, width)
        const right = yearToX(laid.endYear, viewStart, viewEnd, width)
        const blockWidth = Math.max(
          right - left - EVENT_H_GAP_PX,
          MIN_EVENT_WIDTH_PX,
        )
        const eventTop =
          eventsOffsetY +
          laid.lane * layerSlot +
          (layerSlot - blockHeight) / 2

        return (
          <EventBlock
            key={laid.event.id}
            laid={laid}
            left={left}
            width={blockWidth}
            top={eventTop}
            height={blockHeight}
            onSelect={onSelectEvent}
          />
        )
      })}
    </div>
  )
}

'use client'

import type { LaidOutEvent } from '@/content/timeline/types'
import { formatEventDateRange } from '@/lib/timeline/dates'

interface EventBlockProps {
  laid: LaidOutEvent
  left: number
  width: number
  top: number
  height: number
  onSelect: (laid: LaidOutEvent) => void
}

export function EventBlock({
  laid,
  left,
  width,
  top,
  height,
  onSelect,
}: EventBlockProps) {
  const { event, colors, kind } = laid
  const isNarrow = width < 28
  const showTitle = width >= 56
  const dateLabel = formatEventDateRange(event.startDate, event.endDate)

  const bgStyle =
    colors.length === 1
      ? colors[0]
      : `repeating-linear-gradient(135deg, ${colors
          .map((c, i) => `${c} ${i * 8}px ${(i + 1) * 8}px`)
          .join(', ')})`

  return (
    <button
      type="button"
      className={`timeline-event timeline-event--${kind}${isNarrow ? ' timeline-event--narrow' : ''}`}
      style={{
        left,
        width: Math.max(width, 6),
        top,
        height,
        background: bgStyle,
      }}
      title={`${event.title} · ${dateLabel}`}
      aria-label={`${event.title}, ${dateLabel}`}
      data-timeline-no-pan
      onClick={(e) => {
        e.stopPropagation()
        onSelect(laid)
      }}
    >
      {showTitle ? (
        <span className="timeline-event__title" dir="rtl">
          {event.title}
        </span>
      ) : null}
    </button>
  )
}

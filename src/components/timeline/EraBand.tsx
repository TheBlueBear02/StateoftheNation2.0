'use client'

import type { TimelineEra } from '@/content/timeline/types'
import { softenColor } from '@/lib/timeline/colors'
import { eventYearRange, formatEventDateRange } from '@/lib/timeline/dates'
import { yearToX } from '@/lib/timeline/layout'

interface EraBandProps {
  eras: TimelineEra[]
  viewStart: number
  viewEnd: number
  width: number
  height: number
  onSelectEra: (era: TimelineEra) => void
}

export function EraBand({
  eras,
  viewStart,
  viewEnd,
  width,
  height,
  onSelectEra,
}: EraBandProps) {
  return (
    <div
      className="timeline-eras"
      style={{ width, height }}
      aria-label="תקופות בציר הזמן"
    >
      {eras.map((era) => {
        const { startYear, endYear } = eventYearRange(
          era.startDate,
          era.endDate,
        )
        const left = yearToX(startYear, viewStart, viewEnd, width)
        const right = yearToX(endYear, viewStart, viewEnd, width)
        const blockWidth = Math.max(right - left, 2)
        const dateLabel = formatEventDateRange(era.startDate, era.endDate)
        const showLabel = blockWidth >= 48

        return (
          <button
            key={era.id}
            type="button"
            className="timeline-era"
            style={{
              left,
              width: blockWidth,
              height,
              backgroundColor: softenColor(era.color),
            }}
            title={`${era.name} · ${dateLabel}`}
            aria-label={`התמקד בתקופת ${era.name}, ${dateLabel}`}
            data-timeline-no-pan
            onClick={(e) => {
              e.stopPropagation()
              onSelectEra(era)
            }}
          >
            {showLabel ? (
              <span className="timeline-era__name" dir="rtl">
                {era.name}
              </span>
            ) : null}
          </button>
        )
      })}
    </div>
  )
}

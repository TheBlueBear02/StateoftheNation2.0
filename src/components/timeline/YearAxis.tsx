'use client'

import { yearTicks } from '@/lib/timeline/ticks'
import { yearToX } from '@/lib/timeline/layout'

interface YearAxisProps {
  viewStart: number
  viewEnd: number
  width: number
}

export function YearAxis({ viewStart, viewEnd, width }: YearAxisProps) {
  const span = viewEnd - viewStart
  const pixelsPerYear = span > 0 ? width / span : 1
  const ticks = yearTicks(viewStart, viewEnd, pixelsPerYear)

  return (
    <div className="timeline-axis" aria-hidden="true">
      <div className="timeline-axis__line" />
      <div className="timeline-axis__ticks">
        {ticks.map((year) => {
          const x = yearToX(year, viewStart, viewEnd, width)
          return (
            <span
              key={year}
              className="timeline-axis__tick"
              style={{ left: x }}
            >
              <span className="timeline-axis__mark" />
              <span className="timeline-axis__label">{year}</span>
            </span>
          )
        })}
      </div>
    </div>
  )
}

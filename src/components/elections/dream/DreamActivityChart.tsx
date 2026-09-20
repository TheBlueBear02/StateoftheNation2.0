'use client'

import { useMemo, useState, type MouseEvent } from 'react'
import type { DreamDashboardActivityDay } from '../../../lib/fetchDreamCabinetDashboard'

type DreamActivityChartProps = {
  days: DreamDashboardActivityDay[]
}

const CHART_WIDTH = 720
const CHART_HEIGHT = 260
const MARGIN = { top: 16, right: 12, bottom: 36, left: 40 }
const PLOT_WIDTH = CHART_WIDTH - MARGIN.left - MARGIN.right
const PLOT_HEIGHT = CHART_HEIGHT - MARGIN.top - MARGIN.bottom

function formatDayMonth(isoDate: string): string {
  const [, month, day] = isoDate.split('-').map(Number)
  if (!month || !day) return isoDate
  return `${day}.${month}`
}

export function DreamActivityChart({ days }: DreamActivityChartProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 })

  const maxClients = useMemo(
    () => Math.max(...days.map((day) => day.uniqueClients), 1),
    [days],
  )

  const barWidth =
    days.length > 0 ? Math.max(2, (PLOT_WIDTH / days.length) * 0.72) : 0
  const gap =
    days.length > 0 ? Math.max(1, (PLOT_WIDTH / days.length) * 0.28) : 0

  const onMove = (event: MouseEvent<SVGRectElement>, index: number) => {
    const svg = event.currentTarget.ownerSVGElement
    if (!svg) return
    const rect = svg.getBoundingClientRect()
    setHoveredIndex(index)
    setTooltipPos({
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    })
  }

  if (days.length === 0) {
    return (
      <p className="dream-dash__muted">אין פעילות להצגה ב־30 הימים האחרונים.</p>
    )
  }

  const hovered = hoveredIndex !== null ? days[hoveredIndex] : null
  const labelStep = Math.max(1, Math.ceil(days.length / 8))

  return (
    <div className="dream-dash-chart">
      <svg
        className="dream-dash-chart__svg"
        viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
        role="img"
        aria-label="פעילות יומית — משתמשים ייחודיים לפי יום"
      >
        {[0, 0.25, 0.5, 0.75, 1].map((fraction) => {
          const y = MARGIN.top + PLOT_HEIGHT * (1 - fraction)
          const value = Math.round(maxClients * fraction)
          return (
            <g key={fraction}>
              <line
                x1={MARGIN.left}
                x2={MARGIN.left + PLOT_WIDTH}
                y1={y}
                y2={y}
                className="dream-dash-chart__grid"
              />
              <text
                x={MARGIN.left - 8}
                y={y + 4}
                textAnchor="end"
                className="dream-dash-chart__axis"
              >
                {value}
              </text>
            </g>
          )
        })}

        {days.map((day, index) => {
          const x = MARGIN.left + index * (barWidth + gap) + gap / 2
          const height =
            day.uniqueClients <= 0
              ? 0
              : Math.max(2, (day.uniqueClients / maxClients) * PLOT_HEIGHT)
          const y = MARGIN.top + PLOT_HEIGHT - height
          const active = hoveredIndex === index

          return (
            <g key={day.date}>
              <rect
                x={x}
                y={y}
                width={barWidth}
                height={height}
                className={
                  active
                    ? 'dream-dash-chart__bar dream-dash-chart__bar--active'
                    : 'dream-dash-chart__bar'
                }
                onMouseEnter={(event) => onMove(event, index)}
                onMouseMove={(event) => onMove(event, index)}
                onMouseLeave={() => setHoveredIndex(null)}
              />
              {index % labelStep === 0 || index === days.length - 1 ? (
                <text
                  x={x + barWidth / 2}
                  y={CHART_HEIGHT - 12}
                  textAnchor="middle"
                  className="dream-dash-chart__axis"
                >
                  {formatDayMonth(day.date)}
                </text>
              ) : null}
            </g>
          )
        })}
      </svg>

      {hovered ? (
        <div
          className="dream-dash-chart__tooltip"
          style={{ left: tooltipPos.x, top: tooltipPos.y }}
          role="status"
        >
          <strong>{formatDayMonth(hovered.date)}</strong>
          <span>{hovered.uniqueClients} משתמשים ייחודיים</span>
          <span>{hovered.pickWrites} עדכוני בחירה</span>
        </div>
      ) : null}
    </div>
  )
}

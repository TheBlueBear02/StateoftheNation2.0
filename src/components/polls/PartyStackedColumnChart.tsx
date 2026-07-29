'use client'

import { useMemo } from 'react'
import {
  collectLegendParties,
  KNESSET_SEATS,
  type PollSnapshot,
} from '../../lib/pollChartData'

type PartyStackedColumnChartProps = {
  snapshots: PollSnapshot[]
  yearLabel?: string
}

const CHART_WIDTH = 720
const CHART_HEIGHT = 280
const MARGIN = { top: 12, right: 16, bottom: 56, left: 48 }
const PLOT_WIDTH = CHART_WIDTH - MARGIN.left - MARGIN.right
const PLOT_HEIGHT = CHART_HEIGHT - MARGIN.top - MARGIN.bottom

const GRID_LINES = [0, 25, 50, 75, 100]

export function PartyStackedColumnChart({
  snapshots,
  yearLabel,
}: PartyStackedColumnChartProps) {
  const legend = useMemo(() => collectLegendParties(snapshots), [snapshots])

  if (snapshots.length === 0) {
    return <p className="polls-empty">אין נתוני סקרים להצגה</p>
  }

  const columnWidth = Math.min(28, PLOT_WIDTH / snapshots.length - 4)
  const columnGap = snapshots.length > 1
    ? (PLOT_WIDTH - columnWidth * snapshots.length) / (snapshots.length - 1)
    : 0

  const toY = (pct: number) =>
    MARGIN.top + PLOT_HEIGHT - (pct / 100) * PLOT_HEIGHT

  const title = yearLabel
    ? `ממוצע מנדטים בסקרים ${yearLabel}`
    : 'ממוצע מנדטים בסקרים'

  return (
    <section
      className="polls-chart polls-chart--stacked"
      aria-labelledby="party-stack-title"
    >
      <h2 id="party-stack-title" className="polls-chart__title polls-chart__title--small">
        {title}
      </h2>

      <div className="polls-stacked-layout">
        <ul className="polls-stacked-legend" aria-label="מקרא מפלגות">
          {legend.map((party) => (
            <li key={party.partyId} className="polls-stacked-legend__item">
              <span
                className="polls-stacked-legend__swatch"
                style={{ backgroundColor: party.partyColor ?? '#4890fd' }}
              />
              <span className="polls-stacked-legend__name">{party.partyName}</span>
            </li>
          ))}
        </ul>

        <svg
          className="polls-stacked-svg"
          viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
          role="img"
          aria-label={title}
        >
          {GRID_LINES.map((pct) => {
            const y = toY(pct)
            return (
              <g key={pct}>
                <line
                  x1={MARGIN.left}
                  y1={y}
                  x2={CHART_WIDTH - MARGIN.right}
                  y2={y}
                  className="polls-stacked-svg__grid"
                />
                <text
                  x={MARGIN.left - 8}
                  y={y + 4}
                  className="polls-stacked-svg__axis-label"
                  textAnchor="end"
                >
                  {pct}%
                </text>
              </g>
            )
          })}

          {snapshots.map((snapshot, colIdx) => {
            const x =
              MARGIN.left + colIdx * (columnWidth + columnGap)
            let yOffset = 0

            return (
              <g key={snapshot.pollId}>
                {snapshot.parties.map((party) => {
                  const segmentHeight = (party.share / 100) * PLOT_HEIGHT
                  const y = toY(yOffset + party.share)
                  const rect = (
                    <rect
                      key={`${snapshot.pollId}-${party.partyId}`}
                      x={x}
                      y={y}
                      width={columnWidth}
                      height={segmentHeight}
                      fill={party.partyColor ?? '#4890fd'}
                    >
                      <title>
                        {party.partyName}: {party.seats} מנדטים ({snapshot.label})
                      </title>
                    </rect>
                  )
                  yOffset += party.share
                  return rect
                })}
                <text
                  x={x + columnWidth / 2}
                  y={CHART_HEIGHT - MARGIN.bottom + 36}
                  className="polls-stacked-svg__date-label"
                  textAnchor="middle"
                  transform={`rotate(-90, ${x + columnWidth / 2}, ${CHART_HEIGHT - MARGIN.bottom + 36})`}
                >
                  {snapshot.label}
                </text>
              </g>
            )
          })}

          <text
            x={MARGIN.left}
            y={CHART_HEIGHT - 8}
            className="polls-stacked-svg__footnote"
          >
            כל עמודה = סקר בודד · סה״כ {KNESSET_SEATS} מנדטים
          </text>
        </svg>
      </div>
    </section>
  )
}

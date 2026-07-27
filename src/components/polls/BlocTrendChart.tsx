import { useState, type MouseEvent } from 'react'
import {
  DISPLAY_BLOC_COLORS,
  DISPLAY_BLOC_LABELS,
  DISPLAY_BLOC_ORDER,
  KNESSET_SEATS,
  cleanPollPublisher,
  type DisplayBlocKey,
  type PollSnapshot,
} from '../../lib/pollChartData'
import { formatFieldwork } from '../../hooks/usePolls'

type BlocTrendChartProps = {
  snapshots: PollSnapshot[]
}

const MAJORITY_SEATS = 60
const MAJORITY_PCT = 50

const CHART_WIDTH = 720
const ROW_HEIGHT = 22
const MARGIN = { top: 40, right: 16, bottom: 32, left: 78 }
const PLOT_WIDTH = CHART_WIDTH - MARGIN.left - MARGIN.right
const DATE_LABEL_GAP = 14

const GRID_LINES = [0, 25, 50, 75, 100]

function sumDisplaySeats(snapshot: PollSnapshot): number {
  return DISPLAY_BLOC_ORDER.reduce(
    (sum, bloc) => sum + snapshot.displayBlocTotals[bloc],
    0,
  )
}

export function BlocTrendChart({ snapshots }: BlocTrendChartProps) {
  const [hoveredId, setHoveredId] = useState<number | null>(null)
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 })

  if (snapshots.length === 0) {
    return null
  }

  // Newest polls at the top
  const ordered = [...snapshots].reverse()

  const chartHeight = MARGIN.top + ordered.length * ROW_HEIGHT + MARGIN.bottom
  const toX = (pct: number) => MARGIN.left + (pct / 100) * PLOT_WIDTH
  const majorityX = toX(MAJORITY_PCT)
  const plotBottom = chartHeight - MARGIN.bottom
  const seatToWidth = (seats: number) => (seats / KNESSET_SEATS) * PLOT_WIDTH
  const hovered = ordered.find((s) => s.pollId === hoveredId) ?? null

  const handleRowEnter = (pollId: number, event: MouseEvent<SVGGElement>) => {
    setHoveredId(pollId)
    setTooltipPos({ x: event.clientX, y: event.clientY })
  }

  const handleRowMove = (event: MouseEvent<SVGGElement>) => {
    setTooltipPos({ x: event.clientX, y: event.clientY })
  }

  const handleRowLeave = () => {
    setHoveredId(null)
  }

  return (
    <section className="polls-chart polls-chart--bloc-trend" aria-labelledby="bloc-trend-title">
      <h2 id="bloc-trend-title" className="polls-chart__title">
        חלוקה לגושים לאורך זמן
      </h2>

      <div className="polls-bloc-legend" aria-label="מקרא גושים">
        {DISPLAY_BLOC_ORDER.map((bloc) => (
          <span key={bloc} className="polls-bloc-legend__item">
            <span
              className="polls-bloc-legend__swatch"
              style={{ backgroundColor: DISPLAY_BLOC_COLORS[bloc] }}
            />
            {DISPLAY_BLOC_LABELS[bloc]}
          </span>
        ))}
      </div>

      <div className="polls-bloc-trend-wrap">
        <svg
          className="polls-bloc-trend-svg"
          viewBox={`0 0 ${CHART_WIDTH} ${chartHeight}`}
          role="img"
          aria-label="מגמת חלוקה לגושים לאורך זמן עם קו 60 מנדטים"
        >
          {GRID_LINES.map((pct) => {
            const x = toX(pct)
            return (
              <g key={pct}>
                <line
                  x1={x}
                  y1={MARGIN.top - 8}
                  x2={x}
                  y2={plotBottom}
                  className="polls-bloc-trend-svg__grid"
                />
                <text
                  x={x}
                  y={chartHeight - 8}
                  className="polls-bloc-trend-svg__axis-label"
                  textAnchor="middle"
                >
                  {pct}%
                </text>
              </g>
            )
          })}

          {ordered.map((snapshot, rowIdx) => {
            const y = MARGIN.top + rowIdx * ROW_HEIGHT
            const assigned = sumDisplaySeats(snapshot)
            // Shrink only if a poll exceeds 120 after merging sibling columns.
            const scale = assigned > KNESSET_SEATS ? KNESSET_SEATS / assigned : 1
            let xOffset = 0
            const isHovered = hoveredId === snapshot.pollId

            return (
              <g
                key={snapshot.pollId}
                className={`polls-bloc-trend-svg__row${isHovered ? ' polls-bloc-trend-svg__row--hovered' : ''}`}
                onMouseEnter={(event) => handleRowEnter(snapshot.pollId, event)}
                onMouseMove={handleRowMove}
                onMouseLeave={handleRowLeave}
              >
                <rect
                  x={0}
                  y={y}
                  width={CHART_WIDTH}
                  height={ROW_HEIGHT}
                  className="polls-bloc-trend-svg__hit"
                />
                <text
                  x={MARGIN.left - DATE_LABEL_GAP}
                  y={y + ROW_HEIGHT / 2 + 4}
                  className="polls-bloc-trend-svg__date-label"
                  textAnchor="end"
                >
                  {snapshot.shortLabel}
                </text>
                {DISPLAY_BLOC_ORDER.map((bloc: DisplayBlocKey) => {
                  const seats = snapshot.displayBlocTotals[bloc] * scale
                  if (seats <= 0) return null
                  const width = seatToWidth(seats)
                  const x = MARGIN.left + xOffset
                  xOffset += width
                  return (
                    <rect
                      key={bloc}
                      x={x}
                      y={y}
                      width={width}
                      height={ROW_HEIGHT - 4}
                      fill={DISPLAY_BLOC_COLORS[bloc]}
                    />
                  )
                })}
              </g>
            )
          })}

          <g className="polls-bloc-trend-svg__majority" aria-hidden="true">
            <line
              x1={majorityX}
              y1={MARGIN.top - 4}
              x2={majorityX}
              y2={plotBottom}
              className="polls-bloc-trend-svg__majority-line"
            />
            <text
              x={majorityX}
              y={MARGIN.top - 12}
              className="polls-bloc-trend-svg__majority-label"
              textAnchor="middle"
            >
              {MAJORITY_SEATS} מנדטים
            </text>
          </g>
        </svg>

        {hovered && (
          <div
            className="polls-bloc-tooltip"
            style={{ left: tooltipPos.x + 14, top: tooltipPos.y + 14 }}
            role="tooltip"
          >
            <div className="polls-bloc-tooltip__date">
              {formatFieldwork(hovered.fieldworkStart, hovered.fieldworkEnd)}
            </div>
            <div className="polls-bloc-tooltip__pollster">
              {hovered.pollsterHe ?? hovered.pollster}
            </div>
            <div className="polls-bloc-tooltip__publisher">
              {cleanPollPublisher(hovered.publisher)}
            </div>
            {hovered.sampleSize !== null && (
              <div className="polls-bloc-tooltip__sample">
                מדגם: {hovered.sampleSize.toLocaleString('he-IL')}
              </div>
            )}
            <div className="polls-bloc-tooltip__blocs">
              {DISPLAY_BLOC_ORDER.map((bloc) => {
                const seats = hovered.displayBlocTotals[bloc]
                if (seats <= 0) return null
                return (
                  <span key={bloc} className="polls-bloc-tooltip__bloc">
                    <span
                      className="polls-bloc-tooltip__swatch"
                      style={{ backgroundColor: DISPLAY_BLOC_COLORS[bloc] }}
                    />
                    {DISPLAY_BLOC_LABELS[bloc]} {Math.round(seats)}
                  </span>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </section>
  )
}

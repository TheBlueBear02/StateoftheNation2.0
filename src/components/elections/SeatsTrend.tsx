import { useState, type CSSProperties, type FocusEvent, type MouseEvent } from 'react'
import { Link } from 'react-router-dom'
import { formatFieldwork, usePolls } from '../../hooks/usePolls'
import {
  computePartyLastNTrend,
  type PartySeatsTrendPoint,
} from '../../lib/pollChartData'

const TREND_POLL_COUNT = 5
/** Fetch enough rows so scenario / future fieldwork filters still leave 5 usable polls. */
const POLL_FETCH_LIMIT = 30
const HIT_RADIUS = 10

type SeatsTrendProps = {
  partyId: number
  color: string | null
}

function cleanPublisher(publisher: string): string {
  return publisher.replace(/\s*\[[^\]]*\]\s*/g, ' ').replace(/\s+/g, ' ').trim()
}

function buildSparklinePoints(values: readonly number[]): string {
  if (values.length === 0) return ''
  if (values.length === 1) return '60,30'

  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1

  return values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * 120
      const y = 48 - ((value - min) / range) * 36
      return `${x},${y}`
    })
    .join(' ')
}

function sparklineDot(values: readonly number[], index: number): { x: number; y: number } {
  if (values.length === 1) return { x: 60, y: 30 }

  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const value = values[index] ?? 0

  return {
    x: (index / (values.length - 1)) * 120,
    y: 48 - ((value - min) / range) * 36,
  }
}

export function SeatsTrend({ partyId, color }: SeatsTrendProps) {
  const accentColor = color ?? '#4890fd'
  const style = { '--party-color': accentColor } as CSSProperties
  const { polls, loading, error } = usePolls(POLL_FETCH_LIMIT)
  const { seatsAvg, points, trend, pollCount } = computePartyLastNTrend(
    polls,
    partyId,
    TREND_POLL_COUNT,
  )
  const [hoveredPollId, setHoveredPollId] = useState<number | null>(null)
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 })

  const sparklinePoints = buildSparklinePoints(trend)
  const displaySeats = seatsAvg === null ? null : Math.round(seatsAvg)
  const hasTrend = points.length > 0
  const hovered =
    points.find((point) => point.pollId === hoveredPollId) ?? null

  const showTooltip = (
    point: PartySeatsTrendPoint,
    clientX: number,
    clientY: number,
  ) => {
    setHoveredPollId(point.pollId)
    setTooltipPos({ x: clientX, y: clientY })
  }

  const moveTooltip = (event: MouseEvent) => {
    setTooltipPos({ x: event.clientX, y: event.clientY })
  }

  const hideTooltip = () => {
    setHoveredPollId(null)
  }

  const handleHitFocus = (
    point: PartySeatsTrendPoint,
    event: FocusEvent<SVGCircleElement>,
  ) => {
    const rect = event.currentTarget.getBoundingClientRect()
    showTooltip(point, rect.left + rect.width / 2, rect.top)
  }

  return (
    <section className="party-detail-card seats-trend" style={style} aria-labelledby="seats-title">
      <div className="seats-trend__copy">
        <p className="seats-trend__label">
          {loading
            ? 'טוען סקרים…'
            : hasTrend
              ? `ממוצע ${pollCount} הסקרים האחרונים`
              : 'נתוני סקרים'}
        </p>
        <h2 id="seats-title" className="seats-trend__value">
          {loading ? '…' : displaySeats !== null ? displaySeats : '—'}
        </h2>
        <p className="seats-trend__caption">
          {error
            ? 'לא ניתן לטעון סקרים'
            : hasTrend
              ? 'מנדטים בממוצע נוכחי'
              : loading
                ? 'מנדטים'
                : 'אין סקרים זמינים'}
        </p>
        {hasTrend ? (
          <Link to="/elections/polls" className="seats-trend__link">
            לכל הסקרים
          </Link>
        ) : null}
      </div>

      {hasTrend ? (
        <div className="seats-trend__chart-wrap">
          <svg
            className="seats-trend__chart"
            viewBox="0 0 120 58"
            role="img"
            aria-label={`מגמת מנדטים ב-${pollCount} הסקרים האחרונים: ${trend.join(', ')}`}
          >
            <polyline className="seats-trend__grid" points="0,48 120,48" />
            <polyline className="seats-trend__grid" points="0,30 120,30" />
            <polyline className="seats-trend__grid" points="0,12 120,12" />
            <polyline className="seats-trend__line" points={sparklinePoints} />
            {points.map((point, index) => {
              const { x, y } = sparklineDot(trend, index)
              const isHovered = hoveredPollId === point.pollId

              return (
                <g key={point.pollId}>
                  <circle
                    className={
                      isHovered
                        ? 'seats-trend__dot seats-trend__dot--active'
                        : 'seats-trend__dot'
                    }
                    cx={x}
                    cy={y}
                    r={isHovered ? 3.6 : 2.8}
                  />
                  <circle
                    className="seats-trend__hit"
                    cx={x}
                    cy={y}
                    r={HIT_RADIUS}
                    onMouseEnter={(event) =>
                      showTooltip(point, event.clientX, event.clientY)
                    }
                    onMouseMove={moveTooltip}
                    onMouseLeave={hideTooltip}
                    onFocus={(event) => handleHitFocus(point, event)}
                    onBlur={hideTooltip}
                    tabIndex={0}
                    role="button"
                    aria-label={`${formatFieldwork(point.fieldworkStart, point.fieldworkEnd)}, ${point.pollsterHe ?? point.pollster}, ${point.seats} מנדטים`}
                  />
                </g>
              )
            })}
          </svg>

          {hovered ? (
            <div
              className="seats-trend-tooltip"
              style={{ left: tooltipPos.x + 14, top: tooltipPos.y + 14 }}
              role="tooltip"
            >
              <div className="seats-trend-tooltip__seats">
                {hovered.seats} מנדטים
              </div>
              <div className="seats-trend-tooltip__date">
                {formatFieldwork(hovered.fieldworkStart, hovered.fieldworkEnd)}
              </div>
              <div className="seats-trend-tooltip__pollster">
                {hovered.pollsterHe ?? hovered.pollster}
              </div>
              <div className="seats-trend-tooltip__publisher">
                {cleanPublisher(hovered.publisher)}
              </div>
              {hovered.sampleSize !== null ? (
                <div className="seats-trend-tooltip__sample">
                  מדגם: {hovered.sampleSize.toLocaleString('he-IL')}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}

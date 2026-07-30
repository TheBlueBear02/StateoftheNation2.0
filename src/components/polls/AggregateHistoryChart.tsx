'use client'

import { useEffect, useMemo, useState, type MouseEvent } from 'react'
import {
  usePollAggregates,
  type PartyTrendSeries,
} from '../../hooks/usePollAggregates'
import {
  DEFAULT_PARTY_TREND_SHORT_NAMES,
  normalizePartyShortName,
} from '../../lib/pollChartData'

const CHART_WIDTH = 720
const CHART_HEIGHT = 360
const MARGIN = { top: 20, right: 20, bottom: 44, left: 40 }
const PLOT_WIDTH = CHART_WIDTH - MARGIN.left - MARGIN.right
const PLOT_HEIGHT = CHART_HEIGHT - MARGIN.top - MARGIN.bottom
const FALLBACK_COLOR = '#4890fd'
const WEIGHTED_LABEL = 'ממוצע משוקלל'

function seriesColor(series: PartyTrendSeries): string {
  return series.partyColor?.trim() || FALLBACK_COLOR
}

function formatDayMonth(isoDate: string): string {
  const [year, month, day] = isoDate.split('-').map(Number)
  if (!year || !month || !day) return isoDate
  return `${day}.${month}`
}

function defaultPartyIds(series: PartyTrendSeries[]): number[] {
  const wanted = new Set(
    DEFAULT_PARTY_TREND_SHORT_NAMES.map((name) => normalizePartyShortName(name)),
  )
  const matched = series
    .filter((item) =>
      wanted.has(
        normalizePartyShortName(item.partyShortName ?? item.partyName),
      ),
    )
    .map((item) => item.partyId)

  if (matched.length > 0) return matched

  return series
    .slice()
    .sort((a, b) => {
      const aLast = a.segments.at(-1)?.at(-1)?.seatsAvg ?? 0
      const bLast = b.segments.at(-1)?.at(-1)?.seatsAvg ?? 0
      return bLast - aLast
    })
    .slice(0, 3)
    .map((item) => item.partyId)
}

function seatsAtDate(series: PartyTrendSeries, date: string): number | null {
  for (const segment of series.segments) {
    for (const point of segment) {
      if (point.date === date) return point.seatsAvg
    }
  }
  return null
}

export function AggregateHistoryChart() {
  const { historical, current, loading, error } = usePollAggregates()
  const [selectedPartyIds, setSelectedPartyIds] = useState<Set<number> | null>(
    null,
  )
  const [hoveredDateIndex, setHoveredDateIndex] = useState<number | null>(null)
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 })
  const [brokenLogoIds, setBrokenLogoIds] = useState<Set<number>>(() => new Set())

  const dates = useMemo(() => {
    const set = new Set<string>()
    for (const series of historical) {
      for (const segment of series.segments) {
        for (const point of segment) {
          set.add(point.date)
        }
      }
    }
    return [...set].sort((a, b) => a.localeCompare(b))
  }, [historical])

  useEffect(() => {
    if (historical.length === 0) return

    const availableIds = new Set(historical.map((series) => series.partyId))
    const defaults = defaultPartyIds(historical)

    setSelectedPartyIds((currentIds) => {
      if (currentIds === null) {
        return new Set(defaults)
      }

      const kept = [...currentIds].filter((id) => availableIds.has(id))
      if (kept.length > 0) {
        return new Set(kept)
      }

      return new Set(defaults)
    })
  }, [historical])

  const effectiveSelectedIds =
    selectedPartyIds ?? new Set(defaultPartyIds(historical))

  const visibleSeries = historical.filter((series) =>
    effectiveSelectedIds.has(series.partyId),
  )

  if (loading) {
    return (
      <section className="polls-chart polls-chart--aggregate-history">
        <p className="polls-empty">טוען מגמת ממוצע משוקלל…</p>
      </section>
    )
  }

  if (error) {
    return (
      <section className="polls-chart polls-chart--aggregate-history">
        <p className="polls-error">{error}</p>
      </section>
    )
  }

  if (historical.length === 0 || dates.length === 0) {
    return (
      <section className="polls-chart polls-chart--aggregate-history">
        <h2 className="polls-chart__title">מגמת ממוצע משוקלל</h2>
        <p className="polls-empty">
          אין עדיין שורות ב־poll_aggregates. הריצו את שלב 5 בצינור כדי למלא
          ממוצעים יומיים.
        </p>
      </section>
    )
  }

  const maxSeats = Math.max(
    ...visibleSeries.flatMap((series) =>
      series.segments.flatMap((segment) =>
        segment.map((point) => point.seatsAvg),
      ),
    ),
    1,
  )
  const yMax = Math.ceil(maxSeats / 5) * 5 || 5
  const yTicks: number[] = []
  const yStep = yMax <= 20 ? 5 : yMax <= 40 ? 10 : 15
  for (let tick = 0; tick <= yMax; tick += yStep) {
    yTicks.push(tick)
  }
  if (yTicks[yTicks.length - 1] !== yMax) {
    yTicks.push(yMax)
  }

  const toX = (index: number) => {
    if (dates.length === 1) {
      return MARGIN.left + PLOT_WIDTH / 2
    }
    return MARGIN.left + (index / (dates.length - 1)) * PLOT_WIDTH
  }

  const toY = (seats: number) =>
    MARGIN.top + PLOT_HEIGHT - (seats / yMax) * PLOT_HEIGHT

  const dateIndex = new Map(dates.map((date, index) => [date, index]))
  const dateLabelStep = Math.max(1, Math.ceil(dates.length / 8))

  const handlePartyToggle = (partyId: number) => {
    setSelectedPartyIds((currentIds) => {
      const next = new Set(currentIds ?? [])
      if (next.has(partyId)) {
        if (next.size <= 1) return next
        next.delete(partyId)
      } else {
        next.add(partyId)
      }
      return next
    })
  }

  const handleLogoError = (partyId: number) => {
    setBrokenLogoIds((current) => {
      if (current.has(partyId)) return current
      const next = new Set(current)
      next.add(partyId)
      return next
    })
  }

  const handleDateEnter = (index: number, event: MouseEvent) => {
    setHoveredDateIndex(index)
    setTooltipPos({ x: event.clientX, y: event.clientY })
  }

  const handleDateMove = (event: MouseEvent) => {
    setTooltipPos({ x: event.clientX, y: event.clientY })
  }

  const handleDateLeave = () => {
    setHoveredDateIndex(null)
  }

  const hoveredDate =
    hoveredDateIndex !== null ? dates[hoveredDateIndex] : null

  const sortedLegend = [...historical].sort((a, b) => {
    const aLast = a.segments.at(-1)?.at(-1)?.seatsAvg ?? 0
    const bLast = b.segments.at(-1)?.at(-1)?.seatsAvg ?? 0
    return bLast - aLast
  })

  return (
    <section
      className="polls-chart polls-chart--aggregate-history"
      aria-labelledby="aggregate-history-title"
    >
      <div className="polls-chart__header">
        <div className="polls-chart__heading">
          <h2 id="aggregate-history-title" className="polls-chart__title">
            <span className="polls-chart__title-main">
              מגמת ממוצע משוקלל
            </span>
            {current ? (
              <span className="polls-chart__title-date">
                | עדכני ל־{formatDayMonth(current.asOfDate)}
              </span>
            ) : null}
          </h2>
          <p className="polls-aggregate-history__hint">
            ממוצע נע של סקרים מ־14 הימים האחרונים: סקרים חדשים שוקלים יותר.
          </p>
        </div>
      </div>

      <ul className="polls-party-trend-legend" aria-label="בחירת מפלגות להצגה">
        {sortedLegend.map((series) => {
          const isSelected = effectiveSelectedIds.has(series.partyId)
          const color = seriesColor(series)

          return (
            <li key={series.partyId}>
              <button
                type="button"
                className={`polls-party-trend-legend__btn${
                  isSelected ? '' : ' polls-party-trend-legend__btn--hidden'
                }`}
                style={{ borderColor: color }}
                onClick={() => handlePartyToggle(series.partyId)}
                aria-pressed={isSelected}
                aria-label={series.partyShortName ?? series.partyName}
                title={
                  isSelected
                    ? `הסר את ${series.partyName}`
                    : `הוסף את ${series.partyName}`
                }
              >
                {series.partyLogoUrl && !brokenLogoIds.has(series.partyId) ? (
                  <img
                    className="polls-party-trend-legend__logo"
                    src={series.partyLogoUrl}
                    alt=""
                    onError={() => handleLogoError(series.partyId)}
                  />
                ) : (
                  <span
                    className="polls-party-trend-legend__swatch"
                    style={{ backgroundColor: color }}
                    aria-hidden="true"
                  />
                )}
              </button>
            </li>
          )
        })}
      </ul>

      <div className="polls-party-trend-wrap">
        <svg
          className="polls-party-trend-svg"
          viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
          role="img"
          aria-label={`מגמת ${WEIGHTED_LABEL} לפי מפלגה לאורך זמן`}
        >
          {yTicks.map((tick) => {
            const y = toY(tick)
            return (
              <g key={tick}>
                <line
                  x1={MARGIN.left}
                  y1={y}
                  x2={CHART_WIDTH - MARGIN.right}
                  y2={y}
                  className="polls-party-trend-svg__grid"
                />
                <text
                  x={MARGIN.left - 8}
                  y={y + 3}
                  className="polls-party-trend-svg__axis-label"
                  textAnchor="end"
                >
                  {tick}
                </text>
              </g>
            )
          })}

          {dates.map((date, index) => {
            if (
              index !== 0 &&
              index !== dates.length - 1 &&
              index % dateLabelStep !== 0
            ) {
              return null
            }

            return (
              <text
                key={`date-${date}`}
                x={toX(index)}
                y={CHART_HEIGHT - 12}
                className="polls-party-trend-svg__date-label"
                textAnchor="middle"
              >
                {formatDayMonth(date)}
              </text>
            )
          })}

          {visibleSeries.map((series) => {
            const color = seriesColor(series)

            return (
              <g key={series.partyId}>
                {series.segments.map((segment, segmentIndex) => {
                  const points = segment
                    .map((point) => {
                      const index = dateIndex.get(point.date)
                      if (index === undefined) return null
                      return `${toX(index)},${toY(point.seatsAvg)}`
                    })
                    .filter((value): value is string => value !== null)
                    .join(' ')

                  if (!points) return null

                  return (
                    <g key={`${series.partyId}-${segmentIndex}`}>
                      <polyline
                        points={points}
                        fill="none"
                        stroke={color}
                        strokeWidth={2.25}
                        strokeLinejoin="round"
                        strokeLinecap="round"
                        className="polls-party-trend-svg__line"
                      />
                      {segment.map((point) => {
                        const index = dateIndex.get(point.date)
                        if (index === undefined) return null
                        return (
                          <circle
                            key={`${series.partyId}-${point.date}`}
                            cx={toX(index)}
                            cy={toY(point.seatsAvg)}
                            r={hoveredDateIndex === index ? 4 : 2.5}
                            fill={color}
                            className="polls-party-trend-svg__dot"
                          />
                        )
                      })}
                    </g>
                  )
                })}
              </g>
            )
          })}

          {dates.map((date, index) => (
            <rect
              key={`hit-${date}`}
              x={toX(index) - 8}
              y={MARGIN.top}
              width={16}
              height={PLOT_HEIGHT}
              className="polls-party-trend-svg__hit"
              onMouseEnter={(event) => handleDateEnter(index, event)}
              onMouseMove={handleDateMove}
              onMouseLeave={handleDateLeave}
            />
          ))}

          {hoveredDateIndex !== null && (
            <line
              x1={toX(hoveredDateIndex)}
              y1={MARGIN.top}
              x2={toX(hoveredDateIndex)}
              y2={MARGIN.top + PLOT_HEIGHT}
              className="polls-party-trend-svg__hover-line"
            />
          )}
        </svg>

        {hoveredDate && hoveredDateIndex !== null && (
          <div
            className="polls-bloc-tooltip polls-party-trend-tooltip"
            style={{ left: tooltipPos.x + 14, top: tooltipPos.y + 14 }}
            role="tooltip"
          >
            <div className="polls-bloc-tooltip__date">
              {formatDayMonth(hoveredDate)} · {WEIGHTED_LABEL}
            </div>
            <div className="polls-bloc-tooltip__blocs">
              {visibleSeries.map((series) => {
                const seats = seatsAtDate(series, hoveredDate)
                if (seats === null) return null
                return (
                  <span key={series.partyId} className="polls-bloc-tooltip__bloc">
                    <span
                      className="polls-bloc-tooltip__swatch"
                      style={{ backgroundColor: seriesColor(series) }}
                    />
                    {series.partyShortName ?? series.partyName}{' '}
                    {seats.toFixed(1)}
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

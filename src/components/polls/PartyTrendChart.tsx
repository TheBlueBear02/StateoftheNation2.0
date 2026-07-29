'use client'

import { useEffect, useMemo, useState, type MouseEvent } from 'react'
import { formatFieldwork, type PollWithResults } from '../../hooks/usePolls'
import {
  buildPartyTrendLines,
  cleanPollPublisher,
  formatPollDayMonth,
  formatPollPublisher,
  selectRecentRegularPolls,
  selectRecentRegularPollsForPublisher,
  type PartyTrendLine,
} from '../../lib/pollChartData'

type PartyTrendChartProps = {
  polls: PollWithResults[]
}

/** How many recent polls from the selected publisher to plot. */
const PUBLISHER_TREND_POLLS = 10
const CHART_WIDTH = 720
const CHART_HEIGHT = 360
const MARGIN = { top: 20, right: 20, bottom: 44, left: 40 }
const PLOT_WIDTH = CHART_WIDTH - MARGIN.left - MARGIN.right
const PLOT_HEIGHT = CHART_HEIGHT - MARGIN.top - MARGIN.bottom
const FALLBACK_COLOR = '#4890fd'

function partyColor(line: PartyTrendLine): string {
  return line.partyColor?.trim() || FALLBACK_COLOR
}

function buildPolyline(
  seats: number[],
  toX: (index: number) => number,
  toY: (seats: number) => number,
): string {
  if (seats.length === 0) return ''
  return seats
    .map((value, index) => `${toX(index)},${toY(value)}`)
    .join(' ')
}

function pickRandomPublisherKey(
  logos: { key: string }[],
): string | null {
  if (logos.length === 0) return null
  return logos[Math.floor(Math.random() * logos.length)]?.key ?? null
}

export function PartyTrendChart({ polls }: PartyTrendChartProps) {
  const [selectedPublisherKey, setSelectedPublisherKey] = useState<string | null>(
    null,
  )
  const [publisherSeeded, setPublisherSeeded] = useState(false)
  /** null = not seeded yet; default seeds to the largest party only. */
  const [selectedPartyIds, setSelectedPartyIds] = useState<Set<number> | null>(
    null,
  )
  const [hoveredPollIndex, setHoveredPollIndex] = useState<number | null>(null)
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 })
  const [brokenLogoIds, setBrokenLogoIds] = useState<Set<number>>(() => new Set())

  const publisherLogos = useMemo(() => {
    const source = selectRecentRegularPolls(polls, 30)
    const logos: { key: string; logoUrl: string; label: string }[] = []
    const seen = new Set<string>()

    for (const poll of source) {
      if (!poll.publisherLogoUrl) continue
      const key = cleanPollPublisher(poll.publisher)
      if (!key || seen.has(key)) continue
      seen.add(key)
      logos.push({
        key,
        logoUrl: poll.publisherLogoUrl,
        label: formatPollPublisher(poll),
      })
    }

    return logos
  }, [polls])

  // Pick a random publisher once on load; keep a valid selection afterward.
  useEffect(() => {
    if (publisherLogos.length === 0) return

    if (!publisherSeeded) {
      setSelectedPublisherKey(pickRandomPublisherKey(publisherLogos))
      setPublisherSeeded(true)
      return
    }

    if (
      selectedPublisherKey === null ||
      !publisherLogos.some((p) => p.key === selectedPublisherKey)
    ) {
      setSelectedPublisherKey(pickRandomPublisherKey(publisherLogos))
    }
  }, [publisherLogos, publisherSeeded, selectedPublisherKey])

  const windowPolls = useMemo(() => {
    if (selectedPublisherKey === null) return []
    return selectRecentRegularPollsForPublisher(
      polls,
      selectedPublisherKey,
      PUBLISHER_TREND_POLLS,
    )
  }, [polls, selectedPublisherKey])

  const chronologicalPolls = useMemo(
    () => [...windowPolls].reverse(),
    [windowPolls],
  )

  const lines = useMemo(
    () => buildPartyTrendLines(windowPolls),
    [windowPolls],
  )

  // Default: only the largest party. Keep user picks across publisher changes;
  // if none of the previous picks remain, fall back to the new largest.
  useEffect(() => {
    if (lines.length === 0) return

    const availableIds = new Set(lines.map((line) => line.partyId))
    const largestId = lines[0]?.partyId

    setSelectedPartyIds((current) => {
      if (current === null) {
        return largestId !== undefined ? new Set([largestId]) : new Set()
      }

      const kept = [...current].filter((id) => availableIds.has(id))
      if (kept.length > 0) {
        return new Set(kept)
      }

      return largestId !== undefined ? new Set([largestId]) : new Set()
    })
  }, [lines])

  const effectiveSelectedIds =
    selectedPartyIds ??
    (lines[0] !== undefined ? new Set([lines[0].partyId]) : new Set<number>())

  const visibleLines = lines.filter((line) =>
    effectiveSelectedIds.has(line.partyId),
  )

  if (
    selectedPublisherKey === null ||
    chronologicalPolls.length === 0 ||
    lines.length === 0
  ) {
    return null
  }

  const maxSeats = Math.max(
    ...visibleLines.flatMap((line) => line.seats),
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
    if (chronologicalPolls.length === 1) {
      return MARGIN.left + PLOT_WIDTH / 2
    }
    return MARGIN.left + (index / (chronologicalPolls.length - 1)) * PLOT_WIDTH
  }

  const toY = (seats: number) =>
    MARGIN.top + PLOT_HEIGHT - (seats / yMax) * PLOT_HEIGHT

  const publisherLabel =
    publisherLogos.find((p) => p.key === selectedPublisherKey)?.label ??
    selectedPublisherKey

  const handlePublisherSelect = (key: string) => {
    setSelectedPublisherKey(key)
    setHoveredPollIndex(null)
  }

  const handleLogoError = (partyId: number) => {
    setBrokenLogoIds((current) => {
      if (current.has(partyId)) return current
      const next = new Set(current)
      next.add(partyId)
      return next
    })
  }

  const handlePartyToggle = (partyId: number) => {
    setSelectedPartyIds((current) => {
      const next = new Set(current ?? [])
      if (next.has(partyId)) {
        // Keep at least one party visible.
        if (next.size <= 1) return next
        next.delete(partyId)
      } else {
        next.add(partyId)
      }
      return next
    })
  }

  const handlePollEnter = (index: number, event: MouseEvent) => {
    setHoveredPollIndex(index)
    setTooltipPos({ x: event.clientX, y: event.clientY })
  }

  const handlePollMove = (event: MouseEvent) => {
    setTooltipPos({ x: event.clientX, y: event.clientY })
  }

  const handlePollLeave = () => {
    setHoveredPollIndex(null)
  }

  const hoveredPoll =
    hoveredPollIndex !== null ? chronologicalPolls[hoveredPollIndex] : null

  const dateLabelStep = Math.max(1, Math.ceil(chronologicalPolls.length / 8))

  return (
    <section
      className="polls-chart polls-chart--party-trend"
      aria-labelledby="party-trend-title"
    >
      <div className="polls-chart__header">
        <div className="polls-chart__heading">
          <h2 id="party-trend-title" className="polls-chart__title">
            <span className="polls-chart__title-main">
              מגמת מפלגות — {publisherLabel}
            </span>
          </h2>

          {publisherLogos.length > 0 && (
            <div className="polls-bar-chart__publisher-block">
              <div
                className="polls-bar-chart__publisher-logos polls-bar-chart__publisher-logos--has-selection"
                aria-label="בחירת ערוץ"
              >
                {publisherLogos.map((publisher) => {
                  const isSelected = selectedPublisherKey === publisher.key

                  return (
                    <button
                      key={publisher.key}
                      type="button"
                      className={`polls-bar-chart__publisher-logo-btn${
                        isSelected
                          ? ' polls-bar-chart__publisher-logo-btn--selected'
                          : ''
                      }`}
                      onClick={() => handlePublisherSelect(publisher.key)}
                      aria-pressed={isSelected}
                      title={publisher.label}
                    >
                      <img
                        className="polls-bar-chart__publisher-logo"
                        src={publisher.logoUrl}
                        alt={publisher.label}
                      />
                    </button>
                  )
                })}
              </div>
              <p className="polls-bar-chart__publisher-hint">
                לבחירת ערוץ לחצו על הלוגו
              </p>
            </div>
          )}
        </div>
      </div>

      <ul className="polls-party-trend-legend" aria-label="בחירת מפלגות להצגה">
        {lines.map((line) => {
          const isSelected = effectiveSelectedIds.has(line.partyId)
          const color = partyColor(line)

          return (
            <li key={line.partyId}>
              <button
                type="button"
                className={`polls-party-trend-legend__btn${
                  isSelected ? '' : ' polls-party-trend-legend__btn--hidden'
                }`}
                onClick={() => handlePartyToggle(line.partyId)}
                aria-pressed={isSelected}
                aria-label={line.partyShortName ?? line.partyName}
                title={
                  isSelected
                    ? `הסר את ${line.partyName}`
                    : `הוסף את ${line.partyName}`
                }
              >
                {line.partyLogoUrl && !brokenLogoIds.has(line.partyId) ? (
                  <img
                    className="polls-party-trend-legend__logo"
                    src={line.partyLogoUrl}
                    alt=""
                    onError={() => handleLogoError(line.partyId)}
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
          aria-label="מגמת מנדטים לפי מפלגה לאורך זמן"
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

          {chronologicalPolls.map((poll, index) => {
            if (
              index !== 0 &&
              index !== chronologicalPolls.length - 1 &&
              index % dateLabelStep !== 0
            ) {
              return null
            }

            return (
              <text
                key={`date-${poll.id}`}
                x={toX(index)}
                y={CHART_HEIGHT - 12}
                className="polls-party-trend-svg__date-label"
                textAnchor="middle"
              >
                {formatPollDayMonth(poll.fieldworkEnd)}
              </text>
            )
          })}

          {visibleLines.map((line) => {
            const color = partyColor(line)
            const points = buildPolyline(line.seats, toX, toY)

            return (
              <g key={line.partyId}>
                <polyline
                  points={points}
                  fill="none"
                  stroke={color}
                  strokeWidth={2.25}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  className="polls-party-trend-svg__line"
                />
                {line.seats.map((seats, index) => (
                  <circle
                    key={`${line.partyId}-${chronologicalPolls[index]?.id ?? index}`}
                    cx={toX(index)}
                    cy={toY(seats)}
                    r={
                      hoveredPollIndex === index
                        ? 4
                        : chronologicalPolls.length <= 10
                          ? 3
                          : 2.25
                    }
                    fill={color}
                    className="polls-party-trend-svg__dot"
                  />
                ))}
              </g>
            )
          })}

          {chronologicalPolls.map((poll, index) => (
            <rect
              key={`hit-${poll.id}`}
              x={toX(index) - 10}
              y={MARGIN.top}
              width={20}
              height={PLOT_HEIGHT}
              className="polls-party-trend-svg__hit"
              onMouseEnter={(event) => handlePollEnter(index, event)}
              onMouseMove={handlePollMove}
              onMouseLeave={handlePollLeave}
            />
          ))}

          {hoveredPollIndex !== null && (
            <line
              x1={toX(hoveredPollIndex)}
              y1={MARGIN.top}
              x2={toX(hoveredPollIndex)}
              y2={MARGIN.top + PLOT_HEIGHT}
              className="polls-party-trend-svg__hover-line"
            />
          )}
        </svg>

        {hoveredPoll && hoveredPollIndex !== null && (
          <div
            className="polls-bloc-tooltip polls-party-trend-tooltip"
            style={{ left: tooltipPos.x + 14, top: tooltipPos.y + 14 }}
            role="tooltip"
          >
            <div className="polls-bloc-tooltip__date">
              {formatFieldwork(
                hoveredPoll.fieldworkStart,
                hoveredPoll.fieldworkEnd,
              )}
            </div>
            <div className="polls-bloc-tooltip__pollster">
              {hoveredPoll.pollsterHe ?? hoveredPoll.pollster}
            </div>
            <div className="polls-bloc-tooltip__publisher">
              {formatPollPublisher(hoveredPoll)}
            </div>
            {hoveredPoll.sampleSize !== null && (
              <div className="polls-bloc-tooltip__sample">
                מדגם: {hoveredPoll.sampleSize.toLocaleString('he-IL')}
              </div>
            )}
            <div className="polls-bloc-tooltip__blocs">
              {visibleLines.map((line) => {
                const seats = line.seats[hoveredPollIndex] ?? 0
                return (
                  <span key={line.partyId} className="polls-bloc-tooltip__bloc">
                    <span
                      className="polls-bloc-tooltip__swatch"
                      style={{ backgroundColor: partyColor(line) }}
                    />
                    {line.partyShortName ?? line.partyName} {seats}
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

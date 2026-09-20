'use client'

import { useMemo, useState } from 'react'
import type {
  OfficeDashboardMinisterEra,
  OfficeDashboardPoint,
} from '../../lib/fetchOfficeDashboard'
import {
  estimateChartYAxisLeftMarginForPoints,
  getChartSeriesHorizontalInsets,
} from './IndexTrendChart'
import './OfficeErasBar.css'

type OfficeErasBarProps = {
  eras: OfficeDashboardMinisterEra[]
  points: OfficeDashboardPoint[]
  chartType?: string | null
}

type VisibleEra = {
  era: OfficeDashboardMinisterEra
  leftPct: number
  widthPct: number
}

const FALLBACK_COLOR = '#9a9a9a'
/** Shown when a minister has no photo (eras segment + tooltip). */
const MINISTER_PLACEHOLDER_SRC = '/images/offices/minister_placeholder.svg'
/** Approx tooltip half-width as % of the eras plot (keeps card inside the chart box). */
const TOOLTIP_HALF_WIDTH_PCT = 14

function dateToMs(value: string): number {
  const t = Date.parse(value.slice(0, 10))
  return Number.isFinite(t) ? t : 0
}

/** True when the series is annual (labels like "2023"), matching the old site. */
function isYearOnlySeries(points: OfficeDashboardPoint[]): boolean {
  if (points.length === 0) return false
  return points.every((p) => /^\d{4}$/.test((p.label || '').trim()))
}

function yearFromPoint(point: OfficeDashboardPoint): string {
  const label = (point.label || '').trim()
  if (/^\d{4}$/.test(label)) return label
  return point.recordedAt.slice(0, 4)
}

/**
 * Chart domain for era alignment. Year-only series span Jan 1 of the first
 * label year through Dec 31 of the last (old site pushed `YYYY-12`) so
 * late-year starts like בן גביר (29.12.2022) still cover following annual points.
 */
function chartDomain(points: OfficeDashboardPoint[]): {
  start: string
  end: string
} | null {
  if (points.length === 0) return null
  if (isYearOnlySeries(points)) {
    return {
      start: `${yearFromPoint(points[0]!)}-01-01`,
      end: `${yearFromPoint(points[points.length - 1]!)}-12-31`,
    }
  }
  return {
    start: points[0]!.recordedAt,
    end: points[points.length - 1]!.recordedAt,
  }
}

/** Linear calendar fraction within [domainStart, domainEnd] (old year-only timeline). */
function dateToTimeFraction(
  date: string,
  domainStart: string,
  domainEnd: string,
): number {
  const startMs = dateToMs(domainStart)
  const endMs = dateToMs(domainEnd)
  if (endMs <= startMs) return 0
  const t = dateToMs(date)
  if (t <= startMs) return 0
  if (t >= endMs) return 1
  return (t - startMs) / (endMs - startMs)
}

/**
 * Map a calendar date onto the chart's equal-spaced point axis by interpolating
 * between surrounding recordedAt values (so era edges sit under chart points).
 */
function dateToPointFraction(
  date: string,
  points: OfficeDashboardPoint[],
): number {
  if (points.length === 0) return 0
  if (points.length === 1) return 0.5

  const target = dateToMs(date)
  const first = dateToMs(points[0]!.recordedAt)
  const last = dateToMs(points[points.length - 1]!.recordedAt)

  if (target <= first) return 0
  if (target >= last) return 1

  for (let i = 0; i < points.length - 1; i++) {
    const a = dateToMs(points[i]!.recordedAt)
    const b = dateToMs(points[i + 1]!.recordedAt)
    if (target >= a && target <= b) {
      const local = b === a ? 0 : (target - a) / (b - a)
      return (i + local) / (points.length - 1)
    }
  }

  return 1
}

function formatDisplayDate(value: string): string {
  const iso = value.slice(0, 10)
  const [y, m, d] = iso.split('-')
  if (y && m && d) return `${d}.${m}.${y}`
  return iso
}

function formatEraRange(era: OfficeDashboardMinisterEra): string {
  const start = formatDisplayDate(era.startDate)
  const end = formatDisplayDate(era.endDate)
  const today = new Date().toISOString().slice(0, 10)
  if (era.endDate.slice(0, 10) >= today) {
    return `${start} – היום`
  }
  return `${start} – ${end}`
}

function eraKey(era: OfficeDashboardMinisterEra): string {
  return `${era.personId}-${era.startDate}`
}

function formatEraAriaLabel(era: OfficeDashboardMinisterEra): string {
  const party = era.factionName?.trim()
  const range = formatEraRange(era)
  return party
    ? `${era.fullName}, ${party}, ${range}`
    : `${era.fullName}, ${range}`
}

function clampTooltipCenter(leftPct: number, widthPct: number): number {
  const mid = leftPct + widthPct / 2
  return Math.min(
    100 - TOOLTIP_HALF_WIDTH_PCT,
    Math.max(TOOLTIP_HALF_WIDTH_PCT, mid),
  )
}

export function OfficeErasBar({ eras, points, chartType }: OfficeErasBarProps) {
  const [hoveredKey, setHoveredKey] = useState<string | null>(null)

  const visible = useMemo((): VisibleEra[] => {
    if (eras.length === 0) return []

    const mapAgainstPoints = (): VisibleEra[] => {
      const domain = chartDomain(points)
      if (!domain) return []
      const { start: domainStart, end: domainEnd } = domain
      const domainStartMs = dateToMs(domainStart)
      const domainEndMs = dateToMs(domainEnd)
      if (domainEndMs <= domainStartMs) return []

      const yearOnly = isYearOnlySeries(points)
      const toFrac = (date: string) =>
        yearOnly
          ? dateToTimeFraction(date, domainStart, domainEnd)
          : dateToPointFraction(date, points)

      const result: VisibleEra[] = []
      for (const era of eras) {
        const eraStartMs = dateToMs(era.startDate)
        const eraEndMs = dateToMs(era.endDate)
        if (eraEndMs <= domainStartMs || eraStartMs >= domainEndMs) continue

        const clampedStart =
          eraStartMs < domainStartMs ? domainStart : era.startDate
        const clampedEnd = eraEndMs > domainEndMs ? domainEnd : era.endDate
        let startFrac = toFrac(clampedStart)
        let endFrac = toFrac(clampedEnd)
        let widthFrac = Math.max(0, endFrac - startFrac)
        if (widthFrac <= 0) continue
        // Keep short overlaps visible on dense monthly series.
        const minWidth = 0.03
        if (widthFrac < minWidth) {
          widthFrac = minWidth
          if (startFrac + widthFrac > 1) {
            startFrac = Math.max(0, 1 - widthFrac)
          }
        }

        result.push({
          era,
          leftPct: startFrac * 100,
          widthPct: widthFrac * 100,
        })
      }
      return result
    }

    const fromPoints = mapAgainstPoints()
    if (fromPoints.length > 0) return fromPoints

    // Fallback: no era overlapped the chart domain (or domain was degenerate).
    // Lay out eras on their own timeline so the bar still appears.
    if (eras.length === 0) return []
    const startMs = dateToMs(eras[0]!.startDate)
    const endMs = dateToMs(eras[eras.length - 1]!.endDate)
    const span = Math.max(endMs - startMs, 1)
    return eras.map((era) => {
      const a = (dateToMs(era.startDate) - startMs) / span
      const b = (dateToMs(era.endDate) - startMs) / span
      const widthFrac = Math.max(b - a, 0.03)
      return {
        era,
        leftPct: a * 100,
        widthPct: Math.min(widthFrac, 1 - a) * 100,
      }
    })
  }, [eras, points])

  const hovered = useMemo(
    () => visible.find((item) => eraKey(item.era) === hoveredKey) ?? null,
    [visible, hoveredKey],
  )

  if (visible.length === 0) return null

  const { insetLeftPct, insetRightPct } = getChartSeriesHorizontalInsets(
    points.length,
    chartType,
    estimateChartYAxisLeftMarginForPoints(points.map((p) => p.value)),
  )

  return (
    <div
      className="office-eras-bar"
      role="list"
      aria-label="תקופות שרים"
      dir="ltr"
    >
      <div
        className="office-eras-bar__tooltip-lane"
        style={{
          marginInlineStart: `${insetLeftPct}%`,
          marginInlineEnd: `${insetRightPct}%`,
        }}
        aria-hidden={!hovered}
      >
        {hovered ? (
          <div
            className="office-eras-bar__tooltip"
            role="tooltip"
            dir="rtl"
            style={{
              left: `${clampTooltipCenter(hovered.leftPct, hovered.widthPct)}%`,
            }}
          >
            {hovered.era.imageUrl ? (
              <img
                src={hovered.era.imageUrl}
                alt=""
                className="office-eras-bar__tooltip-photo"
                width={56}
                height={56}
              />
            ) : (
              <img
                src={MINISTER_PLACEHOLDER_SRC}
                alt=""
                className="office-eras-bar__tooltip-photo office-eras-bar__tooltip-photo--placeholder"
                width={56}
                height={56}
              />
            )}
            <div className="office-eras-bar__tooltip-text">
              <strong className="office-eras-bar__tooltip-name">
                {hovered.era.fullName}
              </strong>
              {hovered.era.factionName ? (
                <span className="office-eras-bar__tooltip-party">
                  {hovered.era.factionName}
                </span>
              ) : null}
              <span className="office-eras-bar__tooltip-dates">
                {formatEraRange(hovered.era)}
              </span>
            </div>
          </div>
        ) : null}
      </div>

      <div
        className="office-eras-bar__plot"
        style={{
          marginInlineStart: `${insetLeftPct}%`,
          marginInlineEnd: `${insetRightPct}%`,
        }}
      >
        {visible.map(({ era, leftPct, widthPct }) => {
          const color = era.factionColor?.trim() || FALLBACK_COLOR
          // Photo is ~52px; only show when the segment can fit a full circle.
          const showFull = widthPct >= 18
          const showPhoto = widthPct >= 9
          const photoOnly = showPhoto && !showFull
          const key = eraKey(era)
          const isHovered = hoveredKey === key
          const ariaLabel = formatEraAriaLabel(era)

          return (
            <div
              key={key}
              className={`office-eras-bar__era${
                isHovered ? ' office-eras-bar__era--hovered' : ''
              }${photoOnly ? ' office-eras-bar__era--photo-only' : ''}`}
              role="listitem"
              style={{
                left: `${leftPct}%`,
                width: `${widthPct}%`,
                backgroundColor: color,
              }}
              aria-label={ariaLabel}
              onMouseEnter={() => setHoveredKey(key)}
              onMouseLeave={() => setHoveredKey(null)}
              onFocus={() => setHoveredKey(key)}
              onBlur={() => setHoveredKey(null)}
              tabIndex={0}
            >
              <div
                className={`office-eras-bar__clip${
                  photoOnly ? ' office-eras-bar__clip--photo-only' : ''
                }`}
              >
                {showPhoto ? (
                  <img
                    src={era.imageUrl || MINISTER_PLACEHOLDER_SRC}
                    alt=""
                    className={`office-eras-bar__photo${
                      era.imageUrl
                        ? ''
                        : ' office-eras-bar__photo--placeholder'
                    }`}
                    width={52}
                    height={52}
                    loading="lazy"
                    decoding="async"
                  />
                ) : null}
                {showFull ? (
                  <div className="office-eras-bar__meta" dir="rtl">
                    <span className="office-eras-bar__name">{era.fullName}</span>
                    {era.factionName ? (
                      <span className="office-eras-bar__party">
                        {era.factionName}
                      </span>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

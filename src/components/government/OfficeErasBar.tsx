'use client'

import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import type {
  OfficeDashboardMinisterEra,
  OfficeDashboardPoint,
} from '../../lib/fetchOfficeDashboard'
import {
  CHART_WIDTH,
  chartBarEdgeXs,
  chartPointIndexToX,
  estimateChartYAxisLeftMarginForPoints,
  getChartSeriesEdgeXs,
} from './IndexTrendChart'
import './OfficeErasBar.css'

type OfficeErasBarProps = {
  eras: OfficeDashboardMinisterEra[]
  points: OfficeDashboardPoint[]
  chartType?: string | null
  /**
   * Same uiScale as IndexTrendChart so the Y-gutter / series alignment stays in sync
   * when fonts are enlarged on narrow viewports.
   */
  uiScale?: number
  /** Fires with the hovered era band (% of chart width + party color), or null on leave. */
  onHoverBand?: (
    band: { leftPct: number; widthPct: number; color: string | null } | null,
  ) => void
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
 * Chart domain for era clipping. Year-only series span Jan 1 of the first
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

/**
 * Fraction through a calendar year: 0 = Jan 1, 0.5 ≈ mid-year, 1 = Dec 31.
 */
function yearProgress(value: string): number {
  const iso = value.slice(0, 10)
  const [ys, ms, ds] = iso.split('-')
  const y = Number(ys)
  const m = Number(ms)
  const d = Number(ds)
  if (!y || !m || !d) return 0
  const start = Date.UTC(y, 0, 1)
  const end = Date.UTC(y, 11, 31)
  const t = Date.UTC(y, m - 1, d)
  if (end <= start) return 0
  return Math.min(1, Math.max(0, (t - start) / (end - start)))
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

function xToWidthPct(x: number): number {
  return (x / CHART_WIDTH) * 100
}

/**
 * Map a calendar date to an absolute % of chart width (same coords as bar
 * centers / x labels in IndexTrendChart).
 *
 * Year-only bar charts: each year occupies its bar — Jan 1 at the left edge,
 * mid-year near the center, Dec 31 at the right edge — so 05.2015 sits in the
 * middle of the 2015 bar instead of between 2015 and 2016 centers.
 */
function dateToChartWidthPct(
  date: string,
  points: OfficeDashboardPoint[],
  chartType: string | null | undefined,
  leftMargin: number,
): number {
  if (points.length === 0) return 0
  const n = points.length
  const yearOnly = isYearOnlySeries(points)
  const domain = chartDomain(points)
  const target = dateToMs(date)
  const { startX, endX } = getChartSeriesEdgeXs(n, chartType, leftMargin)
  const startPct = xToWidthPct(startX)
  const endPct = xToWidthPct(endX)
  const centerPct = (i: number) =>
    xToWidthPct(chartPointIndexToX(i, n, chartType, leftMargin))

  if (n === 1) {
    if (yearOnly && chartType === 'bar') {
      const { leftX, rightX } = chartBarEdgeXs(0, n, leftMargin)
      return xToWidthPct(lerp(leftX, rightX, yearProgress(date)))
    }
    return centerPct(0)
  }

  if (yearOnly && domain) {
    const domainStartMs = dateToMs(domain.start)
    const domainEndMs = dateToMs(domain.end)
    if (target <= domainStartMs) return startPct
    if (target >= domainEndMs) return endPct

    const years = points.map((p) => Number(yearFromPoint(p)))
    const dateYear = Number(date.slice(0, 4))
    const progress = yearProgress(date)

    const exactIdx = years.indexOf(dateYear)
    if (exactIdx >= 0) {
      if (chartType === 'bar') {
        const { leftX, rightX } = chartBarEdgeXs(exactIdx, n, leftMargin)
        return xToWidthPct(lerp(leftX, rightX, progress))
      }
      // Line: each year spans halfway to the previous/next point.
      const leftBound =
        exactIdx === 0
          ? startX
          : (chartPointIndexToX(exactIdx - 1, n, chartType, leftMargin) +
              chartPointIndexToX(exactIdx, n, chartType, leftMargin)) /
            2
      const rightBound =
        exactIdx === n - 1
          ? endX
          : (chartPointIndexToX(exactIdx, n, chartType, leftMargin) +
              chartPointIndexToX(exactIdx + 1, n, chartType, leftMargin)) /
            2
      return xToWidthPct(lerp(leftBound, rightBound, progress))
    }

    // Year not on the axis (gap between labeled years): place between neighbors.
    for (let i = 0; i < n - 1; i++) {
      const y0 = years[i]!
      const y1 = years[i + 1]!
      if (dateYear > y0 && dateYear < y1) {
        const startMs = dateToMs(`${y0}-12-31`)
        const endMs = dateToMs(`${y1}-01-01`)
        const local =
          endMs <= startMs ? 0 : (target - startMs) / (endMs - startMs)
        if (chartType === 'bar') {
          const left = chartBarEdgeXs(i, n, leftMargin).rightX
          const right = chartBarEdgeXs(i + 1, n, leftMargin).leftX
          return xToWidthPct(lerp(left, right, Math.min(1, Math.max(0, local))))
        }
        return lerp(centerPct(i), centerPct(i + 1), Math.min(1, Math.max(0, local)))
      }
    }

    if (dateYear < years[0]!) return startPct
    return endPct
  }

  const anchors = points.map((p) => dateToMs(p.recordedAt))
  const first = anchors[0]!
  const last = anchors[n - 1]!

  if (target <= first) return centerPct(0)
  if (target >= last) return centerPct(n - 1)

  for (let i = 0; i < n - 1; i++) {
    const a = anchors[i]!
    const b = anchors[i + 1]!
    if (target >= a && target <= b) {
      const local = b === a ? 0 : (target - a) / (b - a)
      return lerp(centerPct(i), centerPct(i + 1), local)
    }
  }

  return centerPct(n - 1)
}

function formatDisplayDate(value: string): string {
  const iso = value.slice(0, 10)
  const [y, m, d] = iso.split('-')
  if (y && m && d) return `${d}.${m}.${y}`
  return iso
}

/** Compact month.year for era-switch ticks under the bar. */
function formatMonthYear(value: string): string {
  const iso = value.slice(0, 10)
  const [y, m] = iso.split('-')
  if (y && m) return `${m}.${y}`
  return iso
}

type EraSwitchTick = {
  key: string
  leftPct: number
  label: string
}

/** Min horizontal gap (%) between switch labels so they stay readable. */
const SWITCH_TICK_MIN_GAP_PCT = 7

function formatEraRange(era: OfficeDashboardMinisterEra): string {
  const start = formatDisplayDate(era.startDate)
  const end = formatDisplayDate(era.endDate)
  const today = new Date().toISOString().slice(0, 10)
  if (era.endDate.slice(0, 10) >= today) {
    return `היום – ${start}`
  }
  return `${end} – ${start}`
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

/** Desktop / mobile photo diameters (must match OfficeErasBar.css). */
const PHOTO_SIZE_DESKTOP_PX = 42
const PHOTO_SIZE_MOBILE_PX = 30
/** Horizontal clip padding when showing a photo (photo-only uses 4px each side). */
const PHOTO_INLINE_PAD_PX = 8

export function OfficeErasBar({
  eras,
  points,
  chartType,
  uiScale = 1,
  onHoverBand,
}: OfficeErasBarProps) {
  const [hoveredKey, setHoveredKey] = useState<string | null>(null)
  const [plotWidthPx, setPlotWidthPx] = useState(0)
  const plotRef = useRef<HTMLDivElement | null>(null)
  const lastTouchRef = useRef(0)

  useLayoutEffect(() => {
    const node = plotRef.current
    if (!node) return
    const apply = (w: number) => {
      if (w > 0) {
        setPlotWidthPx((prev) => (Math.abs(prev - w) < 0.5 ? prev : w))
      }
    }
    apply(node.getBoundingClientRect().width)
    const ro =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver((entries) => {
            const entry = entries[0]
            apply(entry?.contentRect.width || node.getBoundingClientRect().width)
          })
        : null
    ro?.observe(node)
    return () => ro?.disconnect()
  }, [])

  const photoSizePx =
    plotWidthPx > 0 && plotWidthPx < 700
      ? PHOTO_SIZE_MOBILE_PX
      : PHOTO_SIZE_DESKTOP_PX
  /** Segment must fit a perfect circle — never squeeze photos into ellipses. */
  const minPhotoSegmentPx = photoSizePx + PHOTO_INLINE_PAD_PX

  const setEraHover = (
    key: string | null,
    band: {
      leftPct: number
      widthPct: number
      color: string | null
    } | null,
  ) => {
    setHoveredKey(key)
    onHoverBand?.(band)
  }

  const setEraHoverFromMouse = (
    key: string | null,
    band: {
      leftPct: number
      widthPct: number
      color: string | null
    } | null,
  ) => {
    if (Date.now() - lastTouchRef.current < 700) return
    setEraHover(key, band)
  }

  const leftMargin = useMemo(
    () =>
      estimateChartYAxisLeftMarginForPoints(
        points.map((p) => p.value),
        Math.max(1, uiScale),
      ),
    [points, uiScale],
  )

  const seriesStartPct = useMemo(() => {
    const { startX } = getChartSeriesEdgeXs(points.length, chartType, leftMargin)
    return (startX / CHART_WIDTH) * 100
  }, [points.length, chartType, leftMargin])

  const visible = useMemo((): VisibleEra[] => {
    if (eras.length === 0) return []

    const mapAgainstPoints = (): VisibleEra[] => {
      const domain = chartDomain(points)
      if (!domain) return []
      const { start: domainStart, end: domainEnd } = domain
      const domainStartMs = dateToMs(domainStart)
      const domainEndMs = dateToMs(domainEnd)
      if (domainEndMs <= domainStartMs) return []

      const result: VisibleEra[] = []
      for (const era of eras) {
        const eraStartMs = dateToMs(era.startDate)
        const eraEndMs = dateToMs(era.endDate)
        if (eraEndMs <= domainStartMs || eraStartMs >= domainEndMs) continue

        const clampedStart =
          eraStartMs < domainStartMs ? domainStart : era.startDate
        const clampedEnd = eraEndMs > domainEndMs ? domainEnd : era.endDate
        let leftPct = dateToChartWidthPct(
          clampedStart,
          points,
          chartType,
          leftMargin,
        )
        const rightPct = dateToChartWidthPct(
          clampedEnd,
          points,
          chartType,
          leftMargin,
        )
        let widthPct = Math.max(0, rightPct - leftPct)
        if (widthPct <= 0) continue
        // Keep short overlaps visible on dense monthly series (~3% of chart).
        const minWidth = 3
        if (widthPct < minWidth) {
          widthPct = minWidth
          if (leftPct + widthPct > 100) {
            leftPct = Math.max(0, 100 - widthPct)
          }
        }

        result.push({
          era,
          leftPct,
          widthPct,
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
  }, [eras, points, chartType, leftMargin])

  const hovered = useMemo(
    () => visible.find((item) => eraKey(item.era) === hoveredKey) ?? null,
    [visible, hoveredKey],
  )

  const switchTicks = useMemo((): EraSwitchTick[] => {
    const sorted = [...visible].sort((a, b) => a.leftPct - b.leftPct)
    const ticks: EraSwitchTick[] = []
    for (const item of sorted) {
      const leftPct = item.leftPct
      // Skip the series left edge; only mark minister switches.
      if (leftPct <= seriesStartPct + 0.4) continue
      const prev = ticks[ticks.length - 1]
      if (prev && leftPct - prev.leftPct < SWITCH_TICK_MIN_GAP_PCT) continue
      ticks.push({
        key: `switch-${eraKey(item.era)}`,
        leftPct,
        label: formatMonthYear(item.era.startDate),
      })
    }
    return ticks
  }, [visible, seriesStartPct])

  if (visible.length === 0) return null

  return (
    <div
      className="office-eras-bar"
      role="list"
      aria-label="תקופות שרים"
      dir="ltr"
    >
      <div
        className="office-eras-bar__tooltip-lane"
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

      <div className="office-eras-bar__plot" ref={plotRef}>
        {visible.map(({ era, leftPct, widthPct }) => {
          const color = era.factionColor?.trim() || FALLBACK_COLOR
          // Name/party when the segment is fairly wide (% of chart).
          const showFull = widthPct >= 14
          // Photos only when the segment is wide enough in CSS px for a true
          // circle (avoids max-width:100% ellipses on narrow mobile segments).
          const segmentPx =
            plotWidthPx > 0 ? (widthPct / 100) * plotWidthPx : 0
          const showPhoto =
            plotWidthPx > 0
              ? segmentPx >= minPhotoSegmentPx
              : widthPct >= 7
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
              onMouseEnter={() =>
                setEraHoverFromMouse(key, {
                  leftPct,
                  widthPct,
                  color: era.factionColor?.trim() || FALLBACK_COLOR,
                })
              }
              onMouseLeave={() => setEraHoverFromMouse(null, null)}
              onFocus={() =>
                setEraHover(key, {
                  leftPct,
                  widthPct,
                  color: era.factionColor?.trim() || FALLBACK_COLOR,
                })
              }
              onBlur={() => setEraHover(null, null)}
              onPointerUp={(e) => {
                if (e.pointerType !== 'touch' && e.pointerType !== 'pen') return
                lastTouchRef.current = Date.now()
                e.stopPropagation()
                if (isHovered) {
                  setEraHover(null, null)
                } else {
                  setEraHover(key, {
                    leftPct,
                    widthPct,
                    color: era.factionColor?.trim() || FALLBACK_COLOR,
                  })
                }
              }}
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
                    width={photoSizePx}
                    height={photoSizePx}
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

      {switchTicks.length > 0 ? (
        <div className="office-eras-bar__switches" aria-hidden="true">
          {switchTicks.map((tick) => (
            <span
              key={tick.key}
              className="office-eras-bar__switch"
              style={{ left: `${tick.leftPct}%` }}
            >
              {tick.label}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  )
}

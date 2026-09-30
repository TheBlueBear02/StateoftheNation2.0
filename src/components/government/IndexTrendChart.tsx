'use client'

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent, type PointerEvent } from 'react'
import type {
  OfficeDashboardIndex,
  OfficeDashboardMinisterEra,
  OfficeDashboardPoint,
} from '../../lib/fetchOfficeDashboard'
import { formatIndexValue } from '../../lib/fetchOfficeDashboard'
import './IndexTrendChart.css'

type EraHighlightBand = {
  leftPct: number
  widthPct: number
  color?: string | null
  /** Period average for this era; drawn as a dashed line across the band. */
  avg?: number | null
}

/** Horizontal color slice within a bar (0–1 along the bar width, LTR time). */
type BarColorSegment = {
  color: string
  startFrac: number
  endFrac: number
}

type IndexTrendChartProps = {
  index: OfficeDashboardIndex
  /**
   * Minister / PM eras used to paint bar fills (party color). Yearly bars that
   * span a minister switch are split left→right by days in office.
   */
  eras?: OfficeDashboardMinisterEra[]
  /** When false, hide white value labels (and their scrim) on bar charts. */
  showBarValues?: boolean
  /** Vertical band highlight(s) as % of chart width (selected eras). */
  highlightBand?: {
    leftPct: number
    widthPct: number
    color?: string | null
    avg?: number | null
  } | null
  highlightBands?: EraHighlightBand[]
  /**
   * Compensates SVG downscaling on narrow viewports so fonts/dots stay legible.
   * 1 on desktop (>=960px); up to 3 on phones. Shared with OfficeErasBar.
   * If omitted, the chart measures itself.
   */
  uiScale?: number
  /** Use a taller viewBox on narrow screens for more vertical plot room. */
  tall?: boolean
  /**
   * Shorter viewBox than the dashboard default (homepage carousel).
   * Ignored when `tall` is true.
   */
  compact?: boolean
  /**
   * Ignore viewport/self measurement — keep the explicit uiScale/tall props.
   * Used by the offscreen PNG export shell so mobile shares match desktop.
   */
  fixedLayout?: boolean
  /** Notify parent when self-measured scale changes (keeps eras bar in sync). */
  onMetricsChange?: (metrics: { uiScale: number; tall: boolean; width: number }) => void
}

export const CHART_WIDTH = 960
export const CHART_HEIGHT = 400
/** Compact homepage / teaser charts — shorter than the dashboard default. */
export const CHART_HEIGHT_COMPACT = 280
/** Taller plot on phones/tablets so series + labels have room (kept moderate so chart+eras fit a phone screen). */
export const CHART_HEIGHT_TALL = 500
/** Below this width, use tall chart + boosted label scale. */
export const CHART_MOBILE_MAX_WIDTH = 960
/** Target on-screen axis label size (CSS px) when width < CHART_MOBILE_MAX_WIDTH. */
const MOBILE_TARGET_LABEL_PX = 14
const BASE_AXIS_FONT = 13
/** Hard cap so Y-gutter / labels don't devour the plot on narrow phones. */
const MOBILE_UI_SCALE_CAP = 2.35

/**
 * Reliable layout width for chart scaling.
 * Chrome DevTools device mode can fire a spurious resize where `innerWidth`
 * jumps from the phone width (e.g. 375) to the desktop pane (~800). In that
 * case `screen.width` still reports the emulated device — prefer the smaller.
 */
export function readChartLayoutWidth(): number {
  if (typeof window === 'undefined') return CHART_WIDTH

  const inner = window.innerWidth || 0
  const client = document.documentElement?.clientWidth || 0
  const visual = window.visualViewport?.width || 0
  const screenW = window.screen?.width || 0

  const candidates = [inner, client, visual].filter((n) => n > 0)
  let width = candidates.length > 0 ? Math.min(...candidates) : CHART_WIDTH

  if (screenW > 0 && screenW <= CHART_MOBILE_MAX_WIDTH && screenW < width) {
    width = screenW
  }

  return Math.max(1, width)
}

export function getChartLayoutWidthDebug() {
  if (typeof window === 'undefined') {
    return {
      corrected: CHART_WIDTH,
      inner: 0,
      client: 0,
      visual: 0,
      screen: 0,
    }
  }
  return {
    corrected: readChartLayoutWidth(),
    inner: window.innerWidth || 0,
    client: document.documentElement?.clientWidth || 0,
    visual: window.visualViewport?.width || 0,
    screen: window.screen?.width || 0,
  }
}

/**
 * Scale so axis labels render near MOBILE_TARGET_LABEL_PX on narrow screens.
 * Desktop (≥960px) stays at 1. Phone ~375px → ~2.35; tablet ~768px → ~1.4.
 */
export function chartUiScaleForWidth(width: number): number {
  if (!(width > 0) || width >= CHART_MOBILE_MAX_WIDTH) return 1
  const raw =
    (MOBILE_TARGET_LABEL_PX * CHART_WIDTH) / (BASE_AXIS_FONT * width)
  return Math.min(MOBILE_UI_SCALE_CAP, Math.max(1, raw))
}

export function chartTallForWidth(width: number): boolean {
  return width > 0 && width < CHART_MOBILE_MAX_WIDTH
}

/** Soften gutter growth vs font scale so the plot stays usable on phones. */
function gutterScaleForUiScale(scale: number): number {
  const s = Math.max(1, scale)
  return 1 + (s - 1) * 0.5
}

/** Defaults; left is tightened per-series from Y tick label widths. */
export const CHART_MARGIN = { top: 28, right: 12, bottom: 28, left: 56 }

const WIDTH = CHART_WIDTH
const MARGIN = CHART_MARGIN

const BAR_SLOT_FILL = 0.72

/** Approx CSS-px width of an axis date/year label at the given font size. */
function estimateXAxisLabelWidth(label: string, fontSize: number): number {
  return Math.max(0, (label || '').length) * fontSize * 0.62
}

/**
 * Keep short ticks middle-anchored under the bar/point; only shift to start/end
 * when a long label (e.g. DD.MM.YYYY) would otherwise clip the SVG edge.
 */
function xAxisLabelTextAnchor(
  x: number,
  label: string,
  fontSize: number,
  leftEdge: number,
  rightEdge: number,
): 'start' | 'middle' | 'end' {
  const half = estimateXAxisLabelWidth(label, fontSize) / 2
  const pad = 2
  if (x + half > rightEdge - pad) return 'end'
  if (x - half < leftEdge + pad) return 'start'
  return 'middle'
}

/** Corner radius that stays proportional on narrow bars (avoids pill tops). */
function barCornerRadius(barW: number, barH: number, scale: number): number {
  const ideal = 10 * scale
  // Cap at ~22% of width so thin bars stay gently rounded, not semicircles.
  return Math.min(ideal, barW * 0.22, barH * 0.4)
}

/** White outline that shrinks with bar width so it doesn't eat the fill. */
function barStrokeWidth(barW: number, scale: number): number {
  const ideal = 1.75 * scale
  // ~12% of width, floored so hairline bars still get a faint edge.
  return Math.min(ideal, Math.max(0.4, barW * 0.12))
}
const ERA_HIGHLIGHT_FALLBACK = '#4890fd'
const ERA_HIGHLIGHT_OPACITY = 0.22
const BAR_DEFAULT_FILL = '#4890fd'
const BAR_DEFAULT_FILL_ACTIVE = '#3b7ae6'

/** Party color at low opacity — used for line-chart selected-era bands only. */
function eraHighlightFill(color: string | null | undefined): string {
  const raw = (color || ERA_HIGHLIGHT_FALLBACK).trim()
  const hex = raw.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i)
  if (hex) {
    let h = hex[1]!
    if (h.length === 3) {
      h = h
        .split('')
        .map((c) => c + c)
        .join('')
    }
    const r = Number.parseInt(h.slice(0, 2), 16)
    const g = Number.parseInt(h.slice(2, 4), 16)
    const b = Number.parseInt(h.slice(4, 6), 16)
    return `rgba(${r}, ${g}, ${b}, ${ERA_HIGHLIGHT_OPACITY})`
  }
  const rgb = raw.match(
    /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*[\d.]+\s*)?\)$/i,
  )
  if (rgb) {
    return `rgba(${rgb[1]}, ${rgb[2]}, ${rgb[3]}, ${ERA_HIGHLIGHT_OPACITY})`
  }
  return `rgba(72, 144, 253, ${ERA_HIGHLIGHT_OPACITY})`
}

function dateToMs(value: string): number {
  const t = Date.parse(value.slice(0, 10))
  return Number.isFinite(t) ? t : 0
}

function isYearOnlySeries(points: OfficeDashboardPoint[]): boolean {
  if (points.length === 0) return false
  return points.every((p) => /^\d{4}$/.test((p.label || '').trim()))
}

function yearFromPoint(point: OfficeDashboardPoint): string {
  const label = (point.label || '').trim()
  if (/^\d{4}$/.test(label)) return label
  return point.recordedAt.slice(0, 4)
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
}

function daysInYear(year: number): number {
  return isLeapYear(year) ? 366 : 365
}

/** Inclusive calendar-day overlap between an era and a calendar year. */
function eraOverlapDaysInYear(
  year: number,
  era: OfficeDashboardMinisterEra,
): number {
  const eraStart = dateToMs(era.startDate)
  const eraEnd = dateToMs(era.endDate)
  if (!(eraEnd >= eraStart)) return 0
  const yearStart = Date.UTC(year, 0, 1)
  const yearEnd = Date.UTC(year, 11, 31)
  const overlapStart = Math.max(eraStart, yearStart)
  const overlapEnd = Math.min(eraEnd, yearEnd)
  if (overlapEnd < overlapStart) return 0
  return Math.floor((overlapEnd - overlapStart) / 86_400_000) + 1
}

function normalizeHexColor(color: string | null | undefined): string | null {
  const raw = (color || '').trim()
  if (!raw) return null
  const hex = raw.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i)
  if (hex) {
    let h = hex[1]!
    if (h.length === 3) {
      h = h
        .split('')
        .map((c) => c + c)
        .join('')
    }
    return `#${h.toLowerCase()}`
  }
  return raw
}

/** Darken a hex/rgb color for the active (hovered) bar state. */
function darkenColor(color: string, amount = 0.14): string {
  const hex = color.match(/^#([0-9a-f]{6})$/i)
  if (hex) {
    const h = hex[1]!
    const channel = (start: number) => {
      const n = Number.parseInt(h.slice(start, start + 2), 16)
      return Math.max(0, Math.min(255, Math.round(n * (1 - amount))))
    }
    const r = channel(0).toString(16).padStart(2, '0')
    const g = channel(2).toString(16).padStart(2, '0')
    const b = channel(4).toString(16).padStart(2, '0')
    return `#${r}${g}${b}`
  }
  return color
}

function mergeAdjacentSegments(segments: BarColorSegment[]): BarColorSegment[] {
  if (segments.length <= 1) return segments
  const merged: BarColorSegment[] = []
  for (const seg of segments) {
    const prev = merged[merged.length - 1]
    if (prev && prev.color === seg.color && Math.abs(prev.endFrac - seg.startFrac) < 0.001) {
      prev.endFrac = seg.endFrac
    } else {
      merged.push({ ...seg })
    }
  }
  return merged
}

/**
 * Party-color fill plan for one bar. Yearly points that cover a minister
 * switch become multiple left→right slices proportional to days in office.
 * Gaps with no minister keep the default chart blue.
 */
function barColorSegmentsForPoint(
  point: OfficeDashboardPoint,
  eras: OfficeDashboardMinisterEra[],
  yearOnly: boolean,
): BarColorSegment[] {
  if (eras.length === 0) {
    return [{ color: BAR_DEFAULT_FILL, startFrac: 0, endFrac: 1 }]
  }

  if (yearOnly) {
    const year = Number(yearFromPoint(point))
    if (!year) {
      return [{ color: BAR_DEFAULT_FILL, startFrac: 0, endFrac: 1 }]
    }

    const yearStart = Date.UTC(year, 0, 1)
    const yearDayCount = daysInYear(year)
    const overlaps = eras
      .map((era) => {
        const days = eraOverlapDaysInYear(year, era)
        if (days <= 0) return null
        const eraStart = dateToMs(era.startDate)
        const eraEnd = dateToMs(era.endDate)
        const overlapStart = Math.max(eraStart, yearStart)
        const overlapEnd = Math.min(eraEnd, Date.UTC(year, 11, 31))
        const startFrac = Math.max(
          0,
          Math.min(1, Math.floor((overlapStart - yearStart) / 86_400_000) / yearDayCount),
        )
        const endFrac = Math.max(
          startFrac,
          Math.min(
            1,
            (Math.floor((overlapEnd - yearStart) / 86_400_000) + 1) / yearDayCount,
          ),
        )
        return {
          color:
            normalizeHexColor(era.factionColor) || BAR_DEFAULT_FILL,
          startFrac,
          endFrac,
          overlapStart,
        }
      })
      .filter((row): row is NonNullable<typeof row> => Boolean(row))
      .sort((a, b) => a.overlapStart - b.overlapStart)

    if (overlaps.length === 0) {
      return [{ color: BAR_DEFAULT_FILL, startFrac: 0, endFrac: 1 }]
    }

    const segments: BarColorSegment[] = []
    let cursor = 0
    for (const row of overlaps) {
      const start = Math.max(cursor, row.startFrac)
      const end = Math.max(start, row.endFrac)
      if (start > cursor + 0.001) {
        segments.push({
          color: BAR_DEFAULT_FILL,
          startFrac: cursor,
          endFrac: start,
        })
      }
      if (end > start + 0.001) {
        segments.push({
          color: row.color,
          startFrac: start,
          endFrac: end,
        })
      }
      cursor = Math.max(cursor, end)
    }
    if (cursor < 0.999) {
      segments.push({
        color: BAR_DEFAULT_FILL,
        startFrac: cursor,
        endFrac: 1,
      })
    }
    return mergeAdjacentSegments(segments)
  }

  const t = dateToMs(point.recordedAt)
  const match = eras.find((era) => {
    const start = dateToMs(era.startDate)
    const end = dateToMs(era.endDate)
    return t >= start && t <= end
  })
  return [
    {
      color: normalizeHexColor(match?.factionColor) || BAR_DEFAULT_FILL,
      startFrac: 0,
      endFrac: 1,
    },
  ]
}

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

/** Dominant party color for a single data point (longest year-overlap segment). */
function colorForPoint(
  point: OfficeDashboardPoint,
  eras: OfficeDashboardMinisterEra[],
  yearOnly: boolean,
): string {
  const segments = barColorSegmentsForPoint(point, eras, yearOnly)
  let best = segments[0]!
  for (const seg of segments) {
    if (seg.endFrac - seg.startFrac > best.endFrac - best.startFrac) {
      best = seg
    }
  }
  return best.color
}

/**
 * Map a calendar date onto the line series X (viewBox), matching eras-bar
 * year-only bounds (midpoints between points) and recordedAt interpolation.
 */
function dateToLineX(
  date: string,
  points: OfficeDashboardPoint[],
  toX: (i: number) => number,
  startX: number,
  endX: number,
  yearOnly: boolean,
): number {
  const n = points.length
  if (n === 0) return startX
  if (n === 1) return toX(0)

  const target = dateToMs(date)

  if (yearOnly) {
    const years = points.map((p) => Number(yearFromPoint(p)))
    const dateYear = Number(date.slice(0, 4))
    const progress = yearProgress(date)
    const exactIdx = years.indexOf(dateYear)
    if (exactIdx >= 0) {
      const leftBound =
        exactIdx === 0 ? startX : (toX(exactIdx - 1) + toX(exactIdx)) / 2
      const rightBound =
        exactIdx === n - 1 ? endX : (toX(exactIdx) + toX(exactIdx + 1)) / 2
      return lerp(leftBound, rightBound, progress)
    }
    for (let i = 0; i < n - 1; i++) {
      const y0 = years[i]!
      const y1 = years[i + 1]!
      if (dateYear > y0 && dateYear < y1) {
        const startMs = dateToMs(`${y0}-12-31`)
        const endMs = dateToMs(`${y1}-01-01`)
        const local =
          endMs <= startMs ? 0 : (target - startMs) / (endMs - startMs)
        return lerp(toX(i), toX(i + 1), Math.min(1, Math.max(0, local)))
      }
    }
    if (dateYear < years[0]!) return startX
    return endX
  }

  const anchors = points.map((p) => dateToMs(p.recordedAt))
  if (target <= anchors[0]!) return toX(0)
  if (target >= anchors[n - 1]!) return toX(n - 1)
  for (let i = 0; i < n - 1; i++) {
    const a = anchors[i]!
    const b = anchors[i + 1]!
    if (target >= a && target <= b) {
      const local = b === a ? 0 : (target - a) / (b - a)
      return lerp(toX(i), toX(i + 1), local)
    }
  }
  return toX(n - 1)
}

type LineColorStop = { offset: number; color: string }

/**
 * Hard left→right color stops for the line stroke / area fill, keyed by
 * minister era spans along the series.
 */
function buildLineEraColorStops(
  points: OfficeDashboardPoint[],
  eras: OfficeDashboardMinisterEra[],
  yearOnly: boolean,
  toX: (i: number) => number,
  startX: number,
  endX: number,
): LineColorStop[] {
  const span = endX - startX
  if (points.length === 0 || !(span > 0) || eras.length === 0) {
    return [
      { offset: 0, color: BAR_DEFAULT_FILL },
      { offset: 1, color: BAR_DEFAULT_FILL },
    ]
  }

  const toOffset = (x: number) =>
    Math.min(1, Math.max(0, (x - startX) / span))

  const sorted = [...eras].sort(
    (a, b) => dateToMs(a.startDate) - dateToMs(b.startDate),
  )

  type Seg = { start: number; end: number; color: string }
  const segs: Seg[] = []
  for (const era of sorted) {
    const x0 = dateToLineX(
      era.startDate,
      points,
      toX,
      startX,
      endX,
      yearOnly,
    )
    const x1 = dateToLineX(era.endDate, points, toX, startX, endX, yearOnly)
    const start = toOffset(Math.min(x0, x1))
    const end = toOffset(Math.max(x0, x1))
    if (end <= start + 0.0005) continue
    segs.push({
      start,
      end,
      color: normalizeHexColor(era.factionColor) || BAR_DEFAULT_FILL,
    })
  }

  if (segs.length === 0) {
    return [
      { offset: 0, color: BAR_DEFAULT_FILL },
      { offset: 1, color: BAR_DEFAULT_FILL },
    ]
  }

  const filled: Seg[] = []
  let cursor = 0
  for (const seg of segs) {
    const start = Math.max(cursor, seg.start)
    const end = Math.max(start, seg.end)
    if (start > cursor + 0.0005) {
      filled.push({
        start: cursor,
        end: start,
        color: BAR_DEFAULT_FILL,
      })
    }
    if (end > start + 0.0005) {
      filled.push({ start, end, color: seg.color })
    }
    cursor = Math.max(cursor, end)
  }
  if (cursor < 0.999) {
    filled.push({
      start: cursor,
      end: 1,
      color: BAR_DEFAULT_FILL,
    })
  }

  const merged: Seg[] = []
  for (const seg of filled) {
    const prev = merged[merged.length - 1]
    if (prev && prev.color === seg.color && Math.abs(prev.end - seg.start) < 0.001) {
      prev.end = seg.end
    } else {
      merged.push({ ...seg })
    }
  }

  const stops: LineColorStop[] = []
  for (const seg of merged) {
    stops.push({ offset: seg.start, color: seg.color })
    stops.push({ offset: seg.end, color: seg.color })
  }
  if (stops[0]!.offset > 0) {
    stops.unshift({ offset: 0, color: stops[0]!.color })
  }
  if (stops[stops.length - 1]!.offset < 1) {
    stops.push({ offset: 1, color: stops[stops.length - 1]!.color })
  }
  return stops
}

function solidBarFill(segments: BarColorSegment[], active: boolean): string {
  const color = segments[0]?.color || BAR_DEFAULT_FILL
  if (!active) return color
  if (color === BAR_DEFAULT_FILL) return BAR_DEFAULT_FILL_ACTIVE
  return darkenColor(color)
}

/** Left gutter wide enough for the longest Y tick, no larger. */
export function estimateChartYAxisLeftMargin(
  ticks: number[],
  scale: number = 1,
): number {
  const longest = Math.max(
    1,
    ...ticks.map((tick) => formatIndexValue(tick).length),
  )
  const gutterScale = gutterScaleForUiScale(scale)
  // ~7.2px per character at base 13px + gap; gutter grows slower than fonts.
  const min = 36 * gutterScale
  const max = 70 * gutterScale
  return Math.round(
    Math.min(max, Math.max(min, longest * 7.2 * gutterScale + 10 * gutterScale)),
  )
}

function plotWidthForLeft(left: number): number {
  return WIDTH - left - MARGIN.right
}

/**
 * Horizontal insets (% of chart width) for the eras bar so it lines up with the
 * series: first bar's left edge → last bar's right edge (or first/last point).
 */
export function getChartSeriesHorizontalInsets(
  pointCount: number,
  chartType: string | null | undefined,
  leftMargin: number = MARGIN.left,
): { insetLeftPct: number; insetRightPct: number } {
  const { startX, endX } = getChartSeriesEdgeXs(pointCount, chartType, leftMargin)
  return {
    insetLeftPct: (startX / WIDTH) * 100,
    insetRightPct: ((WIDTH - endX) / WIDTH) * 100,
  }
}

/** Left/right edges of the series in chart viewBox coordinates. */
export function getChartSeriesEdgeXs(
  pointCount: number,
  chartType: string | null | undefined,
  leftMargin: number = MARGIN.left,
): { startX: number; endX: number } {
  const plotLeft = leftMargin
  const plotW = plotWidthForLeft(leftMargin)
  const plotRight = WIDTH - MARGIN.right

  if (pointCount <= 0) {
    return { startX: plotLeft, endX: plotRight }
  }

  if (chartType === 'bar') {
    const slot = plotW / pointCount
    const barW = Math.max(2, slot * BAR_SLOT_FILL)
    const firstBarLeft = plotLeft + (slot - barW) / 2
    const lastBarRight =
      plotLeft + (pointCount - 1) * slot + (slot - barW) / 2 + barW
    return { startX: firstBarLeft, endX: lastBarRight }
  }

  if (pointCount === 1) {
    const x = plotLeft + plotW / 2
    const half = Math.max(plotW * 0.02, 4)
    return { startX: x - half, endX: x + half }
  }

  return { startX: plotLeft, endX: plotRight }
}

/**
 * X position (viewBox coords) of a continuous point index — same formula as
 * bar centers / line dots in IndexTrendChart.
 */
export function chartPointIndexToX(
  index: number,
  pointCount: number,
  chartType: string | null | undefined,
  leftMargin: number = MARGIN.left,
): number {
  const plotLeft = leftMargin
  const plotW = plotWidthForLeft(leftMargin)
  if (pointCount <= 0) return plotLeft
  if (pointCount === 1) return plotLeft + plotW / 2
  if (chartType === 'bar') {
    const slot = plotW / pointCount
    return plotLeft + index * slot + slot / 2
  }
  return plotLeft + (index / (pointCount - 1)) * plotW
}

/** Left/right edges of bar `index` (viewBox coords). */
export function chartBarEdgeXs(
  index: number,
  pointCount: number,
  leftMargin: number = MARGIN.left,
): { leftX: number; rightX: number } {
  const plotLeft = leftMargin
  const plotW = plotWidthForLeft(leftMargin)
  const n = Math.max(pointCount, 1)
  const slot = plotW / n
  const barW = Math.max(2, slot * BAR_SLOT_FILL)
  const i = Math.min(n - 1, Math.max(0, index))
  const leftX = plotLeft + i * slot + (slot - barW) / 2
  return { leftX, rightX: leftX + barW }
}

/**
 * Left gutter for a series from its values (same math as IndexTrendChart).
 */
export function estimateChartYAxisLeftMarginForPoints(
  values: number[],
  scale: number = 1,
): number {
  if (values.length === 0) return MARGIN.left * gutterScaleForUiScale(scale)
  const { yMin, yMax } = chartYDomain(values)
  const tickCount = scale > 1.2 ? 3 : 4
  return estimateChartYAxisLeftMargin(niceTicks(yMin, yMax, tickCount), scale)
}

/**
 * Y domain for the plot. Non-negative series floor at 0 (so bars sit on the
 * baseline); non-positive series ceiling at 0; mixed series pad both sides.
 */
function chartYDomain(values: number[]): { yMin: number; yMax: number } {
  const rawMin = Math.min(...values)
  const rawMax = Math.max(...values)
  const span = rawMax - rawMin
  const pad = span * 0.15 || Math.abs(rawMax || rawMin) * 0.1 || 1

  if (rawMin >= 0) {
    return { yMin: 0, yMax: rawMax + pad }
  }
  if (rawMax <= 0) {
    return { yMin: rawMin - pad, yMax: 0 }
  }
  return { yMin: rawMin - pad, yMax: rawMax + pad }
}

function niceTicks(min: number, max: number, count = 4): number[] {
  if (min === max) {
    return [min - 1, min, min + 1]
  }
  const span = max - min
  const step = span / count
  const ticks: number[] = []
  for (let i = 0; i <= count; i++) {
    ticks.push(min + step * i)
  }
  return ticks
}

function clampTooltipLeftPct(leftPct: number): number {
  return Math.min(92, Math.max(8, leftPct))
}

/** Bar path with gently rounded corners on the value end (away from zero). */
function roundedBarPath(
  x: number,
  y: number,
  w: number,
  h: number,
  radius: number,
  roundTop: boolean,
): string {
  const r = Math.min(Math.max(0, radius), w / 2, h)
  if (r <= 0.01) {
    return `M${x},${y}h${w}v${h}h${-w}Z`
  }
  if (roundTop) {
    return [
      `M${x},${y + r}`,
      `Q${x},${y} ${x + r},${y}`,
      `L${x + w - r},${y}`,
      `Q${x + w},${y} ${x + w},${y + r}`,
      `L${x + w},${y + h}`,
      `L${x},${y + h}`,
      'Z',
    ].join('')
  }
  return [
    `M${x},${y}`,
    `L${x + w},${y}`,
    `L${x + w},${y + h - r}`,
    `Q${x + w},${y + h} ${x + w - r},${y + h}`,
    `L${x + r},${y + h}`,
    `Q${x},${y + h} ${x},${y + h - r}`,
    'Z',
  ].join('')
}

/**
 * Open outline for bar stroke: left + value-end + right only
 * (no baseline edge, so bars sit flush on the axis).
 */
function roundedBarStrokePath(
  x: number,
  y: number,
  w: number,
  h: number,
  radius: number,
  roundTop: boolean,
): string {
  const r = Math.min(Math.max(0, radius), w / 2, h)
  if (r <= 0.01) {
    return roundTop
      ? `M${x},${y + h}L${x},${y}L${x + w},${y}L${x + w},${y + h}`
      : `M${x},${y}L${x},${y + h}L${x + w},${y + h}L${x + w},${y}`
  }
  if (roundTop) {
    return [
      `M${x},${y + h}`,
      `L${x},${y + r}`,
      `Q${x},${y} ${x + r},${y}`,
      `L${x + w - r},${y}`,
      `Q${x + w},${y} ${x + w},${y + r}`,
      `L${x + w},${y + h}`,
    ].join('')
  }
  return [
    `M${x},${y}`,
    `L${x},${y + h - r}`,
    `Q${x},${y + h} ${x + r},${y + h}`,
    `L${x + w - r},${y + h}`,
    `Q${x + w},${y + h} ${x + w},${y + h - r}`,
    `L${x + w},${y}`,
  ].join('')
}

export function IndexTrendChart({
  index,
  eras = [],
  showBarValues = true,
  highlightBand = null,
  highlightBands,
  uiScale: uiScaleProp,
  tall: tallProp,
  compact = false,
  fixedLayout = false,
  onMetricsChange,
}: IndexTrendChartProps) {
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const [measuredWidth, setMeasuredWidth] = useState(0)
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)
  const lastTouchRef = useRef(0)
  const points = index.points
  const chartType = index.chartType === 'pie' || index.chartType === 'bar'
    ? index.chartType
    : 'line'
  const yearOnly = useMemo(() => isYearOnlySeries(points), [points])
  const colorSeriesByEra =
    (chartType === 'bar' || chartType === 'line') && eras.length > 0
  const colorBarsByEra = colorSeriesByEra && chartType === 'bar'
  const colorLineByEra = colorSeriesByEra && chartType === 'line'

  useLayoutEffect(() => {
    const node = wrapRef.current
    if (!node) return

    const apply = (w: number) => {
      if (w > 0) {
        setMeasuredWidth((prev) => (Math.abs(prev - w) < 0.5 ? prev : w))
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

    const onWin = () => apply(node.getBoundingClientRect().width)
    window.addEventListener('resize', onWin)
    window.visualViewport?.addEventListener('resize', onWin)
    return () => {
      ro?.disconnect()
      window.removeEventListener('resize', onWin)
      window.visualViewport?.removeEventListener('resize', onWin)
    }
  }, [])

  // Prefer live measured width, but never trust a measure wider than the
  // corrected layout width (DevTools can report a wide chart box after a
  // spurious pane resize). Avoid readChartLayoutWidth() before mount so SSR
  // and the first client paint stay identical.
  const [layoutWidth, setLayoutWidth] = useState(CHART_WIDTH)

  useLayoutEffect(() => {
    setLayoutWidth(readChartLayoutWidth())
  }, [measuredWidth])

  const effectiveWidth =
    measuredWidth > 0 ? Math.min(measuredWidth, layoutWidth) : 0
  const selfScale =
    effectiveWidth > 0 ? chartUiScaleForWidth(effectiveWidth) : 1
  const selfTall =
    effectiveWidth > 0 ? chartTallForWidth(effectiveWidth) : false
  const scale = fixedLayout
    ? Math.max(1, uiScaleProp ?? 1)
    : Math.max(1, uiScaleProp ?? 1, selfScale)
  const tall = fixedLayout
    ? Boolean(tallProp)
    : Boolean(tallProp) || selfTall

  useEffect(() => {
    if (fixedLayout || effectiveWidth <= 0) return
    onMetricsChange?.({
      uiScale: selfScale,
      tall: selfTall,
      width: effectiveWidth,
    })
  }, [fixedLayout, selfScale, selfTall, effectiveWidth, onMetricsChange])

  const height = tall
    ? CHART_HEIGHT_TALL
    : compact
      ? CHART_HEIGHT_COMPACT
      : CHART_HEIGHT
  // Scaled x-label fonts need a deeper bottom gutter so they sit under the bars.
  const marginBottom =
    scale > 1
      ? Math.max(MARGIN.bottom, Math.round(20 * scale + 10))
      : MARGIN.bottom
  const plotH = height - MARGIN.top - marginBottom
  const fontSize = 13 * scale
  const axisPadX = 8 * scale
  // Keep the label baseline near the SVG bottom (inside the enlarged gutter).
  const axisPadY = scale > 1 ? Math.max(8, Math.round(5 * scale)) : 10
  const lineStroke = 3 * scale
  const gridStroke = 1 * scale
  const dotR = 3.5 * scale
  const dotRActive = 5 * scale
  const hitR = Math.max(14, 16 * scale)
  const minBarH = Math.max(1, scale)

  const suppressMouse = () => Date.now() - lastTouchRef.current < 700

  const setHoverFromMouse = (i: number | null) => {
    if (suppressMouse()) return
    setHoverIdx(i)
  }

  useEffect(() => {
    setHoverIdx(null)
  }, [index.id])

  const geometry = useMemo(() => {
    if (points.length === 0) {
      return null
    }

    const values = points.map((p) => p.value)
    const { yMin, yMax } = chartYDomain(values)
    const tickCount = scale > 1.2 ? 3 : 4
    const yTicks = niceTicks(yMin, yMax, tickCount)
    const left = estimateChartYAxisLeftMargin(yTicks, scale)
    const plotW = plotWidthForLeft(left)

    const toX = (i: number) =>
      points.length === 1
        ? left + plotW / 2
        : left + (i / (points.length - 1)) * plotW
    const toY = (v: number) =>
      MARGIN.top + plotH - ((v - yMin) / (yMax - yMin || 1)) * plotH

    const linePath = points
      .map((p, i) => `${i === 0 ? 'M' : 'L'}${toX(i).toFixed(1)},${toY(p.value).toFixed(1)}`)
      .join(' ')

    const baselineY = MARGIN.top + plotH
    const areaPath =
      points.length === 0
        ? ''
        : `${linePath} L${toX(points.length - 1).toFixed(1)},${baselineY.toFixed(1)} L${toX(0).toFixed(1)},${baselineY.toFixed(1)} Z`

    const seriesEdges = getChartSeriesEdgeXs(points.length, 'line', left)
    const lineColorStops = colorLineByEra
      ? buildLineEraColorStops(
          points,
          eras,
          yearOnly,
          toX,
          seriesEdges.startX,
          seriesEdges.endX,
        )
      : [
          { offset: 0, color: BAR_DEFAULT_FILL },
          { offset: 1, color: BAR_DEFAULT_FILL },
        ]
    const lineGradientX1 = seriesEdges.startX
    const lineGradientX2 = seriesEdges.endX

    // Bars stay fully inside the plot so they never cover Y-axis labels.
    const slot = plotW / points.length
    const barW = Math.max(2, slot * BAR_SLOT_FILL)
    const barStrokeW = barStrokeWidth(barW, scale)
    const zeroY = toY(0)
    const bars = points.map((p, i) => {
      const x = left + i * slot + (slot - barW) / 2
      const cx = x + barW / 2
      const yVal = toY(p.value)
      const y = Math.min(yVal, zeroY)
      const h = Math.max(Math.abs(zeroY - yVal), minBarH)
      const roundTop = p.value >= 0
      const radius = barCornerRadius(barW, h, scale)
      const colorSegments = colorBarsByEra
        ? barColorSegmentsForPoint(p, eras, yearOnly)
        : [{ color: BAR_DEFAULT_FILL, startFrac: 0, endFrac: 1 }]
      return {
        x,
        y,
        w: barW,
        h,
        cx,
        cy: yVal,
        value: p.value,
        d: roundedBarPath(x, y, barW, h, radius, roundTop),
        strokeD: roundedBarStrokePath(x, y, barW, h, radius, roundTop),
        colorSegments,
      }
    })

    const pieSource = points.slice(-8)
    const total = pieSource.reduce((s, p) => s + Math.abs(p.value), 0) || 1
    const cx = WIDTH / 2
    const cy = height / 2
    const r = Math.min(plotW, plotH) / 2 - 8
    const colors = [
      '#4890fd',
      '#3b7ae6',
      '#6ba4fa',
      '#94b8f0',
      '#c3c3c3',
      '#969696',
      '#e74c3c',
      '#f5a623',
    ]
    let angle = -Math.PI / 2
    const pieSlices = pieSource.map((p, i) => {
      const slice = (Math.abs(p.value) / total) * Math.PI * 2
      const start = angle
      const end = angle + slice
      angle = end
      const x1 = cx + r * Math.cos(start)
      const y1 = cy + r * Math.sin(start)
      const x2 = cx + r * Math.cos(end)
      const y2 = cy + r * Math.sin(end)
      const large = slice > Math.PI ? 1 : 0
      const d = `M${cx},${cy} L${x1},${y1} A${r},${r} 0 ${large} 1 ${x2},${y2} Z`
      return {
        d,
        color: colors[i % colors.length]!,
        label: p.label,
        value: p.value,
      }
    })

    // Fewer x labels when fonts are enlarged so they don't crowd.
    const labelBudget =
      scale > 1.5 ? 3 : scale > 1 ? Math.max(3, Math.floor(6 / scale)) : 6
    const labelStep = Math.max(1, Math.ceil(points.length / labelBudget))
    const isBar = index.chartType === 'bar'
    const xLabels = points
      .map((p, i) => ({
        i,
        label: p.label,
        x: isBar ? left + i * slot + slot / 2 : toX(i),
      }))
      .filter(({ i }) => i % labelStep === 0 || i === points.length - 1)
      .map(({ label, x }) => ({ label, x }))

    const dots = points.map((p, i) => ({
      x: toX(i),
      y: toY(p.value),
      label: p.label,
      value: p.value,
      color: colorLineByEra
        ? colorForPoint(p, eras, yearOnly)
        : BAR_DEFAULT_FILL,
    }))

    return {
      linePath,
      areaPath,
      bars,
      barStrokeW,
      pieSlices,
      yTicks,
      xLabels,
      yMin,
      yMax,
      dots,
      left,
      lineColorStops,
      lineGradientX1,
      lineGradientX2,
      colorLineByEra,
    }
  }, [
    index.chartType,
    points,
    scale,
    plotH,
    height,
    minBarH,
    colorBarsByEra,
    colorLineByEra,
    eras,
    yearOnly,
  ])

  if (!geometry) {
    return (
      <p className="index-trend-chart__empty" role="status">
        אין נתונים להצגה
      </p>
    )
  }

  const {
    linePath,
    areaPath,
    bars,
    barStrokeW,
    pieSlices,
    yTicks,
    xLabels,
    yMin,
    yMax,
    dots,
    left,
    lineColorStops,
    lineGradientX1,
    lineGradientX2,
    colorLineByEra: lineColoredByEra,
  } = geometry

  const activeEraBands = (
    highlightBands && highlightBands.length > 0
      ? highlightBands
      : highlightBand
        ? [highlightBand]
        : []
  ).filter((band) => band.widthPct > 0)

  const toggleIdx = (i: number) => {
    setHoverIdx((prev) => (prev === i ? null : i))
  }

  const onPointPointerUp = (i: number, e: PointerEvent) => {
    if (e.pointerType !== 'touch' && e.pointerType !== 'pen') return
    lastTouchRef.current = Date.now()
    e.stopPropagation()
    toggleIdx(i)
  }

  const stopClick = (e: MouseEvent) => {
    e.stopPropagation()
  }

  const hovered =
    hoverIdx !== null
      ? chartType === 'pie'
        ? pieSlices[hoverIdx]
        : chartType === 'bar'
          ? bars[hoverIdx]
          : dots[hoverIdx]
      : null

  const tooltipAnchor =
    hoverIdx !== null && chartType !== 'pie'
      ? chartType === 'bar'
        ? {
            leftPct: (bars[hoverIdx]!.cx / WIDTH) * 100,
            topPct: (bars[hoverIdx]!.y / height) * 100,
          }
        : {
            leftPct: (dots[hoverIdx]!.x / WIDTH) * 100,
            topPct: (dots[hoverIdx]!.y / height) * 100,
          }
      : null

  const hoveredLabel =
    hovered && 'label' in hovered
      ? hovered.label
      : hoverIdx !== null
        ? points[hoverIdx]?.label
        : null
  const hoveredValue =
    hovered && 'value' in hovered
      ? hovered.value
      : hoverIdx !== null
        ? points[hoverIdx]?.value
        : null

  return (
    <div
      ref={wrapRef}
      className="index-trend-chart"
      dir="ltr"
      data-ui-scale={scale.toFixed(2)}
      data-tall={tall ? '1' : '0'}
    >
      <svg
        className="index-trend-chart__svg"
        viewBox={`0 0 ${WIDTH} ${height}`}
        role="img"
        aria-label={`גרף ${index.name}`}
        direction="ltr"
        style={{ aspectRatio: `${WIDTH} / ${height}` }}
        onClick={() => setHoverIdx(null)}
      >
        {/* No SVG drop-shadow filters — html-to-image blanks the share PNG when they are present. */}
        {chartType !== 'pie' ? (
          <>
            {yTicks.map((tick) => {
              const y =
                MARGIN.top +
                plotH -
                ((tick - yMin) / (yMax - yMin || 1)) * plotH
              return (
                <line
                  key={`grid-${tick}`}
                  x1={left}
                  y1={y}
                  x2={WIDTH - MARGIN.right}
                  y2={y}
                  className="index-trend-chart__grid"
                  stroke="rgba(0, 0, 0, 0.08)"
                  strokeWidth={gridStroke}
                />
              )
            })}
            {/*
              Selected-era background bands only when the series itself is not
              already party-colored (bar fills / line stroke+area).
            */}
            {!colorSeriesByEra
              ? activeEraBands.map((band, i) => (
                  <rect
                    key={`era-hl-${i}-${band.leftPct}-${band.widthPct}`}
                    className="index-trend-chart__era-highlight"
                    x={(band.leftPct / 100) * WIDTH}
                    y={MARGIN.top}
                    width={(band.widthPct / 100) * WIDTH}
                    height={plotH}
                    style={{ fill: eraHighlightFill(band.color) }}
                    pointerEvents="none"
                  />
                ))
              : null}
          </>
        ) : null}

        {chartType === 'bar'
          ? (() => {
              const MIN_BAR_VALUE_FONT = 8
              const labelPad = Math.max(6, 7 * scale)
              // One shared size for the whole chart: shrink to fit the
              // narrowest / longest eligible label, then use it everywhere.
              let sharedLabelFont = fontSize * 1.15
              for (const bar of bars) {
                const label = formatIndexValue(bar.value)
                const digits = (label.match(/\d/g) || []).length
                if (digits >= 6) continue
                const fit =
                  (bar.w * 0.88) / (Math.max(1, label.length) * 0.62)
                sharedLabelFont = Math.min(sharedLabelFont, fit)
              }
              const sharedLabelsOk =
                showBarValues && sharedLabelFont >= MIN_BAR_VALUE_FONT

              return bars.map((bar, i) => {
              const active = hoverIdx === i
              const segments = bar.colorSegments
              const split = segments.length > 1
              const gradientId = `bar-fill-${index.id}-${i}`
              const fill = split
                ? `url(#${gradientId})`
                : solidBarFill(segments, active)
              const className = active
                ? 'index-trend-chart__bar index-trend-chart__bar--active'
                : 'index-trend-chart__bar'
              const valueLabel = formatIndexValue(bar.value)
              const digitCount = (valueLabel.match(/\d/g) || []).length
              const labelFont = sharedLabelFont
              const labelInside =
                sharedLabelsOk &&
                digitCount < 6 &&
                bar.h >= labelFont + labelPad * 2
              const positive = bar.value >= 0
              // White value sits inside the bar near the value end (top for positive).
              const labelY = positive
                ? bar.y + labelPad + labelFont * 0.9
                : bar.y + bar.h - labelPad
              const scrimId = `bar-scrim-${index.id}-${i}`
              return (
                <g
                  key={i}
                  className={className}
                  onMouseEnter={() => setHoverFromMouse(i)}
                  onMouseLeave={() => setHoverFromMouse(null)}
                  onPointerUp={(e) => onPointPointerUp(i, e)}
                  onClick={stopClick}
                  style={{
                    cursor: 'pointer',
                  }}
                >
                  <defs>
                    {split ? (
                      <linearGradient
                        id={gradientId}
                        gradientUnits="objectBoundingBox"
                        x1="0"
                        y1="0"
                        x2="1"
                        y2="0"
                      >
                        {segments.flatMap((seg, segIdx) => {
                          const start = `${(seg.startFrac * 100).toFixed(3)}%`
                          const end = `${(seg.endFrac * 100).toFixed(3)}%`
                          const color = active
                            ? darkenColor(seg.color)
                            : seg.color
                          return [
                            <stop
                              key={`${segIdx}-a`}
                              offset={start}
                              stopColor={color}
                            />,
                            <stop
                              key={`${segIdx}-b`}
                              offset={end}
                              stopColor={color}
                            />,
                          ]
                        })}
                      </linearGradient>
                    ) : null}
                    {labelInside ? (
                      <linearGradient
                        id={scrimId}
                        gradientUnits="objectBoundingBox"
                        x1="0"
                        y1={positive ? '0' : '1'}
                        x2="0"
                        y2={positive ? '1' : '0'}
                      >
                        {/* Soft dark fade behind white value labels. */}
                        <stop offset="0%" stopColor="#000" stopOpacity="0.28" />
                        <stop offset="24%" stopColor="#000" stopOpacity="0.1" />
                        <stop offset="48%" stopColor="#000" stopOpacity="0" />
                      </linearGradient>
                    ) : null}
                  </defs>
                  <path d={bar.d} fill={fill} stroke="none" />
                  {labelInside ? (
                    <path
                      d={bar.d}
                      fill={`url(#${scrimId})`}
                      stroke="none"
                      pointerEvents="none"
                    />
                  ) : null}
                  {barStrokeW > 0.35 ? (
                    <path
                      d={bar.strokeD}
                      fill="none"
                      stroke="#fff"
                      strokeWidth={barStrokeW}
                      strokeLinejoin="round"
                      strokeLinecap="butt"
                      pointerEvents="none"
                    />
                  ) : null}
                  {labelInside ? (
                    <text
                      className="index-trend-chart__bar-value"
                      x={bar.cx}
                      y={labelY}
                      textAnchor="middle"
                      dominantBaseline="auto"
                      direction="ltr"
                      fill="#fff"
                      fontSize={labelFont}
                      fontWeight={800}
                      pointerEvents="none"
                      style={{ fontVariantNumeric: 'tabular-nums' }}
                    >
                      {valueLabel}
                    </text>
                  ) : null}
                </g>
              )
              })
            })()
          : null}

        {chartType === 'line' ? (
          <>
            {lineColoredByEra ? (
              <defs>
                <linearGradient
                  id={`line-era-${index.id}`}
                  gradientUnits="userSpaceOnUse"
                  x1={lineGradientX1}
                  y1={0}
                  x2={lineGradientX2}
                  y2={0}
                >
                  {lineColorStops.map((stop, stopIdx) => (
                    <stop
                      key={`${stopIdx}-${stop.offset}`}
                      offset={`${(stop.offset * 100).toFixed(3)}%`}
                      stopColor={stop.color}
                    />
                  ))}
                </linearGradient>
              </defs>
            ) : null}
            <path
              d={areaPath}
              className="index-trend-chart__area"
              fill={
                lineColoredByEra
                  ? `url(#line-era-${index.id})`
                  : 'rgba(72, 144, 253, 0.18)'
              }
              fillOpacity={lineColoredByEra ? 0.22 : undefined}
              stroke="none"
            />
            <path
              d={linePath}
              className="index-trend-chart__line"
              fill="none"
              stroke={
                lineColoredByEra
                  ? `url(#line-era-${index.id})`
                  : '#4890fd'
              }
              strokeWidth={lineStroke}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {dots.map((dot, i) => (
              <g key={i}>
                <circle
                  cx={dot.x}
                  cy={dot.y}
                  r={hitR}
                  fill="transparent"
                  className="index-trend-chart__hit"
                  onMouseEnter={() => setHoverFromMouse(i)}
                  onMouseLeave={() => setHoverFromMouse(null)}
                  onPointerUp={(e) => onPointPointerUp(i, e)}
                  onClick={stopClick}
                />
                <circle
                  cx={dot.x}
                  cy={dot.y}
                  r={hoverIdx === i ? dotRActive : dotR}
                  className="index-trend-chart__dot"
                  fill={dot.color}
                  stroke="#fff"
                  strokeWidth={1.5 * scale}
                  pointerEvents="none"
                />
              </g>
            ))}
          </>
        ) : null}

        {chartType === 'pie'
          ? pieSlices.map((slice, i) => (
              <path
                key={i}
                d={slice.d}
                fill={slice.color}
                className="index-trend-chart__pie-slice"
                onMouseEnter={() => setHoverFromMouse(i)}
                onMouseLeave={() => setHoverFromMouse(null)}
                onPointerUp={(e) => onPointPointerUp(i, e)}
                onClick={stopClick}
              />
            ))
          : null}

        {/* Axis labels after series so they stay above bars/lines. */}
        {chartType !== 'pie' ? (
          <>
            {yTicks.map((tick) => {
              const y =
                MARGIN.top +
                plotH -
                ((tick - yMin) / (yMax - yMin || 1)) * plotH
              return (
                <text
                  key={`y-${tick}`}
                  x={left - axisPadX}
                  y={y + 4 * scale}
                  className="index-trend-chart__axis index-trend-chart__axis--y"
                  textAnchor="end"
                  direction="ltr"
                  fill="#4a4a4a"
                  fontSize={fontSize}
                  style={{ fontVariantNumeric: 'tabular-nums' }}
                >
                  {formatIndexValue(tick)}
                </text>
              )
            })}
            {xLabels.map((item) => (
              <text
                key={`${item.x}-${item.label}`}
                x={item.x}
                y={height - axisPadY}
                className="index-trend-chart__axis"
                textAnchor={xAxisLabelTextAnchor(
                  item.x,
                  item.label,
                  fontSize,
                  0,
                  WIDTH,
                )}
                fill="#4a4a4a"
                fontSize={fontSize}
              >
                {item.label}
              </text>
            ))}
          </>
        ) : null}
      </svg>

      {hoveredLabel != null && hoveredValue != null ? (
        <div
          className={`index-trend-chart__tooltip${
            tooltipAnchor ? '' : ' index-trend-chart__tooltip--fallback'
          }`}
          role="tooltip"
          style={
            tooltipAnchor
              ? {
                  left: `${clampTooltipLeftPct(tooltipAnchor.leftPct)}%`,
                  top: `${tooltipAnchor.topPct}%`,
                }
              : undefined
          }
        >
          <strong>{formatIndexValue(hoveredValue)}</strong>
          <span>{hoveredLabel}</span>
        </div>
      ) : null}
    </div>
  )
}

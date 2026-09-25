'use client'

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type {
  OfficeDashboardMinisterEra,
  OfficeDashboardPoint,
} from '../../lib/fetchOfficeDashboard'
import { formatIndexValue } from '../../lib/fetchOfficeDashboard'
import {
  CHART_WIDTH,
  chartBarEdgeXs,
  chartPointIndexToX,
  estimateChartYAxisLeftMarginForPoints,
  getChartSeriesEdgeXs,
} from './IndexTrendChart'
import './OfficeErasBar.css'

type EraBand = {
  leftPct: number
  widthPct: number
  color: string | null
  avg?: number | null
}

type OfficeErasBarProps = {
  eras: OfficeDashboardMinisterEra[]
  points: OfficeDashboardPoint[]
  chartType?: string | null
  /**
   * Same uiScale as IndexTrendChart so the Y-gutter / series alignment stays in sync
   * when fonts are enlarged on narrow viewports.
   */
  uiScale?: number
  /**
   * When true (default), a rise vs the older selected era is an improvement (green).
   * When false, a rise is a worsening (red).
   */
  higherIsBetter?: boolean
  /**
   * Controlled selection (era keys). When omitted, the bar manages selection
   * internally. Used so the offscreen PNG export shell mirrors the live picks.
   */
  selectedKeys?: string[]
  onSelectedKeysChange?: (keys: string[]) => void
  /**
   * When this value changes (e.g. office id), selection resets to the
   * latest two visible eras (also the default on first page load). Swapping
   * indexes within the same office keeps the current picks. Empty selection is
   * otherwise allowed after the user clears the last era.
   */
  selectionResetKey?: string | number
  /** Fires with the selected era band(s) for chart highlighting. */
  onHoverBand?: (bands: EraBand[]) => void
}

type VisibleEra = {
  era: OfficeDashboardMinisterEra
  leftPct: number
  widthPct: number
}

const FALLBACK_COLOR = '#9a9a9a'
const MINISTER_PLACEHOLDER_SRC = '/images/offices/minister_placeholder.svg'
/** Approx tooltip half-width as % of the eras plot (keeps card inside the chart box). */
const TOOLTIP_HALF_WIDTH_PCT = 14

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
        return lerp(
          centerPct(i),
          centerPct(i + 1),
          Math.min(1, Math.max(0, local)),
        )
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

function formatMonthYear(value: string): string {
  const iso = value.slice(0, 10)
  const [y, m] = iso.split('-')
  if (y && m) return `${m}.${y}`
  return iso
}

function formatDisplayDate(value: string): string {
  const iso = value.slice(0, 10)
  const [y, m, d] = iso.split('-')
  if (y && m && d) return `${d}.${m}.${y}`
  return iso
}

function formatEraRangeShort(era: OfficeDashboardMinisterEra): string {
  const start = formatMonthYear(era.startDate)
  const today = new Date().toISOString().slice(0, 10)
  if (era.endDate.slice(0, 10) >= today) {
    return `היום – ${start}`
  }
  return `${formatMonthYear(era.endDate)} – ${start}`
}

function formatEraRangeFull(era: OfficeDashboardMinisterEra): string {
  const start = formatDisplayDate(era.startDate)
  const today = new Date().toISOString().slice(0, 10)
  if (era.endDate.slice(0, 10) >= today) {
    return `היום – ${start}`
  }
  return `${formatDisplayDate(era.endDate)} – ${start}`
}

function clampTooltipCenter(leftPct: number, widthPct: number): number {
  const mid = leftPct + widthPct / 2
  return Math.min(
    100 - TOOLTIP_HALF_WIDTH_PCT,
    Math.max(TOOLTIP_HALF_WIDTH_PCT, mid),
  )
}

type EraSwitchTick = {
  key: string
  leftPct: number
  label: string
}

const SWITCH_TICK_MIN_GAP_PCT = 7

function eraKey(era: OfficeDashboardMinisterEra): string {
  return `${era.personId}-${era.startDate}`
}

function formatEraAriaLabel(era: OfficeDashboardMinisterEra): string {
  const party = era.factionName?.trim()
  const range = formatEraRangeShort(era)
  return party
    ? `${era.fullName}, ${party}, ${range}`
    : `${era.fullName}, ${range}`
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0]!.slice(0, 2)
  return `${parts[0]!.slice(0, 1)}${parts[parts.length - 1]!.slice(0, 1)}`
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

/**
 * Yearly bars are annual totals. Counting a year for a minister who only
 * served a few December days (or a short January leftover) skews the avg.
 * Prefer years where the era covers ≥ half the calendar year; if none, fall
 * back to the year(s) with the longest overlap so short tenures still get a value.
 */
function yearCountsForEraAverage(
  year: number,
  era: OfficeDashboardMinisterEra,
  mode: 'majority' | 'any',
): boolean {
  const overlap = eraOverlapDaysInYear(year, era)
  if (overlap <= 0) return false
  if (mode === 'any') return true
  return overlap * 2 >= daysInYear(year)
}

function pointBelongsToEra(
  point: OfficeDashboardPoint,
  era: OfficeDashboardMinisterEra,
  yearOnly: boolean,
): boolean {
  const eraStart = dateToMs(era.startDate)
  const eraEnd = dateToMs(era.endDate)
  if (yearOnly) {
    const year = Number(yearFromPoint(point))
    if (!year) return false
    // Visual/band membership: any calendar overlap (used elsewhere if needed).
    return eraOverlapDaysInYear(year, era) > 0
  }
  const t = dateToMs(point.recordedAt)
  return t >= eraStart && t <= eraEnd
}

function averageForEra(
  points: OfficeDashboardPoint[],
  era: OfficeDashboardMinisterEra,
  yearOnly: boolean,
): number | null {
  if (!yearOnly) {
    const values = points
      .filter((p) => pointBelongsToEra(p, era, false))
      .map((p) => p.value)
      .filter((v) => Number.isFinite(v))
    if (values.length === 0) return null
    return values.reduce((sum, v) => sum + v, 0) / values.length
  }

  const yearly = points
    .map((p) => ({ point: p, year: Number(yearFromPoint(p)) }))
    .filter((row) => row.year > 0)

  const majority = yearly.filter((row) =>
    yearCountsForEraAverage(row.year, era, 'majority'),
  )
  let chosen = majority
  if (chosen.length === 0) {
    // Short tenure: take the year(s) with the most days in office.
    let bestDays = 0
    for (const row of yearly) {
      bestDays = Math.max(bestDays, eraOverlapDaysInYear(row.year, era))
    }
    if (bestDays <= 0) return null
    chosen = yearly.filter(
      (row) => eraOverlapDaysInYear(row.year, era) === bestDays,
    )
  }

  const values = chosen
    .map((row) => row.point.value)
    .filter((v) => Number.isFinite(v))
  if (values.length === 0) return null
  return values.reduce((sum, v) => sum + v, 0) / values.length
}

/** Desktop / mobile photo diameters (must match OfficeErasBar.css). */
const PHOTO_SIZE_DESKTOP_PX = 48
const PHOTO_SIZE_MOBILE_PX = 40
const PHOTO_INLINE_PAD_PX = 8

export function OfficeErasBar({
  eras,
  points,
  chartType,
  uiScale = 1,
  higherIsBetter = true,
  selectedKeys: selectedKeysProp,
  onSelectedKeysChange,
  selectionResetKey,
  onHoverBand,
}: OfficeErasBarProps) {
  const isSelectionControlled = selectedKeysProp !== undefined
  const [uncontrolledSelectedKeys, setUncontrolledSelectedKeys] = useState<
    string[]
  >([])
  const selectedKeys = isSelectionControlled
    ? selectedKeysProp
    : uncontrolledSelectedKeys
  const setSelectedKeys = (
    update: string[] | ((prev: string[]) => string[]),
  ) => {
    const next =
      typeof update === 'function' ? update(selectedKeys) : update
    if (!isSelectionControlled) {
      setUncontrolledSelectedKeys(next)
    }
    onSelectedKeysChange?.(next)
  }
  const [hoveredKey, setHoveredKey] = useState<string | null>(null)
  const [plotWidthPx, setPlotWidthPx] = useState(0)
  const plotRef = useRef<HTMLDivElement | null>(null)
  const lastTouchRef = useRef(0)
  const prevSelectionResetKeyRef = useRef<string | number | null>(null)
  const hasSeededSelectionRef = useRef(false)
  /** True only after the user clears the last selected era; office reset clears this. */
  const userClearedSelectionRef = useRef(false)
  /** Export shell is controlled for display only — don't write selection back. */
  const canWriteSelection =
    !isSelectionControlled || typeof onSelectedKeysChange === 'function'

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
  const minPhotoSegmentPx = photoSizePx + PHOTO_INLINE_PAD_PX

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

  const yearOnly = useMemo(() => isYearOnlySeries(points), [points])

  const visible = useMemo((): VisibleEra[] => {
    if (eras.length === 0) return []

    const domain = chartDomain(points)
    if (domain) {
      const domainStartMs = dateToMs(domain.start)
      const domainEndMs = dateToMs(domain.end)
      if (domainEndMs > domainStartMs) {
        const result: VisibleEra[] = []
        for (const era of eras) {
          const eraStartMs = dateToMs(era.startDate)
          const eraEndMs = dateToMs(era.endDate)
          if (eraEndMs <= domainStartMs || eraStartMs >= domainEndMs) continue

          const clampedStart =
            eraStartMs < domainStartMs ? domain.start : era.startDate
          const clampedEnd = eraEndMs > domainEndMs ? domain.end : era.endDate
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
          const minWidth = 3
          if (widthPct < minWidth) {
            widthPct = minWidth
            if (leftPct + widthPct > 100) {
              leftPct = Math.max(0, 100 - widthPct)
            }
          }

          result.push({ era, leftPct, widthPct })
        }
        if (result.length > 0) return result
      }
    }

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

  // Default / repair selection when the visible set or office changes.
  useEffect(() => {
    if (!canWriteSelection) return
    if (visible.length === 0) {
      // Don't clear parent selection while eras are briefly unavailable
      // (e.g. index swap) — that used to stick the page on "none selected".
      setHoveredKey(null)
      return
    }
    const defaultKeys = visible
      .slice(-2)
      .map((item) => eraKey(item.era))
    const resetChanged =
      selectionResetKey !== undefined &&
      prevSelectionResetKeyRef.current !== selectionResetKey
    if (selectionResetKey !== undefined) {
      prevSelectionResetKeyRef.current = selectionResetKey
    }
    if (resetChanged) {
      userClearedSelectionRef.current = false
    }

    setSelectedKeys((prev) => {
      // New office / first seed / page load: focus the latest two eras.
      if (resetChanged || !hasSeededSelectionRef.current) {
        hasSeededSelectionRef.current = true
        userClearedSelectionRef.current = false
        return defaultKeys
      }
      const stillVisible = prev.filter((key) =>
        visible.some((item) => eraKey(item.era) === key),
      )
      if (stillVisible.length > 0) return stillVisible.slice(0, 2)
      // Keep empty only when the user explicitly cleared selection.
      if (prev.length === 0 && userClearedSelectionRef.current) return prev
      return defaultKeys
    })
    setHoveredKey((prev) => {
      if (prev && visible.some((item) => eraKey(item.era) === prev)) return prev
      return null
    })
  }, [visible, selectionResetKey, canWriteSelection])

  const toggleSelect = (key: string) => {
    setSelectedKeys((prev) => {
      let next: string[]
      if (prev.includes(key)) {
        // Allow clearing the last selected era (no selection).
        next = prev.filter((k) => k !== key)
      } else if (prev.length < 2) {
        next = [...prev, key]
      } else {
        // Already comparing two — replace the earlier pick.
        next = [prev[1]!, key]
      }
      userClearedSelectionRef.current = next.length === 0
      return next
    })
  }

  const selectedSorted = useMemo(() => {
    return selectedKeys
      .map((key) => visible.find((item) => eraKey(item.era) === key))
      .filter((item): item is VisibleEra => Boolean(item))
      .sort(
        (a, b) => dateToMs(a.era.startDate) - dateToMs(b.era.startDate),
      )
  }, [visible, selectedKeys])

  const older = selectedSorted.length >= 2 ? selectedSorted[0]! : null
  const newer =
    selectedSorted.length >= 2
      ? selectedSorted[1]!
      : selectedSorted[0] ?? null

  const hovered = useMemo(
    () => visible.find((item) => eraKey(item.era) === hoveredKey) ?? null,
    [visible, hoveredKey],
  )

  const setEraHoverFromMouse = (key: string | null) => {
    if (Date.now() - lastTouchRef.current < 700) return
    setHoveredKey(key)
  }

  const olderAvg = useMemo(() => {
    if (!older) return null
    return averageForEra(points, older.era, yearOnly)
  }, [points, older, yearOnly])

  const newerAvg = useMemo(() => {
    if (!newer) return null
    return averageForEra(points, newer.era, yearOnly)
  }, [points, newer, yearOnly])

  const avgDelta =
    older && newer && olderAvg != null && newerAvg != null
      ? newerAvg - olderAvg
      : null

  // Keep chart highlight + avg lines in sync with selection.
  useEffect(() => {
    onHoverBand?.(
      selectedSorted.map((item) => ({
        leftPct: item.leftPct,
        widthPct: item.widthPct,
        color: item.era.factionColor?.trim() || FALLBACK_COLOR,
        avg: averageForEra(points, item.era, yearOnly),
      })),
    )
  }, [selectedSorted, onHoverBand, points, yearOnly])

  const switchTicks = useMemo((): EraSwitchTick[] => {
    const sorted = [...visible].sort((a, b) => a.leftPct - b.leftPct)
    const ticks: EraSwitchTick[] = []
    for (const item of sorted) {
      const leftPct = item.leftPct
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

  const renderPerson = (
    item: VisibleEra,
    side: 'older' | 'newer',
  ) => {
    const color = item.era.factionColor?.trim() || FALLBACK_COLOR
    return (
      <div
        className={`office-eras-bar__detail-person office-eras-bar__detail-person--${side}`}
        style={{ ['--era-accent' as string]: color }}
      >
        {item.era.imageUrl ? (
          <img
            src={item.era.imageUrl}
            alt=""
            className="office-eras-bar__detail-avatar"
            width={72}
            height={72}
          />
        ) : (
          <span
            className="office-eras-bar__detail-avatar office-eras-bar__detail-avatar--initials"
            aria-hidden="true"
          >
            {initials(item.era.fullName)}
          </span>
        )}
        <div className="office-eras-bar__detail-person-text">
          <p className="office-eras-bar__detail-name">{item.era.fullName}</p>
          {item.era.factionName ? (
            <p className="office-eras-bar__detail-party">{item.era.factionName}</p>
          ) : null}
          <p className="office-eras-bar__detail-dates">
            {formatEraRangeShort(item.era)}
          </p>
        </div>
      </div>
    )
  }

  const renderStats = (avg: number | null, side: 'older' | 'newer') => (
    <div
      className={`office-eras-bar__detail-stats office-eras-bar__detail-stats--${side}`}
    >
      <p className="office-eras-bar__detail-avg">{formatIndexValue(avg)}</p>
      <p className="office-eras-bar__detail-avg-label">ממוצע בתקופה</p>
    </div>
  )

  const deltaAbs =
    avgDelta != null ? formatIndexValue(Math.abs(avgDelta)) : null
  const deltaVerb =
    avgDelta == null
      ? null
      : avgDelta > 0
        ? 'עלייה'
        : avgDelta < 0
          ? 'ירידה'
          : null
  // Color = good/bad for this metric, not raw up/down.
  const deltaIsImprovement =
    avgDelta != null && avgDelta !== 0
      ? higherIsBetter
        ? avgDelta > 0
        : avgDelta < 0
      : null
  const deltaTone =
    deltaIsImprovement == null
      ? ''
      : deltaIsImprovement
        ? ' office-eras-bar__detail-delta-badge--down'
        : ' office-eras-bar__detail-delta-badge--up'

  return (
    <div className="office-eras-bar" dir="ltr">
      <div className="office-eras-bar__track">
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
                  {formatEraRangeFull(hovered.era)}
                </span>
              </div>
            </div>
          ) : null}
        </div>

        <div
          className="office-eras-bar__plot"
          ref={plotRef}
          role="listbox"
          aria-label="תקופות שרים — בחרו עד שתיים להשוואה, או לחצו שוב לביטול הבחירה"
          aria-multiselectable="true"
          aria-orientation="horizontal"
        >
          {visible.map(({ era, leftPct, widthPct }) => {
            const color = era.factionColor?.trim() || FALLBACK_COLOR
            const showFull = widthPct >= 14
            const segmentPx =
              plotWidthPx > 0 ? (widthPct / 100) * plotWidthPx : 0
            const showPhoto =
              plotWidthPx > 0
                ? segmentPx >= minPhotoSegmentPx
                : widthPct >= 7
            const photoOnly = showPhoto && !showFull
            const key = eraKey(era)
            const isSelected = selectedKeys.includes(key)
            const isHovered = hoveredKey === key

            return (
              <button
                key={key}
                type="button"
                role="option"
                aria-selected={isSelected}
                className={`office-eras-bar__era${
                  isSelected ? ' office-eras-bar__era--selected' : ''
                }${isHovered ? ' office-eras-bar__era--hovered' : ''}${
                  photoOnly ? ' office-eras-bar__era--photo-only' : ''
                }`}
                style={{
                  left: `${leftPct}%`,
                  width: `${widthPct}%`,
                  ['--era-accent' as string]: color,
                }}
                aria-label={formatEraAriaLabel(era)}
                onClick={() => toggleSelect(key)}
                onMouseEnter={() => setEraHoverFromMouse(key)}
                onMouseLeave={() => setEraHoverFromMouse(null)}
                onFocus={() => setHoveredKey(key)}
                onBlur={() => setHoveredKey(null)}
                onPointerUp={(e) => {
                  if (e.pointerType !== 'touch' && e.pointerType !== 'pen') {
                    return
                  }
                  lastTouchRef.current = Date.now()
                  setHoveredKey((prev) => (prev === key ? null : key))
                }}
              >
                <span
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
                    <span className="office-eras-bar__meta" dir="rtl">
                      <span className="office-eras-bar__name">
                        {era.fullName}
                      </span>
                      {era.factionName ? (
                        <span className="office-eras-bar__party">
                          {era.factionName}
                        </span>
                      ) : null}
                    </span>
                  ) : null}
                </span>
              </button>
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

      {newer ? (
        <div
          className={`office-eras-bar__detail${
            older ? ' office-eras-bar__detail--compare' : ''
          }`}
          dir="ltr"
        >
          {older ? (
            <div
              className="office-eras-bar__detail-half office-eras-bar__detail-half--older"
              style={{
                ['--era-accent' as string]:
                  older.era.factionColor?.trim() || FALLBACK_COLOR,
              }}
            >
              {renderPerson(older, 'older')}
              {renderStats(olderAvg, 'older')}
            </div>
          ) : null}

          {older && (deltaVerb || avgDelta === 0) && deltaAbs != null ? (
            <div
              className={`office-eras-bar__detail-delta-badge${deltaTone}`}
              role="status"
              dir="rtl"
            >
              <span className="office-eras-bar__detail-delta-badge-text">
                {avgDelta === 0 ? (
                  'ללא שינוי בממוצע בין התקופות'
                ) : (
                  <>
                    <span className="office-eras-bar__detail-delta-badge-lead">
                      {deltaVerb} של
                    </span>
                    <strong className="office-eras-bar__detail-delta-badge-value">
                      {deltaAbs}
                    </strong>
                    <span className="office-eras-bar__detail-delta-badge-tail">
                      בממוצע בין התקופות
                    </span>
                  </>
                )}
              </span>
            </div>
          ) : null}

          <div
            className={`office-eras-bar__detail-half office-eras-bar__detail-half--newer${
              older ? '' : ' office-eras-bar__detail-half--solo'
            }`}
            style={{
              ['--era-accent' as string]:
                newer.era.factionColor?.trim() || FALLBACK_COLOR,
            }}
          >
            {renderStats(newerAvg, 'newer')}
            {renderPerson(newer, 'newer')}
          </div>
        </div>
      ) : null}
    </div>
  )
}

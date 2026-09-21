'use client'

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent, type PointerEvent } from 'react'
import type { OfficeDashboardIndex } from '../../lib/fetchOfficeDashboard'
import { formatIndexValue } from '../../lib/fetchOfficeDashboard'
import './IndexTrendChart.css'

type IndexTrendChartProps = {
  index: OfficeDashboardIndex
  /** Vertical band highlight as % of chart width (eras hover). */
  highlightBand?: {
    leftPct: number
    widthPct: number
    color?: string | null
  } | null
  /**
   * Compensates SVG downscaling on narrow viewports so fonts/dots stay legible.
   * 1 on desktop (>=960px); up to 3 on phones. Shared with OfficeErasBar.
   * If omitted, the chart measures itself.
   */
  uiScale?: number
  /** Use a taller viewBox on narrow screens for more vertical plot room. */
  tall?: boolean
  /**
   * Ignore viewport/self measurement — keep the explicit uiScale/tall props.
   * Used by the offscreen PNG export shell so mobile shares match desktop.
   */
  fixedLayout?: boolean
  /** Notify parent when self-measured scale changes (keeps eras bar in sync). */
  onMetricsChange?: (metrics: { uiScale: number; tall: boolean; width: number }) => void
}

export const CHART_WIDTH = 960
export const CHART_HEIGHT = 460
/** Taller plot on phones/tablets so series + labels have room (kept moderate so chart+eras fit a phone screen). */
export const CHART_HEIGHT_TALL = 560
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
const ERA_HIGHLIGHT_FALLBACK = '#4890fd'
const ERA_HIGHLIGHT_OPACITY = 0.22

/** Party color at low opacity for the eras hover band on the chart. */
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
  const rawMin = Math.min(...values)
  const rawMax = Math.max(...values)
  const pad = (rawMax - rawMin) * 0.15 || Math.abs(rawMax) * 0.1 || 1
  const yMin = Math.min(0, rawMin - pad)
  const yMax = rawMax + pad
  const tickCount = scale > 1.2 ? 3 : 4
  return estimateChartYAxisLeftMargin(niceTicks(yMin, yMax, tickCount), scale)
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

export function IndexTrendChart({
  index,
  highlightBand = null,
  uiScale: uiScaleProp,
  tall: tallProp,
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

  const height = tall ? CHART_HEIGHT_TALL : CHART_HEIGHT
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
    const rawMin = Math.min(...values)
    const rawMax = Math.max(...values)
    const pad = (rawMax - rawMin) * 0.15 || Math.abs(rawMax) * 0.1 || 1
    const yMin = Math.min(0, rawMin - pad)
    const yMax = rawMax + pad
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

    // Bars stay fully inside the plot so they never cover Y-axis labels.
    const slot = plotW / points.length
    const barW = Math.max(2, slot * BAR_SLOT_FILL)
    const zeroY = toY(0)
    const bars = points.map((p, i) => {
      const x = left + i * slot + (slot - barW) / 2
      const cx = x + barW / 2
      const yVal = toY(p.value)
      const y = Math.min(yVal, zeroY)
      const h = Math.abs(zeroY - yVal)
      return { x, y, w: barW, h: Math.max(h, minBarH), cx, cy: yVal }
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
    }))

    return {
      linePath,
      areaPath,
      bars,
      pieSlices,
      yTicks,
      xLabels,
      yMin,
      yMax,
      dots,
      left,
    }
  }, [index.chartType, points, scale, plotH, height, minBarH])

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
    pieSlices,
    yTicks,
    xLabels,
    yMin,
    yMax,
    dots,
    left,
  } = geometry

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
            {highlightBand && highlightBand.widthPct > 0 ? (
              <rect
                className="index-trend-chart__era-highlight"
                x={(highlightBand.leftPct / 100) * WIDTH}
                y={MARGIN.top}
                width={(highlightBand.widthPct / 100) * WIDTH}
                height={plotH}
                style={{ fill: eraHighlightFill(highlightBand.color) }}
                pointerEvents="none"
              />
            ) : null}
          </>
        ) : null}

        {chartType === 'bar'
          ? bars.map((bar, i) => (
              <rect
                key={i}
                x={bar.x}
                y={bar.y}
                width={bar.w}
                height={bar.h}
                fill={hoverIdx === i ? '#3b7ae6' : '#4890fd'}
                opacity={hoverIdx === i ? 1 : 0.85}
                className={
                  hoverIdx === i
                    ? 'index-trend-chart__bar index-trend-chart__bar--active'
                    : 'index-trend-chart__bar'
                }
                onMouseEnter={() => setHoverFromMouse(i)}
                onMouseLeave={() => setHoverFromMouse(null)}
                onPointerUp={(e) => onPointPointerUp(i, e)}
                onClick={stopClick}
              />
            ))
          : null}

        {chartType === 'line' ? (
          <>
            <path
              d={areaPath}
              className="index-trend-chart__area"
              fill="rgba(72, 144, 253, 0.18)"
              stroke="none"
            />
            <path
              d={linePath}
              className="index-trend-chart__line"
              fill="none"
              stroke="#4890fd"
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
                  fill="#4890fd"
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
                textAnchor="middle"
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

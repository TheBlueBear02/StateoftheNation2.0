'use client'

import { useMemo, useState } from 'react'
import type { OfficeDashboardIndex } from '../../lib/fetchOfficeDashboard'
import { formatIndexValue } from '../../lib/fetchOfficeDashboard'
import './IndexTrendChart.css'

type IndexTrendChartProps = {
  index: OfficeDashboardIndex
}

export const CHART_WIDTH = 960
export const CHART_HEIGHT = 460
/** Defaults; left is tightened per-series from Y tick label widths. */
export const CHART_MARGIN = { top: 28, right: 12, bottom: 28, left: 56 }

const WIDTH = CHART_WIDTH
const HEIGHT = CHART_HEIGHT
const MARGIN = CHART_MARGIN
const PLOT_H = HEIGHT - MARGIN.top - MARGIN.bottom

const BAR_SLOT_FILL = 0.72

/** Left gutter wide enough for the longest Y tick, no larger. */
export function estimateChartYAxisLeftMargin(ticks: number[]): number {
  const longest = Math.max(
    1,
    ...ticks.map((tick) => formatIndexValue(tick).length),
  )
  // ~7.2px per character at 13px + gap before the plot edge
  return Math.round(Math.min(88, Math.max(40, longest * 7.2 + 12)))
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
  const plotLeft = leftMargin
  const plotW = plotWidthForLeft(leftMargin)
  const plotRight = WIDTH - MARGIN.right

  if (pointCount <= 0) {
    return {
      insetLeftPct: (plotLeft / WIDTH) * 100,
      insetRightPct: (MARGIN.right / WIDTH) * 100,
    }
  }

  if (chartType === 'bar') {
    const slot = plotW / pointCount
    const barW = Math.max(2, slot * BAR_SLOT_FILL)
    const firstBarLeft = plotLeft + (slot - barW) / 2
    const lastBarRight =
      plotLeft + (pointCount - 1) * slot + (slot - barW) / 2 + barW
    return {
      insetLeftPct: (firstBarLeft / WIDTH) * 100,
      insetRightPct: ((WIDTH - lastBarRight) / WIDTH) * 100,
    }
  }

  if (pointCount === 1) {
    const x = plotLeft + plotW / 2
    const half = Math.max(plotW * 0.02, 4)
    return {
      insetLeftPct: ((x - half) / WIDTH) * 100,
      insetRightPct: ((WIDTH - (x + half)) / WIDTH) * 100,
    }
  }

  return {
    insetLeftPct: (plotLeft / WIDTH) * 100,
    insetRightPct: ((WIDTH - plotRight) / WIDTH) * 100,
  }
}

/**
 * Left gutter for a series from its values (same math as IndexTrendChart).
 */
export function estimateChartYAxisLeftMarginForPoints(
  values: number[],
): number {
  if (values.length === 0) return MARGIN.left
  const rawMin = Math.min(...values)
  const rawMax = Math.max(...values)
  const pad = (rawMax - rawMin) * 0.15 || Math.abs(rawMax) * 0.1 || 1
  const yMin = Math.min(0, rawMin - pad)
  const yMax = rawMax + pad
  return estimateChartYAxisLeftMargin(niceTicks(yMin, yMax))
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

export function IndexTrendChart({ index }: IndexTrendChartProps) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)
  const points = index.points
  const chartType = index.chartType === 'pie' || index.chartType === 'bar'
    ? index.chartType
    : 'line'

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
    const yTicks = niceTicks(yMin, yMax)
    const left = estimateChartYAxisLeftMargin(yTicks)
    const plotW = plotWidthForLeft(left)

    const toX = (i: number) =>
      points.length === 1
        ? left + plotW / 2
        : left + (i / (points.length - 1)) * plotW
    const toY = (v: number) =>
      MARGIN.top + PLOT_H - ((v - yMin) / (yMax - yMin || 1)) * PLOT_H

    const linePath = points
      .map((p, i) => `${i === 0 ? 'M' : 'L'}${toX(i).toFixed(1)},${toY(p.value).toFixed(1)}`)
      .join(' ')

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
      return { x, y, w: barW, h: Math.max(h, 1), cx, cy: yVal }
    })

    const pieSource = points.slice(-8)
    const total = pieSource.reduce((s, p) => s + Math.abs(p.value), 0) || 1
    const cx = WIDTH / 2
    const cy = HEIGHT / 2
    const r = Math.min(plotW, PLOT_H) / 2 - 8
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

    const labelStep = Math.max(1, Math.ceil(points.length / 6))
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
      bars,
      pieSlices,
      yTicks,
      xLabels,
      yMin,
      yMax,
      dots,
      left,
    }
  }, [index.chartType, points])

  if (!geometry) {
    return (
      <p className="index-trend-chart__empty" role="status">
        אין נתונים להצגה
      </p>
    )
  }

  const { linePath, bars, pieSlices, yTicks, xLabels, yMin, yMax, dots, left } =
    geometry

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
            topPct: (bars[hoverIdx]!.y / HEIGHT) * 100,
          }
        : {
            leftPct: (dots[hoverIdx]!.x / WIDTH) * 100,
            topPct: (dots[hoverIdx]!.y / HEIGHT) * 100,
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
    <div className="index-trend-chart" dir="ltr">
      <svg
        className="index-trend-chart__svg"
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label={`גרף ${index.name}`}
        direction="ltr"
      >
        {chartType !== 'pie' ? (
          <>
            {yTicks.map((tick) => {
              const y =
                MARGIN.top +
                PLOT_H -
                ((tick - yMin) / (yMax - yMin || 1)) * PLOT_H
              return (
                <line
                  key={`grid-${tick}`}
                  x1={left}
                  y1={y}
                  x2={WIDTH - MARGIN.right}
                  y2={y}
                  className="index-trend-chart__grid"
                />
              )
            })}
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
                className={
                  hoverIdx === i
                    ? 'index-trend-chart__bar index-trend-chart__bar--active'
                    : 'index-trend-chart__bar'
                }
                onMouseEnter={() => setHoverIdx(i)}
                onMouseLeave={() => setHoverIdx(null)}
              />
            ))
          : null}

        {chartType === 'line' ? (
          <>
            <path d={linePath} className="index-trend-chart__line" fill="none" />
            {dots.map((dot, i) => (
              <circle
                key={i}
                cx={dot.x}
                cy={dot.y}
                r={hoverIdx === i ? 5 : 3.5}
                className="index-trend-chart__dot"
                onMouseEnter={() => setHoverIdx(i)}
                onMouseLeave={() => setHoverIdx(null)}
              />
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
                onMouseEnter={() => setHoverIdx(i)}
                onMouseLeave={() => setHoverIdx(null)}
              />
            ))
          : null}

        {/* Axis labels after series so they stay above bars/lines. */}
        {chartType !== 'pie' ? (
          <>
            {yTicks.map((tick) => {
              const y =
                MARGIN.top +
                PLOT_H -
                ((tick - yMin) / (yMax - yMin || 1)) * PLOT_H
              return (
                <text
                  key={`y-${tick}`}
                  x={left - 8}
                  y={y + 4}
                  className="index-trend-chart__axis index-trend-chart__axis--y"
                  textAnchor="end"
                  direction="ltr"
                >
                  {formatIndexValue(tick)}
                </text>
              )
            })}
            {xLabels.map((item) => (
              <text
                key={`${item.x}-${item.label}`}
                x={item.x}
                y={HEIGHT - 10}
                className="index-trend-chart__axis"
                textAnchor="middle"
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

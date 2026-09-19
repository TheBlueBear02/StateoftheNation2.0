'use client'

import { useMemo, useState } from 'react'
import type { OfficeDashboardIndex } from '../../lib/fetchOfficeDashboard'
import { formatIndexValue } from '../../lib/fetchOfficeDashboard'
import './IndexTrendChart.css'

type IndexTrendChartProps = {
  index: OfficeDashboardIndex
}

const WIDTH = 640
const HEIGHT = 280
const MARGIN = { top: 24, right: 20, bottom: 40, left: 52 }
const PLOT_W = WIDTH - MARGIN.left - MARGIN.right
const PLOT_H = HEIGHT - MARGIN.top - MARGIN.bottom

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

    const toX = (i: number) =>
      points.length === 1
        ? MARGIN.left + PLOT_W / 2
        : MARGIN.left + (i / (points.length - 1)) * PLOT_W
    const toY = (v: number) =>
      MARGIN.top + PLOT_H - ((v - yMin) / (yMax - yMin || 1)) * PLOT_H

    const linePath = points
      .map((p, i) => `${i === 0 ? 'M' : 'L'}${toX(i).toFixed(1)},${toY(p.value).toFixed(1)}`)
      .join(' ')

    const slot = PLOT_W / points.length
    const barW = Math.max(2, slot * 0.8)
    const zeroY = toY(0)
    const bars = points.map((p, i) => {
      const x = MARGIN.left + i * slot + (slot - barW) / 2
      const yVal = toY(p.value)
      const y = Math.min(yVal, zeroY)
      const h = Math.abs(zeroY - yVal)
      return { x, y, w: barW, h: Math.max(h, 1), cx: toX(i), cy: yVal }
    })

    const pieSource = points.slice(-8)
    const total = pieSource.reduce((s, p) => s + Math.abs(p.value), 0) || 1
    const cx = WIDTH / 2
    const cy = HEIGHT / 2
    const r = Math.min(PLOT_W, PLOT_H) / 2 - 8
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
    const xLabels = points
      .map((p, i) => ({ i, label: p.label, x: toX(i) }))
      .filter(({ i }) => i % labelStep === 0 || i === points.length - 1)
      .map(({ label, x }) => ({ label, x }))

    const dots = points.map((p, i) => ({
      x: toX(i),
      y: toY(p.value),
      label: p.label,
      value: p.value,
    }))

    return { linePath, bars, pieSlices, yTicks, xLabels, yMin, yMax, dots }
  }, [points])

  if (!geometry) {
    return (
      <p className="index-trend-chart__empty" role="status">
        אין נתונים להצגה
      </p>
    )
  }

  const { linePath, bars, pieSlices, yTicks, xLabels, yMin, yMax, dots } =
    geometry

  const hovered =
    hoverIdx !== null
      ? chartType === 'pie'
        ? pieSlices[hoverIdx]
        : dots[hoverIdx]
      : null

  return (
    <div className="index-trend-chart">
      <svg
        className="index-trend-chart__svg"
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label={`גרף ${index.name}`}
      >
        {chartType !== 'pie' ? (
          <>
            {yTicks.map((tick) => {
              const y =
                MARGIN.top +
                PLOT_H -
                ((tick - yMin) / (yMax - yMin || 1)) * PLOT_H
              return (
                <g key={tick}>
                  <line
                    x1={MARGIN.left}
                    y1={y}
                    x2={WIDTH - MARGIN.right}
                    y2={y}
                    className="index-trend-chart__grid"
                  />
                  <text
                    x={MARGIN.left - 8}
                    y={y + 4}
                    className="index-trend-chart__axis"
                    textAnchor="end"
                  >
                    {formatIndexValue(tick)}
                  </text>
                </g>
              )
            })}
            {xLabels.map((item) => (
              <text
                key={`${item.x}-${item.label}`}
                x={item.x}
                y={HEIGHT - 12}
                className="index-trend-chart__axis"
                textAnchor="middle"
              >
                {item.label}
              </text>
            ))}
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
      </svg>

      {hovered ? (
        <div className="index-trend-chart__tooltip" role="tooltip">
          <strong>{formatIndexValue(hovered.value)}</strong>
          <span>{hovered.label}</span>
        </div>
      ) : null}
    </div>
  )
}

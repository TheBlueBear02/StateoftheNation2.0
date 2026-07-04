import type { CSSProperties } from 'react'

const MOCK_SEATS = {
  value: 32,
  trend: [28, 30, 29, 31, 33, 32],
} as const

type SeatsTrendProps = {
  color: string | null
}

function buildSparklinePoints(values: readonly number[]): string {
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

export function SeatsTrend({ color }: SeatsTrendProps) {
  const accentColor = color ?? '#4890fd'
  const style = { '--party-color': accentColor } as CSSProperties
  const points = buildSparklinePoints(MOCK_SEATS.trend)

  return (
    <section className="party-detail-card seats-trend" style={style} aria-labelledby="seats-title">
      <div className="seats-trend__copy">
        <p className="seats-trend__label">נתוני סקרים — בקרוב</p>
        <h2 id="seats-title" className="seats-trend__value">
          {MOCK_SEATS.value}
        </h2>
        <p className="seats-trend__caption">מנדטים בממוצע נוכחי</p>
      </div>

      <svg
        className="seats-trend__chart"
        viewBox="0 0 120 58"
        role="img"
        aria-label="קו מגמה לדוגמה עבור נתוני סקרים עתידיים"
      >
        <polyline className="seats-trend__grid" points="0,48 120,48" />
        <polyline className="seats-trend__grid" points="0,30 120,30" />
        <polyline className="seats-trend__grid" points="0,12 120,12" />
        <polyline className="seats-trend__line" points={points} />
        {MOCK_SEATS.trend.map((value, index) => {
          const x = (index / (MOCK_SEATS.trend.length - 1)) * 120
          const y =
            48 -
            ((value - Math.min(...MOCK_SEATS.trend)) /
              (Math.max(...MOCK_SEATS.trend) - Math.min(...MOCK_SEATS.trend) || 1)) *
              36

          return (
            <circle
              key={`${value}-${index}`}
              className="seats-trend__dot"
              cx={x}
              cy={y}
              r="2.8"
            />
          )
        })}
      </svg>
    </section>
  )
}

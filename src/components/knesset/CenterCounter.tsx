import {
  COALITION_COLOR,
  COUNTER_RADIUS,
  donutDashArray,
  HEMICYCLE_VIEWBOX,
  OPPOSITION_COLOR,
} from '../../lib/hemicycle'

type CenterCounterProps = {
  coalitionCount: number
  oppositionCount: number
  totalCount: number
  hasCoalitionData: boolean
}

export function CenterCounter({
  coalitionCount,
  oppositionCount,
  totalCount,
  hasCoalitionData,
}: CenterCounterProps) {
  const centerX = HEMICYCLE_VIEWBOX.width / 2
  const centerY = HEMICYCLE_VIEWBOX.height / 2 + 8
  const radius = COUNTER_RADIUS
  const circumference = 2 * Math.PI * radius
  const { coalition, opposition, coalitionOffset } = donutDashArray(
    coalitionCount,
    oppositionCount,
    circumference,
  )

  return (
    <g className="center-counter" transform={`translate(${centerX}, ${centerY})`}>
      <circle
        r={radius + 8}
        fill="#ffffff"
        stroke="none"
        className="center-counter__bg"
      />

      {hasCoalitionData ? (
        <>
          <circle
            r={radius}
            fill="none"
            stroke="#ececec"
            strokeWidth={9}
          />
          <circle
            r={radius}
            fill="none"
            stroke={COALITION_COLOR}
            strokeWidth={9}
            strokeDasharray={coalition}
            transform="rotate(-90)"
          />
          <circle
            r={radius}
            fill="none"
            stroke={OPPOSITION_COLOR}
            strokeWidth={9}
            strokeDasharray={opposition}
            strokeDashoffset={-coalitionOffset}
            transform="rotate(-90)"
          />

          <text className="center-counter__split" y={-6}>
            <tspan fill={COALITION_COLOR} fontWeight={700}>
              {coalitionCount}
            </tspan>
            <tspan fill="#666666"> / </tspan>
            <tspan fill={OPPOSITION_COLOR} fontWeight={700}>
              {oppositionCount}
            </tspan>
          </text>

          <line
            x1={-42}
            y1={14}
            x2={42}
            y2={14}
            stroke="#cccccc"
            strokeWidth={1}
          />
        </>
      ) : (
        <circle
          r={radius}
          fill="none"
          stroke="#b8b8b8"
          strokeWidth={9}
        />
      )}

      <text className="center-counter__total" y={hasCoalitionData ? 38 : 8}>
        {totalCount}
      </text>

      <text className="center-counter__label" y={radius + 40}>
        הכנסת
      </text>
    </g>
  )
}

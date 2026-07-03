import {
  ARC_REVEAL_START_INDEX,
  COALITION_COLOR,
  COUNTER_RADIUS,
  donutDashArray,
  HEMICYCLE_VIEWBOX,
  OPPOSITION_COLOR,
  SEAT_REVEAL_DURATION_MS,
  SEAT_REVEAL_STAGGER_MS,
} from '../../lib/hemicycle'

type CenterCounterProps = {
  coalitionCount: number
  oppositionCount: number
  totalCount: number
  hasCoalitionData: boolean
  hoveredBloc?: 'coalition' | 'opposition' | null
  animate?: boolean
}

const RING_WIDTH = 10

export function CenterCounter({
  coalitionCount,
  oppositionCount,
  totalCount,
  hasCoalitionData,
  hoveredBloc = null,
  animate = false,
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

  const glowColor =
    hoveredBloc === 'coalition'
      ? COALITION_COLOR
      : hoveredBloc === 'opposition'
        ? OPPOSITION_COLOR
        : 'transparent'

  const enterStyle = animate
    ? {
        animationDelay: `${ARC_REVEAL_START_INDEX * SEAT_REVEAL_STAGGER_MS}ms`,
        animationDuration: `${SEAT_REVEAL_DURATION_MS}ms`,
      }
    : undefined

  return (
    <g transform={`translate(${centerX}, ${centerY})`}>
      <g
        className={`center-counter${animate ? ' center-counter--enter' : ''}`}
        style={enterStyle}
      >
      <defs>
        <filter
          id="center-counter-glow"
          x="-80%"
          y="-80%"
          width="260%"
          height="260%"
        >
          <feGaussianBlur stdDeviation="16" />
        </filter>
      </defs>

      <circle
        r={radius + 20}
        fill={glowColor}
        className={`center-counter__glow${hoveredBloc ? ` center-counter__glow--${hoveredBloc}` : ''}`}
        filter="url(#center-counter-glow)"
      />

      <circle
        r={radius + RING_WIDTH / 2 + 4}
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
            strokeWidth={RING_WIDTH}
          />
          <circle
            r={radius}
            fill="none"
            stroke={COALITION_COLOR}
            strokeWidth={RING_WIDTH}
            strokeLinecap="butt"
            strokeDasharray={coalition}
            transform="rotate(90)"
          />
          <circle
            r={radius}
            fill="none"
            stroke={OPPOSITION_COLOR}
            strokeWidth={RING_WIDTH}
            strokeLinecap="butt"
            strokeDasharray={opposition}
            strokeDashoffset={-coalitionOffset}
            transform="rotate(90)"
          />

          <g className="center-counter__content">
            <text
              className="center-counter__split"
              y={-28}
              dominantBaseline="middle"
            >
              <tspan
                className="center-counter__coalition-num"
                fill={COALITION_COLOR}
              >
                {coalitionCount}
              </tspan>
              <tspan className="center-counter__slash" fill="#1a1a1a">
                /
              </tspan>
              <tspan
                className="center-counter__opposition-num"
                fill={OPPOSITION_COLOR}
              >
                {oppositionCount}
              </tspan>
            </text>

            <line
              className="center-counter__divider"
              x1={-34}
              y1={-8}
              x2={34}
              y2={-8}
            />

            <text className="center-counter__total" y={36}>
              {totalCount}
            </text>
          </g>
        </>
      ) : (
        <>
          <circle
            r={radius}
            fill="none"
            stroke="#b8b8b8"
            strokeWidth={RING_WIDTH}
          />
          <text className="center-counter__total" y={0} dominantBaseline="middle">
            {totalCount}
          </text>
        </>
      )}

      {!hasCoalitionData ? (
        <text className="center-counter__label" y={radius + 40}>
          הכנסת
        </text>
      ) : null}
      </g>
    </g>
  )
}

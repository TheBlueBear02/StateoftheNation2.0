import type { CSSProperties } from 'react'
import type { CandidateMapPin } from '../../hooks/useElectionCandidates'

const MAP_VIEWBOX = {
  width: 213,
  height: 598,
  padX: 6,
  padY: 6,
} as const

const MAP_IMAGE_SRC = '/images/elections%20page/israel%20map.svg'
const TOOLTIP = {
  width: 128,
  height: 48,
  gap: 12,
  edgePad: 4,
} as const

const LATITUDE_BOUNDS = {
  minLat: 29.45,
  maxLat: 33.35,
} as const

const X_CALIBRATION = {
  lonScale: 135.315883,
  latScale: 2.768261,
  offset: -4725.09223,
} as const

type CandidateMapProps = {
  pins: CandidateMapPin[]
  partyColor: string | null
  loading: boolean
}

type ProjectedPoint = {
  x: number
  y: number
}

type ProjectedPin = CandidateMapPin &
  ProjectedPoint & {
    offsetIndex: number
    tooltipX: number
    tooltipY: number
  }

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function project(latitude: number, longitude: number): ProjectedPoint {
  // The map asset is visually slanted, so x needs latitude-aware calibration.
  const x =
    longitude * X_CALIBRATION.lonScale +
    latitude * X_CALIBRATION.latScale +
    X_CALIBRATION.offset
  const y =
    (1 -
      (latitude - LATITUDE_BOUNDS.minLat) /
        (LATITUDE_BOUNDS.maxLat - LATITUDE_BOUNDS.minLat)) *
    MAP_VIEWBOX.height

  return {
    x: clamp(x, MAP_VIEWBOX.padX, MAP_VIEWBOX.width - MAP_VIEWBOX.padX),
    y: clamp(y, MAP_VIEWBOX.padY, MAP_VIEWBOX.height - MAP_VIEWBOX.padY),
  }
}

function getTooltipPosition(point: ProjectedPoint): ProjectedPoint {
  const preferredY = point.y - TOOLTIP.height - TOOLTIP.gap
  const fallbackY = point.y + TOOLTIP.gap
  const y = preferredY >= TOOLTIP.edgePad ? preferredY : fallbackY

  return {
    x: clamp(
      point.x - TOOLTIP.width / 2,
      TOOLTIP.edgePad,
      MAP_VIEWBOX.width - TOOLTIP.width - TOOLTIP.edgePad,
    ),
    y: clamp(
      y,
      TOOLTIP.edgePad,
      MAP_VIEWBOX.height - TOOLTIP.height - TOOLTIP.edgePad,
    ),
  }
}

function buildProjectedPins(pins: CandidateMapPin[]): ProjectedPin[] {
  const seenByCoordinate = new Map<string, number>()

  return pins.map((pin) => {
    const coordinateKey = `${pin.latitude.toFixed(3)}:${pin.longitude.toFixed(3)}`
    const offsetIndex = seenByCoordinate.get(coordinateKey) ?? 0
    seenByCoordinate.set(coordinateKey, offsetIndex + 1)

    const projected = project(pin.latitude, pin.longitude)
    const radius = offsetIndex === 0 ? 0 : 4 + Math.floor(offsetIndex / 6) * 3
    const angle = offsetIndex * 2.399963229728653

    const point = {
      x: clamp(
        projected.x + Math.cos(angle) * radius,
        MAP_VIEWBOX.padX,
        MAP_VIEWBOX.width - MAP_VIEWBOX.padX,
      ),
      y: clamp(
        projected.y + Math.sin(angle) * radius,
        MAP_VIEWBOX.padY,
        MAP_VIEWBOX.height - MAP_VIEWBOX.padY,
      ),
    }
    const tooltipPosition = getTooltipPosition(point)

    return {
      ...pin,
      ...point,
      offsetIndex,
      tooltipX: tooltipPosition.x,
      tooltipY: tooltipPosition.y,
    }
  })
}

export function CandidateMap({ pins, partyColor, loading }: CandidateMapProps) {
  const accentColor = partyColor ?? '#4890fd'
  const style = { '--party-color': accentColor } as CSSProperties
  const projectedPins = buildProjectedPins(pins)

  return (
    <section
      className="party-detail-card candidate-map"
      style={style}
      aria-labelledby="candidate-map-title"
    >
      <div className="party-detail-card__header">
        <p className="party-detail-card__eyebrow">מפה</p>
        <h2 id="candidate-map-title" className="party-detail-card__title">
          איפה גרים המועמדים
        </h2>
      </div>

      <div className="candidate-map__layout">
        <svg
          className={`candidate-map__svg${loading ? ' candidate-map__svg--loading' : ''}`}
          viewBox={`0 0 ${MAP_VIEWBOX.width} ${MAP_VIEWBOX.height}`}
          role="img"
          aria-label="מפת ישראל עם נקודות לפי עיר מגורי המועמדים"
        >
          <image
            className="candidate-map__image"
            href={MAP_IMAGE_SRC}
            width={MAP_VIEWBOX.width}
            height={MAP_VIEWBOX.height}
            preserveAspectRatio="xMidYMid meet"
          />

          <g className="candidate-map__pins" role="list">
            {projectedPins.map((pin) => (
              <g
                key={pin.id}
                className="candidate-map__pin-group"
                role="listitem"
                tabIndex={0}
                aria-label={`${pin.fullName}, ${pin.city}`}
              >
                <circle
                  className="candidate-map__pin-hit-area"
                  cx={pin.x}
                  cy={pin.y}
                  r={15}
                />
                <circle
                  className="candidate-map__pin"
                  cx={pin.x}
                  cy={pin.y}
                  r={pin.offsetIndex === 0 ? 7 : 5.8}
                />
                <foreignObject
                  className="candidate-map__tooltip"
                  x={pin.tooltipX}
                  y={pin.tooltipY}
                  width={TOOLTIP.width}
                  height={TOOLTIP.height}
                >
                  <div
                    className="candidate-map__tooltip-content"
                    dir="rtl"
                  >
                    <span className="candidate-map__tooltip-name">
                      {pin.fullName}
                    </span>
                    <span className="candidate-map__tooltip-city">
                      {pin.city}
                    </span>
                  </div>
                </foreignObject>
              </g>
            ))}
          </g>
        </svg>

        <div className="candidate-map__copy">
          <p className="candidate-map__count">
            {loading ? 'טוען נקודות...' : `${pins.length} מועמדים עם עיר וקואורדינטות`}
          </p>
          <p className="candidate-map__note">
            נקודות מוצגות רק עבור מועמדים שעברו גיאוקודינג בהצלחה. מועמדים ללא
            עיר או קואורדינטות נשארים מחוץ למפה ולא מחושבים כטעות.
          </p>
        </div>
      </div>

      {!loading && pins.length === 0 ? (
        <p className="candidate-map__empty">
          אין עדיין קואורדינטות זמינות למועמדי המפלגה.
        </p>
      ) : null}
    </section>
  )
}

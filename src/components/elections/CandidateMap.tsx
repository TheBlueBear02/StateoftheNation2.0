import { useEffect, useState, type CSSProperties, type FocusEvent, type MouseEvent } from 'react'
import type { CandidateMapPin } from '../../hooks/useElectionCandidates'
import { CandidateMapTooltip } from './CandidateMapTooltip'

const MAP_VIEWBOX = {
  width: 213,
  height: 598,
  padX: 6,
  padY: 6,
} as const

const MAP_IMAGE_SRC = '/images/elections%20page/israel%20map.svg'

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
  partyName: string
  partyLogoUrl: string | null
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

    return {
      ...pin,
      ...point,
      offsetIndex,
    }
  })
}

export function CandidateMap({
  pins,
  partyName,
  partyLogoUrl,
  partyColor,
  loading,
}: CandidateMapProps) {
  const accentColor = partyColor ?? '#4890fd'
  const style = { '--party-color': accentColor } as CSSProperties
  const projectedPins = buildProjectedPins(pins)
  const [hoveredPin, setHoveredPin] = useState<ProjectedPin | null>(null)
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 })

  useEffect(() => {
    if (loading) {
      setHoveredPin(null)
    }
  }, [loading])

  function handleMove(event: MouseEvent<SVGGElement>) {
    setTooltipPosition({ x: event.clientX, y: event.clientY })
  }

  function handleFocus(event: FocusEvent<SVGGElement>, pin: ProjectedPin) {
    setHoveredPin(pin)
    const rect = event.currentTarget.getBoundingClientRect()
    setTooltipPosition({
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    })
  }

  return (
    <section
      className="party-detail-card candidate-map"
      style={style}
      aria-labelledby="candidate-map-title"
    >
      {partyLogoUrl ? (
        <span className="candidate-map__logo-badge">
          <img className="candidate-map__logo" src={partyLogoUrl} alt="" />
        </span>
      ) : null}

      <div className="party-detail-card__header">
        <p className="party-detail-card__eyebrow">מפה</p>
        <h2 id="candidate-map-title" className="party-detail-card__title">
          איפה גרים המועמדים
        </h2>
      </div>

      <div className="candidate-map__layout">
        <div className="candidate-map__canvas">
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
                  onMouseEnter={() => setHoveredPin(pin)}
                  onMouseLeave={() => setHoveredPin(null)}
                  onMouseMove={handleMove}
                  onFocus={(event) => handleFocus(event, pin)}
                  onBlur={() => setHoveredPin(null)}
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
                </g>
              ))}
            </g>
          </svg>

          {hoveredPin ? (
            <CandidateMapTooltip
              fullName={hoveredPin.fullName}
              city={hoveredPin.city}
              imageUrl={hoveredPin.imageUrl}
              accentColor={accentColor}
              totalYearsInKnesset={hoveredPin.totalYearsInKnesset}
              x={tooltipPosition.x}
              y={tooltipPosition.y}
            />
          ) : null}
        </div>

        <div className="candidate-map__copy">
          <p className="candidate-map__count">
            {loading
              ? 'טוען נקודות...'
              : `מציג ${pins.length} מועמדים מרשימת ${partyName}`}
          </p>
          <p className="candidate-map__note">
            נקודות מוצגות רק עבור מועמדים שעיר מגורם נמצאת במערכת.
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

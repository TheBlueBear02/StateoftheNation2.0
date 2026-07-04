import type { CSSProperties } from 'react'
import type { CandidateMapPin } from '../../hooks/useElectionCandidates'

const MAP_VIEWBOX = {
  width: 240,
  height: 540,
  padX: 28,
  padY: 18,
} as const

const BOUNDS = {
  minLon: 34.15,
  maxLon: 35.95,
  minLat: 29.45,
  maxLat: 33.35,
} as const

const ISRAEL_OUTLINE = [
  { lat: 33.28, lon: 35.56 },
  { lat: 33.17, lon: 35.72 },
  { lat: 32.92, lon: 35.72 },
  { lat: 32.78, lon: 35.55 },
  { lat: 32.48, lon: 35.57 },
  { lat: 32.16, lon: 35.51 },
  { lat: 31.83, lon: 35.49 },
  { lat: 31.47, lon: 35.39 },
  { lat: 31.1, lon: 35.36 },
  { lat: 30.58, lon: 35.18 },
  { lat: 30.12, lon: 35.02 },
  { lat: 29.55, lon: 34.95 },
  { lat: 29.48, lon: 34.9 },
  { lat: 30.12, lon: 34.72 },
  { lat: 30.78, lon: 34.48 },
  { lat: 31.28, lon: 34.3 },
  { lat: 31.52, lon: 34.34 },
  { lat: 31.78, lon: 34.62 },
  { lat: 32.1, lon: 34.75 },
  { lat: 32.48, lon: 34.9 },
  { lat: 32.82, lon: 35 },
  { lat: 33.1, lon: 35.1 },
  { lat: 33.28, lon: 35.56 },
] as const

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
  }

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function project(latitude: number, longitude: number): ProjectedPoint {
  const innerWidth = MAP_VIEWBOX.width - MAP_VIEWBOX.padX * 2
  const innerHeight = MAP_VIEWBOX.height - MAP_VIEWBOX.padY * 2
  const x =
    MAP_VIEWBOX.padX +
    ((longitude - BOUNDS.minLon) / (BOUNDS.maxLon - BOUNDS.minLon)) * innerWidth
  const y =
    MAP_VIEWBOX.padY +
    (1 - (latitude - BOUNDS.minLat) / (BOUNDS.maxLat - BOUNDS.minLat)) *
      innerHeight

  return {
    x: clamp(x, MAP_VIEWBOX.padX, MAP_VIEWBOX.width - MAP_VIEWBOX.padX),
    y: clamp(y, MAP_VIEWBOX.padY, MAP_VIEWBOX.height - MAP_VIEWBOX.padY),
  }
}

function buildOutlinePath(): string {
  return ISRAEL_OUTLINE.map((point, index) => {
    const projected = project(point.lat, point.lon)
    const command = index === 0 ? 'M' : 'L'
    return `${command}${projected.x.toFixed(1)} ${projected.y.toFixed(1)}`
  }).join(' ')
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

    return {
      ...pin,
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
      offsetIndex,
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
          <path className="candidate-map__outline" d={buildOutlinePath()} />
          <path
            className="candidate-map__coast"
            d="M108 62 C92 118, 83 165, 78 226 C74 278, 62 329, 48 390"
          />

          {projectedPins.map((pin) => (
            <circle
              key={pin.id}
              className="candidate-map__pin"
              cx={pin.x}
              cy={pin.y}
              r={pin.offsetIndex === 0 ? 4 : 3.2}
            >
              <title>{`${pin.fullName} — ${pin.city}`}</title>
            </circle>
          ))}
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

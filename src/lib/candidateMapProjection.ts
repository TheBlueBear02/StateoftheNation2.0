import type { CandidateMapPin } from '../hooks/useElectionCandidates'

export const MAP_VIEWBOX = {
  width: 213,
  height: 598,
  padX: 6,
  padY: 6,
} as const

export const MAP_IMAGE_SRC = '/images/elections%20page/israel%20map.svg'

const LATITUDE_BOUNDS = {
  minLat: 29.45,
  maxLat: 33.35,
} as const

const X_CALIBRATION = {
  lonScale: 135.315883,
  latScale: 2.768261,
  offset: -4725.09223,
} as const

export type ProjectedPoint = {
  x: number
  y: number
}

export type ProjectedPin<T extends CandidateMapPin = CandidateMapPin> = T &
  ProjectedPoint & {
    offsetIndex: number
  }

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

export function project(latitude: number, longitude: number): ProjectedPoint {
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

export function buildProjectedPins<T extends CandidateMapPin>(
  pins: T[],
): ProjectedPin<T>[] {
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

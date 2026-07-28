export type CandidateRating = 'green' | 'orange' | 'red'

export const RATING_POINTS: Record<CandidateRating, number> = {
  green: 1,
  orange: 0.5,
  red: 0,
}

export type RatedCandidate = {
  listPosition: number
  rating: CandidateRating
}

export type RealisticSeatBand = {
  /** Rounded average seats from last-N polls. */
  expectedSeats: number
  /** Inclusive list positions in the realistic zone (clamped to 1…listLength). */
  positions: number[]
  low: number
  mid: number
  high: number
}

/** Weight for list position `p` given list length `n`: top of list counts most. */
export function positionWeight(listPosition: number, listLength: number): number {
  if (listLength <= 0 || listPosition < 1) return 0
  return Math.max(listLength - listPosition + 1, 1)
}

/**
 * Position-weighted fit score 0–100.
 * green=1, orange=0.5, red=0; weight(p) = N − p + 1.
 */
export function computeFitScore(rated: readonly RatedCandidate[]): number | null {
  if (rated.length === 0) return null

  const n = rated.length
  let weightedSum = 0
  let weightTotal = 0

  for (const item of rated) {
    const weight = positionWeight(item.listPosition, n)
    weightedSum += RATING_POINTS[item.rating] * weight
    weightTotal += weight
  }

  if (weightTotal === 0) return null
  return Math.round((100 * weightedSum) / weightTotal)
}

export function countRatings(
  ratings: ReadonlyMap<number, CandidateRating> | Record<number, CandidateRating>,
): { green: number; orange: number; red: number } {
  const values =
    ratings instanceof Map ? [...ratings.values()] : Object.values(ratings)

  let green = 0
  let orange = 0
  let red = 0

  for (const rating of values) {
    if (rating === 'green') green += 1
    else if (rating === 'orange') orange += 1
    else red += 1
  }

  return { green, orange, red }
}

/**
 * Realistic Knesset zone: round(seatsAvg) ± 1, clamped to 1…listLength.
 * Returns null when seatsAvg is unavailable.
 */
export function realisticSeatBand(
  seatsAvg: number | null,
  listLength: number,
): RealisticSeatBand | null {
  if (seatsAvg === null || listLength <= 0) return null

  const expectedSeats = Math.round(seatsAvg)
  if (expectedSeats <= 0) return null

  const mid = Math.min(Math.max(expectedSeats, 1), listLength)
  const low = Math.min(Math.max(expectedSeats - 1, 1), listLength)
  const high = Math.min(Math.max(expectedSeats + 1, 1), listLength)

  const positions: number[] = []
  for (let p = low; p <= high; p += 1) {
    positions.push(p)
  }

  return { expectedSeats, positions, low, mid, high }
}

export function isInRealisticBand(
  listPosition: number,
  band: RealisticSeatBand | null,
): boolean {
  if (!band) return false
  return band.positions.includes(listPosition)
}

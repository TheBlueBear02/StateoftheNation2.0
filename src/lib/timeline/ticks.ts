/**
 * Adaptive year tick step based on pixels-per-year.
 * Targets roughly one label every 60–100px.
 */
export function pickYearStep(pixelsPerYear: number): number {
  const targetPx = 80
  const raw = targetPx / Math.max(pixelsPerYear, 0.0001)
  const candidates = [1, 2, 5, 10, 25, 50, 100]
  for (const step of candidates) {
    if (step >= raw) return step
  }
  return 100
}

export function yearTicks(
  viewStart: number,
  viewEnd: number,
  pixelsPerYear: number,
): number[] {
  const step = pickYearStep(pixelsPerYear)
  const first = Math.ceil(viewStart / step) * step
  const ticks: number[] = []
  for (let y = first; y <= viewEnd; y += step) {
    ticks.push(y)
  }
  return ticks
}

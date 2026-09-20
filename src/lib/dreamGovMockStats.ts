import { DREAM_ALL_OFFICES, type DreamOfficeId } from './dreamGovernmentOffices'
import type { DreamOfficePickStat } from '../components/elections/dream/DreamOfficeSquare'

/**
 * TEMP visual-test flag: when true, dream-government ignores real aggregates
 * and shows a random % per office (new set on each full page reload).
 * Set to `false` before shipping.
 */
export const USE_DREAM_GOV_MOCK_STATS = false

/** One random 0–100% per office; call once per page mount. */
export function buildMockDreamPickPercentages(): Record<DreamOfficeId, number> {
  const next = {} as Record<DreamOfficeId, number>
  for (const office of DREAM_ALL_OFFICES) {
    next[office.id] = Math.floor(Math.random() * 101)
  }
  return next
}

export function mockDreamPickStat(
  percentage: number,
): DreamOfficePickStat {
  return {
    percentage: Math.max(0, Math.min(100, Math.round(percentage))),
    total: 100,
    count: Math.max(0, Math.min(100, Math.round(percentage))),
  }
}

import type {
  OfficeDashboardIndex,
  OfficeDashboardOffice,
} from './fetchOfficeDashboard'

/** How many charts the homepage hot-indexes carousel shows. */
export const HOT_INDEX_COUNT = 5

/**
 * Curated hot indexes in carousel order.
 * - `string` → exact match on `indexes.name` (first office that has it)
 * - `number` → exact match on `indexes.id` (use when the name is shared, e.g. תקציב)
 */
export const HOT_INDEX_PICKS: readonly (string | number)[] = [
  'רצח בחברה הערבית',
  'הרוגים בתאונות דרכים',
  'החוב הממשלתי',
  11, // תקציב — Education ministry (name is not unique across offices)
]

export type HotOfficeIndexSlide = {
  office: OfficeDashboardOffice
  index: OfficeDashboardIndex
}

/**
 * Resolve curated picks to live office+index pairs. Falls back to alert KPIs,
 * then remaining KPIs, so the carousel still fills if a name/id is missing.
 */
export function pickHotOfficeIndexes(
  offices: OfficeDashboardOffice[],
  count = HOT_INDEX_COUNT,
): HotOfficeIndexSlide[] {
  const byId = new Map<number, HotOfficeIndexSlide>()
  const byName = new Map<string, HotOfficeIndexSlide>()
  for (const office of offices) {
    for (const index of office.indexes) {
      if (!byId.has(index.id)) {
        byId.set(index.id, { office, index })
      }
      if (!byName.has(index.name)) {
        byName.set(index.name, { office, index })
      }
    }
  }

  const picked: HotOfficeIndexSlide[] = []
  const usedIds = new Set<number>()

  for (const pick of HOT_INDEX_PICKS) {
    if (picked.length >= count) break
    const slide =
      typeof pick === 'number' ? byId.get(pick) : byName.get(pick)
    if (!slide || usedIds.has(slide.index.id)) continue
    picked.push(slide)
    usedIds.add(slide.index.id)
  }

  if (picked.length >= count) return picked

  const fallbackPool: HotOfficeIndexSlide[] = []
  for (const office of offices) {
    for (const index of office.indexes) {
      if (usedIds.has(index.id)) continue
      fallbackPool.push({ office, index })
    }
  }

  fallbackPool.sort((a, b) => {
    const alertScore = Number(b.index.alert) - Number(a.index.alert)
    if (alertScore !== 0) return alertScore
    const kpiScore = Number(b.index.isKpi) - Number(a.index.isKpi)
    if (kpiScore !== 0) return kpiScore
    return a.index.name.localeCompare(b.index.name, 'he')
  })

  for (const slide of fallbackPool) {
    if (picked.length >= count) break
    picked.push(slide)
    usedIds.add(slide.index.id)
  }

  return picked
}

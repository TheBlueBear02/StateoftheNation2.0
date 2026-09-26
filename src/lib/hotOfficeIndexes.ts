import type {
  OfficeDashboardIndex,
  OfficeDashboardOffice,
} from './fetchOfficeDashboard'

/** How many charts the homepage hot-indexes carousel shows. */
export const HOT_INDEX_COUNT = 5

/**
 * Curated “hot” index names (exact match against `indexes.name`).
 * Order = carousel order. Edit this list to change what the homepage loops.
 */
export const HOT_INDEX_NAMES: readonly string[] = [
  'רצח בחברה הערבית',
  'הרוגים בתאונות דרכים',
  'אינפלציה',
  'זכאים לתעודת בגרות',
  'אמון במשטרה',
]

export type HotOfficeIndexSlide = {
  office: OfficeDashboardOffice
  index: OfficeDashboardIndex
}

/**
 * Resolve curated names to live office+index pairs. Falls back to alert KPIs,
 * then remaining KPIs, so the carousel still fills if a name is renamed/missing.
 */
export function pickHotOfficeIndexes(
  offices: OfficeDashboardOffice[],
  count = HOT_INDEX_COUNT,
): HotOfficeIndexSlide[] {
  const byName = new Map<string, HotOfficeIndexSlide>()
  for (const office of offices) {
    for (const index of office.indexes) {
      if (!byName.has(index.name)) {
        byName.set(index.name, { office, index })
      }
    }
  }

  const picked: HotOfficeIndexSlide[] = []
  const usedIds = new Set<number>()

  for (const name of HOT_INDEX_NAMES) {
    if (picked.length >= count) break
    const slide = byName.get(name)
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

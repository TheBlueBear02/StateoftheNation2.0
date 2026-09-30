/** Period + release-window helpers for office KPI freshness (mirrors Offices/periods.py). */

export type Frequency = 'yearly' | 'monthly'

export type ReleaseSpec = {
  window?: string
  year_offset?: number
  min_lag_days?: number
  max_lag_days?: number
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate()
}

function addDays(isoDate: Date, days: number): Date {
  const d = new Date(isoDate.getTime())
  d.setUTCDate(d.getUTCDate() + days)
  return d
}

function mmdd(year: number, text: string): Date {
  const [monthRaw, dayRaw] = text.split('-')
  const month = Number(monthRaw)
  const day = Math.min(Number(dayRaw), daysInMonth(year, month))
  return new Date(Date.UTC(year, month - 1, day))
}

export function nextPeriod(periodIso: string, frequency: Frequency): string {
  const d = new Date(`${periodIso.slice(0, 10)}T00:00:00Z`)
  if (frequency === 'yearly') {
    return `${d.getUTCFullYear() + 1}-01-01`
  }
  const months = d.getUTCFullYear() * 12 + d.getUTCMonth() + 1
  const y = Math.floor(months / 12)
  const m = (months % 12) + 1
  return `${y}-${String(m).padStart(2, '0')}-01`
}

export function periodEnd(periodIso: string, frequency: Frequency): Date {
  const d = new Date(`${periodIso.slice(0, 10)}T00:00:00Z`)
  if (frequency === 'yearly') {
    return new Date(Date.UTC(d.getUTCFullYear(), 11, 31))
  }
  const y = d.getUTCFullYear()
  const m = d.getUTCMonth() + 1
  return new Date(Date.UTC(y, m - 1, daysInMonth(y, m)))
}

export function releaseWindow(
  targetIso: string,
  frequency: Frequency,
  release: ReleaseSpec,
): { start: Date; end: Date } {
  if (frequency === 'monthly') {
    const end = periodEnd(targetIso, 'monthly')
    return {
      start: addDays(end, Number(release.min_lag_days ?? 5)),
      end: addDays(end, Number(release.max_lag_days ?? 45)),
    }
  }
  const window = release.window ?? '03-01..12-31'
  const [startS, endS] = window.split('..').map((s) => s.trim())
  const year =
    new Date(`${targetIso.slice(0, 10)}T00:00:00Z`).getUTCFullYear() +
    Number(release.year_offset ?? 1)
  let start = mmdd(year, startS)
  let end = mmdd(year, endS)
  if (end < start) {
    end = mmdd(year + 1, endS)
  }
  return { start, end }
}

/**
 * Green when the next missing period is not yet overdue (before / during its
 * release window). Red only after the release window ended without that point.
 */
export function isCurrentThroughExpected(
  latestIso: string | null,
  frequency: Frequency,
  release: ReleaseSpec,
  today: Date = new Date(),
): { upToDate: boolean; targetPeriod: string | null; windowEnd: string | null } {
  if (!latestIso) {
    return { upToDate: false, targetPeriod: null, windowEnd: null }
  }
  const target = nextPeriod(latestIso.slice(0, 10), frequency)
  const { end } = releaseWindow(target, frequency, release)
  const todayUtc = Date.UTC(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  )
  const endUtc = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate())
  return {
    upToDate: todayUtc <= endUtc,
    targetPeriod: target,
    windowEnd: end.toISOString().slice(0, 10),
  }
}

export function normalizeOfficeName(name: string): string {
  return name
    .replace(/^המשרד ל/, '')
    .replace(/^משרד ה/, '')
    .replace(/^משרד /, '')
    .trim()
}

export function officesMatch(a: string, b: string): boolean {
  const na = normalizeOfficeName(a)
  const nb = normalizeOfficeName(b)
  return na === nb || na.includes(nb) || nb.includes(na)
}

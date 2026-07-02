export type MembershipInterval = {
  startDate: string
  endDate: string | null
}

export type MemberTenureStats = {
  knessetNumber: number | null
  firstElectedYear: number | null
  totalDaysInKnesset: number
  totalYearsInKnesset: number
}

type DateInterval = {
  start: Date
  end: Date
}

function startOfDay(date: Date): Date {
  const normalized = new Date(date)
  normalized.setHours(0, 0, 0, 0)
  return normalized
}

function mergeOverlappingIntervals(intervals: DateInterval[]): DateInterval[] {
  if (intervals.length === 0) {
    return []
  }

  const sorted = [...intervals].sort(
    (left, right) => left.start.getTime() - right.start.getTime(),
  )
  const merged: DateInterval[] = [sorted[0]]

  for (let index = 1; index < sorted.length; index += 1) {
    const current = sorted[index]
    const last = merged[merged.length - 1]

    if (current.start.getTime() <= last.end.getTime()) {
      last.end = new Date(Math.max(last.end.getTime(), current.end.getTime()))
      continue
    }

    merged.push(current)
  }

  return merged
}

function toDateInterval(
  membership: MembershipInterval,
  referenceDate: Date,
): DateInterval | null {
  if (!membership.startDate) {
    return null
  }

  const start = startOfDay(new Date(membership.startDate))
  const end = startOfDay(
    membership.endDate ? new Date(membership.endDate) : referenceDate,
  )

  if (end.getTime() < start.getTime()) {
    return null
  }

  return { start, end }
}

function daysInclusive(start: Date, end: Date): number {
  const diffMs = end.getTime() - start.getTime()
  return Math.floor(diffMs / (1000 * 60 * 60 * 24)) + 1
}

export function computeMemberTenureStats(
  memberships: MembershipInterval[],
  currentKnessetNumber: number | null,
  referenceDate = new Date(),
): MemberTenureStats {
  const validStarts = memberships
    .map((membership) => membership.startDate)
    .filter(Boolean)
    .map((startDate) => new Date(startDate).getFullYear())
    .filter((year) => Number.isFinite(year))

  const intervals = memberships
    .map((membership) => toDateInterval(membership, referenceDate))
    .filter((interval): interval is DateInterval => interval !== null)

  const merged = mergeOverlappingIntervals(intervals)
  const totalDaysInKnesset = merged.reduce(
    (sum, interval) => sum + daysInclusive(interval.start, interval.end),
    0,
  )

  const totalYearsInKnesset =
    totalDaysInKnesset > 0
      ? Math.round((totalDaysInKnesset / 365.25) * 10) / 10
      : 0

  return {
    knessetNumber: currentKnessetNumber,
    firstElectedYear:
      validStarts.length > 0 ? Math.min(...validStarts) : null,
    totalDaysInKnesset,
    totalYearsInKnesset,
  }
}

export function formatTenureYears(years: number): string {
  if (years === 1) {
    return 'שנה אחת'
  }

  if (Number.isInteger(years)) {
    return `${years} שנים`
  }

  return `${years} שנים`
}

export function formatTenureDays(days: number): string {
  if (days === 1) {
    return 'יום אחד'
  }

  return `${days.toLocaleString('he-IL')} ימים`
}

export function formatTenureSummary(days: number, years: number): string {
  return `${formatTenureDays(days)} בכנסת (${formatTenureYears(years)})`
}

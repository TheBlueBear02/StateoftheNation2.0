import type { TimelineDate } from '@/content/timeline/types'

/** Minimum visual duration in years for point events. */
export const MIN_EVENT_YEARS = 0.25

/**
 * Convert a partial date to a fractional year.
 * When `endOfPeriod` is true, year → Dec 31, year-month → last day of month.
 */
export function dateToYear(date: TimelineDate, endOfPeriod = false): number {
  const parts = date.split('-').map(Number)
  const year = parts[0]
  let month: number
  let day: number

  if (parts.length === 1) {
    month = endOfPeriod ? 12 : 1
    day = endOfPeriod ? 31 : 1
  } else if (parts.length === 2) {
    month = parts[1]
    day = endOfPeriod ? daysInMonth(year, month) : 1
  } else {
    month = parts[1]
    day = parts[2]
  }

  const dayOfYear = dayOfYearNumber(year, month, day)
  const totalDays = isLeapYear(year) ? 366 : 365
  return year + (dayOfYear - 1) / totalDays
}

export function eventYearRange(
  startDate: TimelineDate,
  endDate?: TimelineDate,
): { startYear: number; endYear: number } {
  const startYear = dateToYear(startDate, false)
  let endYear = endDate ? dateToYear(endDate, true) : startYear + MIN_EVENT_YEARS
  if (endYear <= startYear) {
    endYear = startYear + MIN_EVENT_YEARS
  }
  return { startYear, endYear }
}

export function formatTimelineDate(date: TimelineDate): string {
  const parts = date.split('-')
  if (parts.length === 1) return parts[0]
  if (parts.length === 2) return `${parts[1]}.${parts[0]}`
  return `${parts[2]}.${parts[1]}.${parts[0]}`
}

/**
 * Parse a user-facing date (`24.10.2026`, `10.1948`, or `1948`) into storage form
 * (`2026-10-24`, `1948-10`, `1948`). Also accepts existing ISO-like values.
 */
export function parseTimelineDateInput(raw: string): string | null {
  const value = raw.trim()
  if (!value) return ''

  if (/^\d{4}(-\d{2}(-\d{2})?)?$/.test(value)) return value

  const dottedDay = value.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/)
  if (dottedDay) {
    const day = dottedDay[1].padStart(2, '0')
    const month = dottedDay[2].padStart(2, '0')
    return `${dottedDay[3]}-${month}-${day}`
  }

  const dottedMonth = value.match(/^(\d{1,2})\.(\d{4})$/)
  if (dottedMonth) {
    const month = dottedMonth[1].padStart(2, '0')
    return `${dottedMonth[2]}-${month}`
  }

  if (/^\d{4}$/.test(value)) return value

  return null
}

export function formatEventDateRange(
  startDate: TimelineDate,
  endDate?: TimelineDate,
): string {
  if (!endDate || endDate === startDate) return formatTimelineDate(startDate)
  return `${formatTimelineDate(startDate)} – ${formatTimelineDate(endDate)}`
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate()
}

function dayOfYearNumber(year: number, month: number, day: number): number {
  let total = day
  for (let m = 1; m < month; m++) {
    total += daysInMonth(year, m)
  }
  return total
}

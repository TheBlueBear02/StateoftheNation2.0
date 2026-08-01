import { useCallback, useEffect, useState } from 'react'
import { supabase, supabaseConfigError } from '../lib/supabase'

export type SiteUpdateRow = {
  id: number
  event_type: string
  headline: string
  href: string
  occurred_at: string
}

const TARGET_COUNT = 10
const JERUSALEM_TZ = 'Asia/Jerusalem'

const FALLBACK_ITEMS: Omit<SiteUpdateRow, 'id' | 'event_type' | 'occurred_at'>[] = [
  { headline: 'נתניהו: "הממשלה פועלת למען ביטחון האזרחים"', href: '/government' },
  { headline: 'N12: סקר חדש מצביע על שינוי במפה הפוליטית', href: '/elections/polls' },
  { headline: 'C14: דיון סוער בכנסת על תקציב המדינה', href: '/knesset' },
  {
    headline: 'מצב האומה: דשבורד ממשלה מציג נתונים עדכניים מכל המשרדים',
    href: '/government',
  },
]

export type NewsStripItem = {
  key: string
  headline: string
  href: string
  /** Jerusalem local stamp like `15:00` (today) or `31.7` (other days), or null for static defaults */
  whenLabel: string | null
}

/** Format `occurred_at` in Asia/Jerusalem: `HH:mm` today, else `D.M` (no time). */
export function formatSiteUpdateWhen(occurredAt: string): string | null {
  const date = new Date(occurredAt)
  if (Number.isNaN(date.getTime())) {
    return null
  }

  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: JERUSALEM_TZ,
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date)

  const nowParts = new Intl.DateTimeFormat('en-GB', {
    timeZone: JERUSALEM_TZ,
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
  }).formatToParts(new Date())

  const get = (
    list: Intl.DateTimeFormatPart[],
    type: Intl.DateTimeFormatPartTypes,
  ) => list.find((part) => part.type === type)?.value

  const day = get(parts, 'day')
  const month = get(parts, 'month')
  const year = get(parts, 'year')
  const hour = get(parts, 'hour')
  const minute = get(parts, 'minute')
  if (!day || !month || !year || !hour || !minute) {
    return null
  }

  const isToday =
    day === get(nowParts, 'day') &&
    month === get(nowParts, 'month') &&
    year === get(nowParts, 'year')

  if (isToday) {
    return `${hour}:${minute}`
  }

  return `${Number(day)}.${Number(month)}`
}

function fallbackItems(): NewsStripItem[] {
  return FALLBACK_ITEMS.map((item, index) => ({
    key: `fallback-${index}`,
    headline: item.headline,
    href: item.href,
    whenLabel: null,
  }))
}

/** Latest DB rows first, then static defaults until TARGET_COUNT (or defaults run out). */
export function mergeSiteUpdateItems(rows: SiteUpdateRow[]): NewsStripItem[] {
  const fromDb = rows.slice(0, TARGET_COUNT).map((row) => ({
    key: `update-${row.id}`,
    headline: row.headline,
    href: row.href,
    whenLabel: formatSiteUpdateWhen(row.occurred_at),
  }))

  if (fromDb.length >= TARGET_COUNT) {
    return fromDb
  }

  const seenHeadlines = new Set(
    fromDb.map((item) => item.headline.trim().toLowerCase()),
  )
  const fillers: NewsStripItem[] = []
  for (const [index, item] of FALLBACK_ITEMS.entries()) {
    if (fillers.length + fromDb.length >= TARGET_COUNT) {
      break
    }
    const normalized = item.headline.trim().toLowerCase()
    if (seenHeadlines.has(normalized)) {
      continue
    }
    seenHeadlines.add(normalized)
    fillers.push({
      key: `fallback-${index}`,
      headline: item.headline,
      href: item.href,
      whenLabel: null,
    })
  }

  return [...fromDb, ...fillers]
}

export function useSiteUpdates() {
  const [items, setItems] = useState<NewsStripItem[]>(() => fallbackItems())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    if (!supabase) {
      setError(supabaseConfigError)
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    const { data, error: queryError } = await supabase
      .from('site_updates')
      .select('id, event_type, headline, href, occurred_at')
      .order('occurred_at', { ascending: false })
      .limit(TARGET_COUNT)

    if (queryError) {
      setError(queryError.message)
      setItems(fallbackItems())
      setLoading(false)
      return
    }

    setItems(mergeSiteUpdateItems((data ?? []) as SiteUpdateRow[]))
    setLoading(false)
  }, [])

  useEffect(() => {
    void refetch()
  }, [refetch])

  return { items, loading, error, refetch }
}

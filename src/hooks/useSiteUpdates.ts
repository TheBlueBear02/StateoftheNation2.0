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

export type NewsStripItem = {
  key: string
  headline: string
  href: string
  /** Jerusalem local stamp like `15:00` (today) or `31.7` (other days) */
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

/** Map DB rows to strip items (newest first, capped at TARGET_COUNT). */
export function mapSiteUpdateItems(rows: SiteUpdateRow[]): NewsStripItem[] {
  return rows.slice(0, TARGET_COUNT).map((row) => ({
    key: `update-${row.id}`,
    headline: row.headline,
    href: row.href,
    whenLabel: formatSiteUpdateWhen(row.occurred_at),
  }))
}

export function useSiteUpdates() {
  const [items, setItems] = useState<NewsStripItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    if (!supabase) {
      setError(supabaseConfigError)
      setItems([])
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
      setItems([])
      setLoading(false)
      return
    }

    setItems(mapSiteUpdateItems((data ?? []) as SiteUpdateRow[]))
    setLoading(false)
  }, [])

  useEffect(() => {
    void refetch()
  }, [refetch])

  return { items, loading, error, refetch }
}

import { useCallback, useEffect, useState } from 'react'
import { supabase, supabaseConfigError } from '../lib/supabase'

export type SiteUpdateRow = {
  id: number
  event_type: string
  headline: string
  href: string
  occurred_at: string
}

const LIMIT = 20

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
}

export function useSiteUpdates() {
  const [items, setItems] = useState<NewsStripItem[]>(() =>
    FALLBACK_ITEMS.map((item, index) => ({
      key: `fallback-${index}`,
      headline: item.headline,
      href: item.href,
    })),
  )
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
      .limit(LIMIT)

    if (queryError) {
      setError(queryError.message)
      setLoading(false)
      return
    }

    const rows = (data ?? []) as SiteUpdateRow[]
    if (rows.length > 0) {
      setItems(
        rows.map((row) => ({
          key: `update-${row.id}`,
          headline: row.headline,
          href: row.href,
        })),
      )
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    void refetch()
  }, [refetch])

  return { items, loading, error, refetch }
}

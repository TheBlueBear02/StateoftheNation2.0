import { useEffect, useState } from 'react'
import {
  fetchLatestPollFieldworkEnd,
  formatPollDateLabel,
} from '../lib/fetchPolls'
import { supabase, supabaseConfigError } from '../lib/supabase'

export type UseLatestPollDateResult = {
  /** Formatted `D.M.YYYY`, or null while loading / on error / empty. */
  dateLabel: string | null
}

/** Homepage meta: fieldwork end of the newest regular poll. */
export function useLatestPollDate(): UseLatestPollDateResult {
  const [dateLabel, setDateLabel] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      if (supabaseConfigError || !supabase) {
        return
      }

      const result = await fetchLatestPollFieldworkEnd(supabase)
      if (cancelled || !result.fieldworkEnd) {
        return
      }

      setDateLabel(formatPollDateLabel(result.fieldworkEnd))
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [])

  return { dateLabel }
}

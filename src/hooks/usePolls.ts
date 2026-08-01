import { useCallback, useEffect, useState } from 'react'
import {
  fetchPolls,
  formatFieldwork,
  type PollPartyResult,
  type PollWithResults,
} from '../lib/fetchPolls'
import { supabase, supabaseConfigError } from '../lib/supabase'

export type { PollPartyResult, PollWithResults }
export { formatFieldwork }

export type UsePollsResult = {
  polls: PollWithResults[]
  loading: boolean
  error: string | null
  refetch: () => Promise<void>
}

export function usePolls(
  limit = 30,
  initialPolls?: PollWithResults[],
): UsePollsResult {
  const [polls, setPolls] = useState<PollWithResults[]>(initialPolls ?? [])
  const [loading, setLoading] = useState(initialPolls === undefined)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (supabaseConfigError || !supabase) {
      setError(supabaseConfigError ?? 'Supabase client is not configured')
      setPolls([])
      setLoading(false)
      return
    }

    const result = await fetchPolls(supabase, limit)
    setError(result.error)
    setPolls(result.polls)
    setLoading(false)
  }, [limit])

  const refetch = useCallback(async () => {
    setLoading(true)
    setError(null)
    await load()
  }, [load])

  useEffect(() => {
    if (initialPolls !== undefined) {
      return
    }
    void load()
  }, [initialPolls, load])

  return { polls, loading, error, refetch }
}

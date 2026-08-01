import { useCallback, useEffect, useState } from 'react'
import {
  fetchElectionParties,
  formatElectionDate,
} from '../lib/fetchElectionParties'
import {
  supabase,
  supabaseConfigError,
  type ElectionOption,
  type ElectionParty,
} from '../lib/supabase'

export { formatElectionDate }

export type UseElectionPartiesResult = {
  election: ElectionOption | null
  parties: ElectionParty[]
  loading: boolean
  error: string | null
  refetch: () => Promise<void>
}

export function useElectionParties(initial?: {
  election: ElectionOption | null
  parties: ElectionParty[]
}): UseElectionPartiesResult {
  const hasInitial = initial !== undefined
  const [election, setElection] = useState<ElectionOption | null>(
    initial?.election ?? null,
  )
  const [parties, setParties] = useState<ElectionParty[]>(initial?.parties ?? [])
  const [loading, setLoading] = useState(!hasInitial)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (supabaseConfigError || !supabase) {
      setError(supabaseConfigError ?? 'Supabase client is not configured')
      setElection(null)
      setParties([])
      setLoading(false)
      return
    }

    const result = await fetchElectionParties(supabase)
    setError(result.error)
    setElection(result.election)
    setParties(result.parties)
    setLoading(false)
  }, [])

  const refetch = useCallback(async () => {
    setLoading(true)
    setError(null)
    await load()
  }, [load])

  useEffect(() => {
    if (hasInitial) {
      return
    }
    void load()
  }, [hasInitial, load])

  return { election, parties, loading, error, refetch }
}

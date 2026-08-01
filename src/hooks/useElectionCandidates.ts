import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  buildCandidateMapPins,
  buildCandidateStats,
  calculateAge,
  fetchElectionCandidates,
  type CandidateMapPin,
  type ElectionCandidate,
  type ElectionCandidateStats,
  type ElectionStat,
} from '../lib/fetchElectionCandidates'
import { supabase, supabaseConfigError } from '../lib/supabase'

export type {
  CandidateMapPin,
  ElectionCandidate,
  ElectionCandidateStats,
  ElectionStat,
}
export { calculateAge }

export type UseElectionCandidatesResult = {
  candidates: ElectionCandidate[]
  stats: ElectionCandidateStats
  mapPins: CandidateMapPin[]
  loading: boolean
  error: string | null
  refetch: () => Promise<void>
}

export function useElectionCandidates(
  partyId: number | null,
  initialCandidates?: ElectionCandidate[],
): UseElectionCandidatesResult {
  const hasInitial =
    partyId !== null &&
    initialCandidates !== undefined &&
    (initialCandidates.length === 0 ||
      initialCandidates[0]?.partyId === partyId)

  const [candidates, setCandidates] = useState<ElectionCandidate[]>(
    hasInitial ? (initialCandidates ?? []) : [],
  )
  const [loading, setLoading] = useState(
    Boolean(partyId) && !hasInitial,
  )
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!partyId) {
      setCandidates([])
      setLoading(false)
      return
    }

    if (supabaseConfigError || !supabase) {
      setError(supabaseConfigError ?? 'Supabase client is not configured')
      setCandidates([])
      setLoading(false)
      return
    }

    const result = await fetchElectionCandidates(supabase, partyId)
    setError(result.error)
    setCandidates(result.candidates)
    setLoading(false)
  }, [partyId])

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

  const stats = useMemo(() => buildCandidateStats(candidates), [candidates])
  const mapPins = useMemo(() => buildCandidateMapPins(candidates), [candidates])

  return { candidates, stats, mapPins, loading, error, refetch }
}

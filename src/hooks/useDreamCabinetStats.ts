'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  emptyDreamCabinetStats,
  fetchDreamCabinetStats,
  mergeLocalPicksIntoStats,
  type DreamCabinetStats,
  type DreamCabinetSubmitPick,
} from '../lib/fetchDreamCabinetStats'

export type UseDreamCabinetStatsResult = {
  stats: DreamCabinetStats
  loading: boolean
  error: string | null
  refetch: () => Promise<void>
  /** Instantly include this browser's picks so % bars appear before refetch. */
  applyLocalPicks: (picks: DreamCabinetSubmitPick[]) => void
}

export function useDreamCabinetStats(): UseDreamCabinetStatsResult {
  const [stats, setStats] = useState<DreamCabinetStats>(() =>
    emptyDreamCabinetStats(),
  )
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const next = await fetchDreamCabinetStats()
      setStats(next)
    } catch (err) {
      console.error('[dream-government] stats fetch failed', err)
      setError('לא ניתן לטעון את סטטיסטיקות הבחירות')
    } finally {
      setLoading(false)
    }
  }, [])

  const applyLocalPicks = useCallback((picks: DreamCabinetSubmitPick[]) => {
    if (picks.length === 0) return
    setStats((prev) => mergeLocalPicksIntoStats(prev, picks))
  }, [])

  useEffect(() => {
    void refetch()
  }, [refetch])

  return { stats, loading, error, refetch, applyLocalPicks }
}

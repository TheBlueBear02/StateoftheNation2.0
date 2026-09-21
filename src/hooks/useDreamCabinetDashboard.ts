'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  fetchDreamCabinetDashboard,
  type DreamCabinetDashboard,
} from '../lib/fetchDreamCabinetDashboard'

export type UseDreamCabinetDashboardResult = {
  data: DreamCabinetDashboard | null
  loading: boolean
  error: string | null
  refetch: () => Promise<void>
}

export function useDreamCabinetDashboard(): UseDreamCabinetDashboardResult {
  const [data, setData] = useState<DreamCabinetDashboard | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const next = await fetchDreamCabinetDashboard()
      setData(next)
    } catch (err) {
      console.error('[dream-government] dashboard fetch failed', err)
      setError('לא ניתן לטעון את לוח הבקרה')
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refetch()
  }, [refetch])

  return { data, loading, error, refetch }
}

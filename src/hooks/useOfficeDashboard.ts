'use client'

import { useEffect, useState } from 'react'
import {
  fetchOfficeDashboard,
  type OfficeDashboardOffice,
} from '../lib/fetchOfficeDashboard'

export type UseOfficeDashboardResult = {
  offices: OfficeDashboardOffice[]
  loading: boolean
  error: string | null
}

export function useOfficeDashboard(): UseOfficeDashboardResult {
  const [offices, setOffices] = useState<OfficeDashboardOffice[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)
      const result = await fetchOfficeDashboard()
      if (cancelled) return
      setOffices(result.offices)
      setError(result.error)
      setLoading(false)
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [])

  return { offices, loading, error }
}

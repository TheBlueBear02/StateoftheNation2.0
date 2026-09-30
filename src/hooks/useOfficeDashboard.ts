'use client'

import { useEffect, useState } from 'react'
import {
  fetchOfficeDashboard,
  type OfficeDashboardMinisterEra,
  type OfficeDashboardOffice,
} from '../lib/fetchOfficeDashboard'

export type UseOfficeDashboardResult = {
  offices: OfficeDashboardOffice[]
  primeMinisterHistory: OfficeDashboardMinisterEra[]
  loading: boolean
  error: string | null
}

export function useOfficeDashboard(): UseOfficeDashboardResult {
  const [offices, setOffices] = useState<OfficeDashboardOffice[]>([])
  const [primeMinisterHistory, setPrimeMinisterHistory] = useState<
    OfficeDashboardMinisterEra[]
  >([])
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
      setPrimeMinisterHistory(result.primeMinisterHistory)
      setError(result.error)
      setLoading(false)
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [])

  return { offices, primeMinisterHistory, loading, error }
}

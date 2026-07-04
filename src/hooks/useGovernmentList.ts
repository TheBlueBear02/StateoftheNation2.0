import { useEffect, useState } from 'react'
import {
  supabase,
  supabaseConfigError,
  type GovernmentOption,
  type GovernmentRow,
} from '../lib/supabase'

export type UseGovernmentListResult = {
  governments: GovernmentOption[]
  loading: boolean
  error: string | null
}

function normalizeGovernment(row: GovernmentRow): GovernmentOption {
  return {
    id: row.id,
    governmentNumber: row.government_number,
    knessetId: row.knesset_id,
    startDate: row.start_date,
    endDate: row.end_date,
    isActive: row.is_active,
  }
}

export function formatGovernmentTitle(government: GovernmentOption): string {
  return `הממשלה ה-${government.governmentNumber}`
}

export function formatGovernmentOfficesTitle(
  government: GovernmentOption,
): string {
  return `משרדי הממשלה ה-${government.governmentNumber}`
}

export function formatGovernmentLabel(government: GovernmentOption): string {
  const startYear = government.startDate
    ? new Date(government.startDate).getFullYear()
    : '?'
  const endYear = government.endDate
    ? new Date(government.endDate).getFullYear()
    : 'היום'

  return `הממשלה ה-${government.governmentNumber} (${endYear}–${startYear})`
}

export function useGovernmentList(): UseGovernmentListResult {
  const [governments, setGovernments] = useState<GovernmentOption[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function fetchGovernments() {
      setLoading(true)
      setError(null)

      if (supabaseConfigError || !supabase) {
        setError(supabaseConfigError ?? 'Supabase client is not configured')
        setGovernments([])
        setLoading(false)
        return
      }

      const { data, error: queryError } = await supabase
        .from('governments')
        .select('id, government_number, knesset_id, start_date, end_date, is_active')
        .order('government_number', { ascending: false })

      if (cancelled) {
        return
      }

      if (queryError) {
        setError(queryError.message)
        setGovernments([])
        setLoading(false)
        return
      }

      setGovernments(((data ?? []) as GovernmentRow[]).map(normalizeGovernment))
      setLoading(false)
    }

    void fetchGovernments()

    return () => {
      cancelled = true
    }
  }, [])

  return { governments, loading, error }
}

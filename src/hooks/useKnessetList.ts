import { useEffect, useState } from 'react'
import {
  supabase,
  supabaseConfigError,
  type KnessetOption,
  type KnessetRow,
} from '../lib/supabase'

export type UseKnessetListResult = {
  knessets: KnessetOption[]
  loading: boolean
  error: string | null
}

function normalizeKnesset(row: KnessetRow): KnessetOption {
  return {
    id: row.id,
    knessetNumber: row.knesset_number,
    knessetName: row.knesset_name,
    startDate: row.start_date,
    endDate: row.end_date,
    isActive: row.is_active,
  }
}

export function formatKnessetTitle(term: KnessetOption): string {
  return `הכנסת ה-${term.knessetNumber}`
}

export function formatKnessetMembersTitle(term: KnessetOption): string {
  return `חברי הכנסת ה-${term.knessetNumber}`
}

export function formatKnessetLabel(term: KnessetOption): string {
  const startYear = term.startDate
    ? new Date(term.startDate).getFullYear()
    : '?'
  const endYear = term.endDate
    ? new Date(term.endDate).getFullYear()
    : 'היום'

  return `הכנסת ה-${term.knessetNumber} (${startYear}–${endYear})`
}

export function useKnessetList(): UseKnessetListResult {
  const [knessets, setKnessets] = useState<KnessetOption[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function fetchKnessets() {
      setLoading(true)
      setError(null)

      if (supabaseConfigError || !supabase) {
        setError(supabaseConfigError ?? 'Supabase client is not configured')
        setKnessets([])
        setLoading(false)
        return
      }

      const { data, error: queryError } = await supabase
        .from('knessets')
        .select('id, knesset_number, knesset_name, start_date, end_date, is_active')
        .order('knesset_number', { ascending: false })

      if (cancelled) {
        return
      }

      if (queryError) {
        setError(queryError.message)
        setKnessets([])
        setLoading(false)
        return
      }

      setKnessets(((data ?? []) as KnessetRow[]).map(normalizeKnesset))
      setLoading(false)
    }

    void fetchKnessets()

    return () => {
      cancelled = true
    }
  }, [])

  return { knessets, loading, error }
}

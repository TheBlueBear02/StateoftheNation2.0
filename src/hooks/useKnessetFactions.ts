import { useEffect, useState } from 'react'
import { supabase, supabaseConfigError } from '../lib/supabase'

type KnessetFactionRow = {
  id: number
  knesset_faction_id: number | null
  name: string | null
  short_name: string | null
  color: string | null
  logo_url: string | null
  is_coalition: boolean | null
  start_date: string | null
  end_date: string | null
  is_current: boolean | null
}

export type KnessetFactionOption = {
  id: number
  knessetFactionId: number | null
  name: string | null
  shortName: string | null
  color: string | null
  logoUrl: string | null
  isCoalition: boolean | null
  startDate: string | null
  endDate: string | null
  isCurrent: boolean
}

export type UseKnessetFactionsResult = {
  factions: KnessetFactionOption[]
  loading: boolean
  error: string | null
  refetch: () => Promise<void>
}

function normalizeFaction(row: KnessetFactionRow): KnessetFactionOption {
  return {
    id: row.id,
    knessetFactionId: row.knesset_faction_id,
    name: row.name,
    shortName: row.short_name,
    color: row.color,
    logoUrl: row.logo_url,
    isCoalition: row.is_coalition,
    startDate: row.start_date,
    endDate: row.end_date,
    isCurrent: row.is_current ?? false,
  }
}

export function useKnessetFactions(knessetId: number | null): UseKnessetFactionsResult {
  const [factions, setFactions] = useState<KnessetFactionOption[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      if (!knessetId) {
        setFactions([])
        setLoading(false)
        setError(null)
        return
      }

      setLoading(true)
      setError(null)

      if (supabaseConfigError || !supabase) {
        if (!cancelled) {
          setError(supabaseConfigError ?? 'Supabase client is not configured')
          setFactions([])
          setLoading(false)
        }
        return
      }

      const { data, error: queryError } = await supabase
        .from('knesset_factions')
        .select(
          'id, knesset_faction_id, name, short_name, color, logo_url, is_coalition, start_date, end_date, is_current',
        )
        .eq('knesset_id', knessetId)
        .order('name', { ascending: true })

      if (cancelled) {
        return
      }

      if (queryError) {
        setError(queryError.message)
        setFactions([])
        setLoading(false)
        return
      }

      setFactions(((data ?? []) as KnessetFactionRow[]).map(normalizeFaction))
      setLoading(false)
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [knessetId])

  async function refetch() {
    if (!knessetId) {
      setFactions([])
      return
    }

    setLoading(true)
    setError(null)

    if (supabaseConfigError || !supabase) {
      setError(supabaseConfigError ?? 'Supabase client is not configured')
      setFactions([])
      setLoading(false)
      return
    }

    const { data, error: queryError } = await supabase
      .from('knesset_factions')
      .select(
        'id, knesset_faction_id, name, short_name, color, logo_url, is_coalition, start_date, end_date, is_current',
      )
      .eq('knesset_id', knessetId)
      .order('name', { ascending: true })

    if (queryError) {
      setError(queryError.message)
      setFactions([])
      setLoading(false)
      return
    }

    setFactions(((data ?? []) as KnessetFactionRow[]).map(normalizeFaction))
    setLoading(false)
  }

  return {
    factions,
    loading,
    error,
    refetch,
  }
}

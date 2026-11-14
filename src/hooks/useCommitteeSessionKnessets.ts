import { useEffect, useState } from 'react'
import {
  committeeKnessetsFromSessionRows,
  type CommitteeKnessetOption,
  type SessionKnessetRow,
} from '../lib/committeeKnessetOptions'
import { supabase, supabaseConfigError } from '../lib/supabase'

export type UseCommitteeSessionKnessetsResult = {
  options: CommitteeKnessetOption[]
  loading: boolean
  error: string | null
}

/** Knessets that have at least one committee session, newest first. */
export function useCommitteeSessionKnessets(): UseCommitteeSessionKnessetsResult {
  const [options, setOptions] = useState<CommitteeKnessetOption[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function fetchOptions() {
      setLoading(true)
      setError(null)

      if (supabaseConfigError || !supabase) {
        setError(supabaseConfigError ?? 'Supabase client is not configured')
        setOptions([])
        setLoading(false)
        return
      }

      try {
        const rows: SessionKnessetRow[] = []
        const pageSize = 1000
        let offset = 0
        while (true) {
          const { data, error: queryError } = await supabase
            .from('knesset_committee_sessions')
            .select(
              'committee:knesset_committees!inner(knesset:knessets!inner(id, knesset_number, knesset_name, is_active))',
            )
            .order('id', { ascending: true })
            .range(offset, offset + pageSize - 1)

          if (queryError) {
            throw new Error(queryError.message)
          }

          const page = (data ?? []) as SessionKnessetRow[]
          rows.push(...page)
          if (page.length < pageSize) {
            break
          }
          offset += pageSize
        }

        if (cancelled) {
          return
        }

        setOptions(committeeKnessetsFromSessionRows(rows))
        setLoading(false)
      } catch (err) {
        if (cancelled) {
          return
        }
        setError(
          err instanceof Error ? err.message : 'שגיאה בטעינת כנסות עם ישיבות',
        )
        setOptions([])
        setLoading(false)
      }
    }

    void fetchOptions()

    return () => {
      cancelled = true
    }
  }, [])

  return { options, loading, error }
}

import { useEffect, useState } from 'react'
import {
  COMMITTEES_KNESSET_NUMBER,
  type KnessetCommittee,
  type KnessetCommitteeRow,
} from '../lib/committeeTypes'
import { supabase, supabaseConfigError } from '../lib/supabase'

export type UseKnessetCommitteesResult = {
  committees: KnessetCommittee[]
  loading: boolean
  error: string | null
}

function normalizeCommittee(row: KnessetCommitteeRow): KnessetCommittee {
  return {
    id: row.id,
    knessetCommitteeId: row.knesset_committee_id,
    knessetId: row.knesset_id,
    name: row.name,
    committeeTypeId: row.committee_type_id,
    committeeTypeDesc: row.committee_type_desc,
    isCurrent: row.is_current,
  }
}

function sortCommittees(a: KnessetCommittee, b: KnessetCommittee): number {
  if (a.isCurrent !== b.isCurrent) {
    return a.isCurrent ? -1 : 1
  }
  const aMain = a.committeeTypeDesc?.includes('ראשית') ? 0 : 1
  const bMain = b.committeeTypeDesc?.includes('ראשית') ? 0 : 1
  if (aMain !== bMain) {
    return aMain - bMain
  }
  return a.name.localeCompare(b.name, 'he')
}

function unwrapRelation<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) {
    return value[0] ?? null
  }
  return value ?? null
}

type ReadyTranscriptRow = {
  session:
    | { committee_id: number }
    | { committee_id: number }[]
    | null
}

/** Committee ids that have at least one ready session transcript. */
async function fetchCommitteeIdsWithReadyTranscripts(): Promise<Set<number>> {
  const ids = new Set<number>()
  if (!supabase) {
    return ids
  }

  const pageSize = 1000
  let offset = 0
  while (true) {
    const { data, error } = await supabase
      .from('knesset_committee_session_transcripts')
      .select('session:knesset_committee_sessions!inner(committee_id)')
      .eq('parse_status', 'ready')
      .range(offset, offset + pageSize - 1)

    if (error) {
      throw error
    }

    const rows = (data ?? []) as ReadyTranscriptRow[]
    for (const row of rows) {
      const session = unwrapRelation(row.session)
      if (session?.committee_id != null) {
        ids.add(session.committee_id)
      }
    }

    if (rows.length < pageSize) {
      break
    }
    offset += pageSize
  }

  return ids
}

export function useKnessetCommittees(): UseKnessetCommitteesResult {
  const [committees, setCommittees] = useState<KnessetCommittee[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function fetchCommittees() {
      setLoading(true)
      setError(null)

      if (supabaseConfigError || !supabase) {
        setError(supabaseConfigError ?? 'Supabase client is not configured')
        setCommittees([])
        setLoading(false)
        return
      }

      try {
        const { data: knessetRow, error: knessetError } = await supabase
          .from('knessets')
          .select('id')
          .eq('knesset_number', COMMITTEES_KNESSET_NUMBER)
          .maybeSingle()

        if (cancelled) {
          return
        }

        if (knessetError) {
          setError(knessetError.message)
          setCommittees([])
          setLoading(false)
          return
        }

        if (!knessetRow?.id) {
          setError(`לא נמצאה כנסת מספר ${COMMITTEES_KNESSET_NUMBER}`)
          setCommittees([])
          setLoading(false)
          return
        }

        const [{ data, error: queryError }, withTranscriptIds] =
          await Promise.all([
            supabase
              .from('knesset_committees')
              .select(
                'id, knesset_committee_id, knesset_id, name, committee_type_id, committee_type_desc, is_current',
              )
              .eq('knesset_id', knessetRow.id),
            fetchCommitteeIdsWithReadyTranscripts(),
          ])

        if (cancelled) {
          return
        }

        if (queryError) {
          setError(queryError.message)
          setCommittees([])
          setLoading(false)
          return
        }

        const normalized = ((data ?? []) as KnessetCommitteeRow[])
          .map(normalizeCommittee)
          .filter((committee) => withTranscriptIds.has(committee.id))
          .sort(sortCommittees)

        setCommittees(normalized)
        setLoading(false)
      } catch (err) {
        if (cancelled) {
          return
        }
        setError(err instanceof Error ? err.message : 'שגיאה בטעינת ועדות')
        setCommittees([])
        setLoading(false)
      }
    }

    void fetchCommittees()

    return () => {
      cancelled = true
    }
  }, [])

  return { committees, loading, error }
}

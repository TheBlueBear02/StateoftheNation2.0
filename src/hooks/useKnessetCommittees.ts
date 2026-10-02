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

type CommitteeSessionStats = {
  sessionCount: number
  latestSessionAt: string | null
}

type CommitteeChairInfo = {
  name: string
  imageUrl: string | null
}

function normalizeCommittee(
  row: KnessetCommitteeRow,
  stats: CommitteeSessionStats | undefined,
  chair: CommitteeChairInfo | null,
): KnessetCommittee {
  return {
    id: row.id,
    knessetCommitteeId: row.knesset_committee_id,
    knessetId: row.knesset_id,
    name: row.name,
    committeeTypeId: row.committee_type_id,
    committeeTypeDesc: row.committee_type_desc,
    isCurrent: row.is_current,
    sessionCount: stats?.sessionCount ?? 0,
    latestSessionAt: stats?.latestSessionAt ?? null,
    chairName: chair?.name ?? null,
    chairImageUrl: chair?.imageUrl ?? null,
  }
}

function sortCommittees(a: KnessetCommittee, b: KnessetCommittee): number {
  const aTs = a.latestSessionAt ? Date.parse(a.latestSessionAt) : 0
  const bTs = b.latestSessionAt ? Date.parse(b.latestSessionAt) : 0
  if (aTs !== bTs) {
    return bTs - aTs
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
    | { id: number; committee_id: number; start_at: string | null }
    | { id: number; committee_id: number; start_at: string | null }[]
    | null
}

/** Per-committee ready-transcript session counts + latest start_at. */
async function fetchReadyTranscriptStatsByCommittee(): Promise<
  Map<number, CommitteeSessionStats>
> {
  const byCommittee = new Map<number, CommitteeSessionStats>()
  const seenSessions = new Set<number>()
  if (!supabase) {
    return byCommittee
  }

  const pageSize = 1000
  let offset = 0
  while (true) {
    const { data, error } = await supabase
      .from('knesset_committee_session_transcripts')
      .select(
        'session:knesset_committee_sessions!inner(id, committee_id, start_at)',
      )
      .eq('parse_status', 'ready')
      .range(offset, offset + pageSize - 1)

    if (error) {
      throw error
    }

    const rows = (data ?? []) as ReadyTranscriptRow[]
    for (const row of rows) {
      const session = unwrapRelation(row.session)
      if (session?.committee_id == null || session.id == null) {
        continue
      }
      if (seenSessions.has(session.id)) {
        continue
      }
      seenSessions.add(session.id)

      const current = byCommittee.get(session.committee_id) ?? {
        sessionCount: 0,
        latestSessionAt: null,
      }
      current.sessionCount += 1
      if (
        session.start_at &&
        (!current.latestSessionAt ||
          session.start_at > current.latestSessionAt)
      ) {
        current.latestSessionAt = session.start_at
      }
      byCommittee.set(session.committee_id, current)
    }

    if (rows.length < pageSize) {
      break
    }
    offset += pageSize
  }

  return byCommittee
}

type ChairMembershipRow = {
  committee_id: number
  start_date: string | null
  end_date: string | null
  person:
    | { full_name: string; image_url: string | null }
    | { full_name: string; image_url: string | null }[]
    | null
}

async function fetchChairsByCommitteeIds(
  committeeIds: number[],
): Promise<Map<number, CommitteeChairInfo>> {
  const chairs = new Map<number, CommitteeChairInfo>()
  if (!supabase || committeeIds.length === 0) {
    return chairs
  }

  type Candidate = CommitteeChairInfo & {
    startDate: string | null
    endDate: string | null
  }
  const candidates = new Map<number, Candidate>()

  const chunkSize = 200
  for (let i = 0; i < committeeIds.length; i += chunkSize) {
    const chunk = committeeIds.slice(i, i + chunkSize)
    const { data, error } = await supabase
      .from('knesset_committee_memberships')
      .select(
        'committee_id, start_date, end_date, person:people(full_name, image_url)',
      )
      .eq('seat_role', 'chair')
      .in('committee_id', chunk)

    if (error) {
      throw error
    }

    for (const row of (data ?? []) as ChairMembershipRow[]) {
      const person = unwrapRelation(row.person)
      const name = person?.full_name?.trim()
      if (!name) {
        continue
      }

      const next: Candidate = {
        name,
        imageUrl: person?.image_url ?? null,
        startDate: row.start_date,
        endDate: row.end_date,
      }
      const prev = candidates.get(row.committee_id)
      if (!prev) {
        candidates.set(row.committee_id, next)
        continue
      }

      // Prefer open-ended (current) chair, else the latest start_date.
      const prevOpen = prev.endDate == null
      const nextOpen = next.endDate == null
      if (nextOpen !== prevOpen) {
        if (nextOpen) {
          candidates.set(row.committee_id, next)
        }
        continue
      }
      if ((next.startDate ?? '') > (prev.startDate ?? '')) {
        candidates.set(row.committee_id, next)
      }
    }
  }

  for (const [committeeId, candidate] of candidates) {
    chairs.set(committeeId, {
      name: candidate.name,
      imageUrl: candidate.imageUrl,
    })
  }
  return chairs
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

        const [{ data, error: queryError }, statsByCommittee] =
          await Promise.all([
            supabase
              .from('knesset_committees')
              .select(
                'id, knesset_committee_id, knesset_id, name, committee_type_id, committee_type_desc, is_current',
              )
              .eq('knesset_id', knessetRow.id),
            fetchReadyTranscriptStatsByCommittee(),
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

        const filteredIds = ((data ?? []) as KnessetCommitteeRow[])
          .map((row) => row.id)
          .filter((id) => statsByCommittee.has(id))

        const chairsByCommittee = await fetchChairsByCommitteeIds(filteredIds)

        if (cancelled) {
          return
        }

        const normalized = ((data ?? []) as KnessetCommitteeRow[])
          .filter((row) => statsByCommittee.has(row.id))
          .map((row) =>
            normalizeCommittee(
              row,
              statsByCommittee.get(row.id),
              chairsByCommittee.get(row.id) ?? null,
            ),
          )
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

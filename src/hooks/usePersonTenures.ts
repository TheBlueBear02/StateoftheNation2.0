import { useEffect, useMemo, useState } from 'react'
import {
  supabase,
  supabaseConfigError,
  type KnessetMembershipTenureRow,
} from '../lib/supabase'
import {
  computeMemberTenureStats,
  type MemberTenureStats,
} from '../lib/knessetTenure'

export type UsePersonTenuresResult = {
  tenureByPersonId: Map<number, MemberTenureStats>
  loading: boolean
  error: string | null
}

function unwrapRelation<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) {
    return value[0] ?? null
  }
  return value ?? null
}

function buildTenureMap(
  tenureRows: KnessetMembershipTenureRow[],
): Map<number, MemberTenureStats> {
  const membershipsByPerson = new Map<number, KnessetMembershipTenureRow[]>()
  const currentKnessetByPerson = new Map<number, number | null>()

  for (const row of tenureRows) {
    const existing = membershipsByPerson.get(row.person_id) ?? []
    existing.push(row)
    membershipsByPerson.set(row.person_id, existing)

    const knessetNumber = unwrapRelation(row.knesset)?.knesset_number ?? null
    const prev = currentKnessetByPerson.get(row.person_id) ?? null
    if (
      knessetNumber != null &&
      (prev == null || knessetNumber > prev)
    ) {
      currentKnessetByPerson.set(row.person_id, knessetNumber)
    }
  }

  const tenureMap = new Map<number, MemberTenureStats>()
  for (const [personId, memberships] of membershipsByPerson) {
    tenureMap.set(
      personId,
      computeMemberTenureStats(
        memberships.map((membership) => ({
          startDate: membership.start_date ?? '',
          endDate: membership.end_date,
        })),
        currentKnessetByPerson.get(personId) ?? null,
      ),
    )
  }
  return tenureMap
}

/** Tenure stats (days / years in Knesset) for a set of people. */
export function usePersonTenures(
  personIds: number[],
): UsePersonTenuresResult {
  const [tenureByPersonId, setTenureByPersonId] = useState<
    Map<number, MemberTenureStats>
  >(() => new Map())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const idsKey = useMemo(() => {
    const unique = [...new Set(personIds.filter((id) => Number.isFinite(id)))]
    unique.sort((a, b) => a - b)
    return unique.join(',')
  }, [personIds])

  useEffect(() => {
    let cancelled = false

    async function fetchTenures() {
      const ids = idsKey
        ? idsKey.split(',').map((value) => Number(value))
        : []

      if (ids.length === 0) {
        setTenureByPersonId(new Map())
        setLoading(false)
        setError(null)
        return
      }

      setLoading(true)
      setError(null)

      if (supabaseConfigError || !supabase) {
        setError(supabaseConfigError ?? 'Supabase client is not configured')
        setTenureByPersonId(new Map())
        setLoading(false)
        return
      }

      try {
        const allRows: KnessetMembershipTenureRow[] = []
        const chunkSize = 150
        for (let i = 0; i < ids.length; i += chunkSize) {
          const chunk = ids.slice(i, i + chunkSize)
          const { data, error: queryError } = await supabase
            .from('knesset_memberships')
            .select(
              'person_id, start_date, end_date, knesset:knessets(knesset_number)',
            )
            .in('person_id', chunk)

          if (cancelled) {
            return
          }
          if (queryError) {
            throw queryError
          }
          allRows.push(
            ...((data ?? []) as unknown as KnessetMembershipTenureRow[]),
          )
        }

        if (cancelled) {
          return
        }

        setTenureByPersonId(buildTenureMap(allRows))
        setLoading(false)
      } catch (err) {
        if (cancelled) {
          return
        }
        setError(err instanceof Error ? err.message : 'שגיאה בטעינת ותק')
        setTenureByPersonId(new Map())
        setLoading(false)
      }
    }

    void fetchTenures()

    return () => {
      cancelled = true
    }
  }, [idsKey])

  return { tenureByPersonId, loading, error }
}

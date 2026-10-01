import { useEffect, useMemo, useState } from 'react'
import { supabase, supabaseConfigError } from '../lib/supabase'

export type UsePersonFactionsResult = {
  factionByPersonId: Map<number, string>
  loading: boolean
  error: string | null
}

function unwrapRelation<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) {
    return value[0] ?? null
  }
  return value ?? null
}

function toDateOnly(iso: string | null | undefined): string | null {
  if (!iso) {
    return null
  }
  return iso.slice(0, 10)
}

type MembershipFactionRow = {
  person_id: number
  start_date: string | null
  end_date: string | null
  faction:
    | { name: string; short_name: string | null }
    | { name: string; short_name: string | null }[]
    | null
  knesset:
    | { knesset_number: number }
    | { knesset_number: number }[]
    | null
}

function isActiveOnDate(
  startDate: string | null,
  endDate: string | null,
  refDate: string,
): boolean {
  if (startDate && startDate > refDate) {
    return false
  }
  if (endDate && endDate < refDate) {
    return false
  }
  return true
}

/**
 * Resolve each person's faction display name (short_name preferred) as of a
 * session date, preferring Knesset 25 memberships.
 */
export function usePersonFactions(
  personIds: number[],
  asOf: string | null,
): UsePersonFactionsResult {
  const [factionByPersonId, setFactionByPersonId] = useState<Map<number, string>>(
    () => new Map(),
  )
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const idsKey = useMemo(() => {
    const unique = [...new Set(personIds.filter((id) => Number.isFinite(id)))]
    unique.sort((a, b) => a - b)
    return unique.join(',')
  }, [personIds])

  useEffect(() => {
    let cancelled = false

    async function fetchFactions() {
      const ids = idsKey
        ? idsKey.split(',').map((value) => Number(value))
        : []

      if (ids.length === 0) {
        setFactionByPersonId(new Map())
        setLoading(false)
        setError(null)
        return
      }

      setLoading(true)
      setError(null)

      if (supabaseConfigError || !supabase) {
        setError(supabaseConfigError ?? 'Supabase client is not configured')
        setFactionByPersonId(new Map())
        setLoading(false)
        return
      }

      const refDate = toDateOnly(asOf) ?? new Date().toISOString().slice(0, 10)
      const next = new Map<number, { name: string; start: string; knesset: number }>()

      const chunkSize = 150
      try {
        for (let i = 0; i < ids.length; i += chunkSize) {
          const chunk = ids.slice(i, i + chunkSize)
          const { data, error: queryError } = await supabase
            .from('knesset_memberships')
            .select(
              'person_id, start_date, end_date, faction:knesset_factions(name, short_name), knesset:knessets(knesset_number)',
            )
            .in('person_id', chunk)

          if (cancelled) {
            return
          }

          if (queryError) {
            throw queryError
          }

          for (const row of (data ?? []) as MembershipFactionRow[]) {
            if (!isActiveOnDate(row.start_date, row.end_date, refDate)) {
              continue
            }
            const faction = unwrapRelation(row.faction)
            const knesset = unwrapRelation(row.knesset)
            const label =
              faction?.short_name?.trim() || faction?.name?.trim() || ''
            if (!label) {
              continue
            }
            const knessetNumber = knesset?.knesset_number ?? 0
            const start = row.start_date ?? ''
            const existing = next.get(row.person_id)
            if (!existing) {
              next.set(row.person_id, {
                name: label,
                start,
                knesset: knessetNumber,
              })
              continue
            }
            // Prefer Knesset 25, else newer membership start.
            const preferNext =
              (knessetNumber === 25 && existing.knesset !== 25) ||
              (knessetNumber === existing.knesset && start > existing.start) ||
              (existing.knesset !== 25 &&
                knessetNumber !== 25 &&
                start > existing.start)
            if (preferNext) {
              next.set(row.person_id, {
                name: label,
                start,
                knesset: knessetNumber,
              })
            }
          }
        }

        if (cancelled) {
          return
        }

        const map = new Map<number, string>()
        for (const [personId, value] of next) {
          map.set(personId, value.name)
        }
        setFactionByPersonId(map)
        setLoading(false)
      } catch (err) {
        if (cancelled) {
          return
        }
        setError(err instanceof Error ? err.message : 'שגיאה בטעינת סיעות')
        setFactionByPersonId(new Map())
        setLoading(false)
      }
    }

    void fetchFactions()

    return () => {
      cancelled = true
    }
  }, [idsKey, asOf])

  return { factionByPersonId, loading, error }
}

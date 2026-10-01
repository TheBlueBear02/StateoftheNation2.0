import { useEffect, useState } from 'react'
import {
  type CommitteeMember,
  type CommitteeMembershipRow,
  type CommitteeSeatRole,
} from '../lib/committeeTypes'
import { supabase, supabaseConfigError } from '../lib/supabase'

export type UseCommitteeMembershipsResult = {
  members: CommitteeMember[]
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

function normalizeMember(row: CommitteeMembershipRow): CommitteeMember | null {
  const person = unwrapRelation(row.person)
  if (!person?.full_name) {
    return null
  }
  const seatRole = (row.seat_role ?? 'member') as CommitteeSeatRole
  return {
    id: row.id,
    committeeId: row.committee_id,
    personId: row.person_id,
    fullName: person.full_name,
    imageUrl: person.image_url,
    factionName: null,
    seatRole,
    roleDesc: row.role_desc,
    startDate: row.start_date,
    endDate: row.end_date,
  }
}

export function useCommitteeMemberships(
  committeeId: number | null,
  sessionStartAt: string | null,
): UseCommitteeMembershipsResult {
  const [members, setMembers] = useState<CommitteeMember[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function fetchMemberships() {
      if (committeeId == null) {
        setMembers([])
        setLoading(false)
        setError(null)
        return
      }

      setLoading(true)
      setError(null)

      if (supabaseConfigError || !supabase) {
        setError(supabaseConfigError ?? 'Supabase client is not configured')
        setMembers([])
        setLoading(false)
        return
      }

      const { data, error: queryError } = await supabase
        .from('knesset_committee_memberships')
        .select(
          'id, committee_id, person_id, seat_role, role_desc, start_date, end_date, person:people(full_name, image_url)',
        )
        .eq('committee_id', committeeId)

      if (cancelled) {
        return
      }

      if (queryError) {
        setError(queryError.message)
        setMembers([])
        setLoading(false)
        return
      }

      const refDate =
        toDateOnly(sessionStartAt) ??
        new Date().toISOString().slice(0, 10)

      const byPerson = new Map<number, CommitteeMember>()
      for (const row of (data ?? []) as CommitteeMembershipRow[]) {
        if (!isActiveOnDate(row.start_date, row.end_date, refDate)) {
          continue
        }
        const member = normalizeMember(row)
        if (!member) {
          continue
        }
        const existing = byPerson.get(member.personId)
        if (!existing) {
          byPerson.set(member.personId, member)
          continue
        }
        // Prefer chair over other roles; else newer start_date
        if (
          member.seatRole === 'chair' &&
          existing.seatRole !== 'chair'
        ) {
          byPerson.set(member.personId, member)
          continue
        }
        const existingStart = existing.startDate ?? ''
        const nextStart = member.startDate ?? ''
        if (nextStart > existingStart) {
          byPerson.set(member.personId, member)
        }
      }

      const seatRank: Record<CommitteeSeatRole, number> = {
        chair: 0,
        member: 1,
        alternate: 2,
        observer: 3,
      }
      const list = [...byPerson.values()].sort((a, b) => {
        const rank = seatRank[a.seatRole] - seatRank[b.seatRole]
        if (rank !== 0) {
          return rank
        }
        return a.fullName.localeCompare(b.fullName, 'he')
      })

      setMembers(list)
      setLoading(false)
    }

    void fetchMemberships()

    return () => {
      cancelled = true
    }
  }, [committeeId, sessionStartAt])

  return { members, loading, error }
}

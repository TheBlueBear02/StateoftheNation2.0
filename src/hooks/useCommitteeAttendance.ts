import { useEffect, useMemo, useState } from 'react'
import { supabase, supabaseConfigError } from '../lib/supabase'

export type CommitteeAttendee = {
  personId: number
  fullName: string
  imageUrl: string | null
  attended: boolean
}

export type UseCommitteeAttendanceResult = {
  attendees: CommitteeAttendee[]
  attendeePersonIds: Set<number>
  /** True when at least one attendance row exists for this session. */
  hasAttendanceData: boolean
  loading: boolean
  error: string | null
}

function unwrapRelation<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) {
    return value[0] ?? null
  }
  return value ?? null
}

type AttendanceRow = {
  person_id: number
  attended: boolean | null
  person:
    | { full_name: string; image_url: string | null }
    | { full_name: string; image_url: string | null }[]
    | null
}

export function useCommitteeAttendance(
  sessionId: number | null,
): UseCommitteeAttendanceResult {
  const [attendees, setAttendees] = useState<CommitteeAttendee[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function fetchAttendance() {
      if (sessionId == null) {
        setAttendees([])
        setLoading(false)
        setError(null)
        return
      }

      setLoading(true)
      setError(null)

      if (supabaseConfigError || !supabase) {
        setError(supabaseConfigError ?? 'Supabase client is not configured')
        setAttendees([])
        setLoading(false)
        return
      }

      const { data, error: queryError } = await supabase
        .from('knesset_committee_session_attendance')
        .select(
          'person_id, attended, person:people(full_name, image_url)',
        )
        .eq('session_id', sessionId)
        .or('attended.is.null,attended.eq.true')

      if (cancelled) {
        return
      }

      if (queryError) {
        setError(queryError.message)
        setAttendees([])
        setLoading(false)
        return
      }

      const list: CommitteeAttendee[] = []
      for (const row of (data ?? []) as AttendanceRow[]) {
        const person = unwrapRelation(row.person)
        if (!person?.full_name) {
          continue
        }
        list.push({
          personId: row.person_id,
          fullName: person.full_name,
          imageUrl: person.image_url,
          attended: row.attended !== false,
        })
      }

      list.sort((a, b) => a.fullName.localeCompare(b.fullName, 'he'))
      setAttendees(list)
      setLoading(false)
    }

    void fetchAttendance()

    return () => {
      cancelled = true
    }
  }, [sessionId])

  const attendeePersonIds = useMemo(
    () => new Set(attendees.map((a) => a.personId)),
    [attendees],
  )

  return {
    attendees,
    attendeePersonIds,
    hasAttendanceData: attendees.length > 0,
    loading,
    error,
  }
}

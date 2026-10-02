import { useEffect, useState } from 'react'
import {
  type CommitteeSession,
  type CommitteeSessionRow,
} from '../lib/committeeTypes'
import { supabase, supabaseConfigError } from '../lib/supabase'

export type UseCommitteeSessionsResult = {
  sessions: CommitteeSession[]
  loading: boolean
  error: string | null
}

function normalizeSession(
  row: CommitteeSessionRow,
  hasTranscript: boolean,
  agenda: string | null,
  messageCount: number | null,
): CommitteeSession {
  return {
    id: row.id,
    knessetSessionId: row.knesset_session_id,
    committeeId: row.committee_id,
    sessionNumber: row.session_number,
    sessionTypeDesc: row.session_type_desc,
    statusDesc: row.status_desc,
    location: row.location,
    startAt: row.start_at,
    finishAt: row.finish_at,
    hasTranscript,
    agenda,
    messageCount,
  }
}

export function formatCommitteeSessionLabel(session: CommitteeSession): string {
  const datePart = session.startAt
    ? new Intl.DateTimeFormat('he-IL', {
        weekday: 'short',
        day: 'numeric',
        month: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }).format(new Date(session.startAt))
    : 'ללא תאריך'

  const num =
    session.sessionNumber != null ? `ישיבה ${session.sessionNumber} · ` : ''
  const badge = session.hasTranscript ? '' : ' · ללא תמליל'
  return `${num}${datePart}${badge}`
}

export function formatCommitteeDateTime(iso: string | null | undefined): string {
  if (!iso) {
    return 'ללא תאריך'
  }
  const date = new Date(iso)
  // Order is day · time · date; rendered RTL so day is on the right.
  const dayPart = new Intl.DateTimeFormat('he-IL', {
    weekday: 'short',
  }).format(date)
  const timePart = new Intl.DateTimeFormat('he-IL', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
  const datePart = new Intl.DateTimeFormat('he-IL', {
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
  }).format(date)
  return `${dayPart} · ${timePart} · ${datePart}`
}

export function formatCommitteeDateOnly(iso: string | null | undefined): string {
  if (!iso) {
    return 'ללא תאריך'
  }
  return new Intl.DateTimeFormat('he-IL', {
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
  }).format(new Date(iso))
}

export function formatCommitteeSessionWhen(session: CommitteeSession): string {
  return formatCommitteeDateTime(session.startAt)
}

function compactAgenda(body: string): string {
  return body
    .replace(/\s+/g, ' ')
    .replace(/^סדר היום\s*:?\s*/u, '')
    .replace(/^סדר-היום\s*:?\s*/u, '')
    .replace(/^סדר\s*:?\s*/u, '')
    .trim()
}

async function fetchReadySessionIds(
  sessionIds: number[],
): Promise<Set<number>> {
  const ready = new Set<number>()
  if (!supabase || sessionIds.length === 0) {
    return ready
  }

  const chunkSize = 200
  for (let i = 0; i < sessionIds.length; i += chunkSize) {
    const chunk = sessionIds.slice(i, i + chunkSize)
    const { data, error } = await supabase
      .from('knesset_committee_session_transcripts')
      .select('session_id')
      .eq('parse_status', 'ready')
      .in('session_id', chunk)

    if (error) {
      throw error
    }
    for (const row of data ?? []) {
      ready.add(row.session_id as number)
    }
  }
  return ready
}

/** Exact transcript-part counts per session (chat message totals). */
async function fetchMessageCountsBySessionIds(
  sessionIds: number[],
): Promise<Map<number, number>> {
  const counts = new Map<number, number>()
  if (!supabase || sessionIds.length === 0) {
    return counts
  }

  const concurrency = 12
  for (let i = 0; i < sessionIds.length; i += concurrency) {
    const chunk = sessionIds.slice(i, i + concurrency)
    const results = await Promise.all(
      chunk.map(async (sessionId) => {
        const { count, error } = await supabase!
          .from('knesset_committee_transcript_parts')
          .select('*', { count: 'exact', head: true })
          .eq('session_id', sessionId)
        if (error) {
          throw error
        }
        return [sessionId, count ?? 0] as const
      }),
    )
    for (const [sessionId, count] of results) {
      counts.set(sessionId, count)
    }
  }
  return counts
}

/** First סדר היום body per session, from transcript parts. */
async function fetchAgendaBySessionIds(
  sessionIds: number[],
): Promise<Map<number, string>> {
  const agendas = new Map<number, string>()
  if (!supabase || sessionIds.length === 0) {
    return agendas
  }

  const chunkSize = 200
  for (let i = 0; i < sessionIds.length; i += chunkSize) {
    const chunk = sessionIds.slice(i, i + chunkSize)
    const { data, error } = await supabase
      .from('knesset_committee_transcript_parts')
      .select('session_id, speaker_header, body, ordinal')
      .in('session_id', chunk)
      .or(
        'speaker_header.eq.סדר,speaker_header.eq.סדר היום,speaker_header.like.סדר%',
      )
      .order('ordinal', { ascending: true })

    if (error) {
      throw error
    }

    for (const row of data ?? []) {
      const sessionId = row.session_id as number
      if (agendas.has(sessionId)) {
        continue
      }
      const text = compactAgenda(String(row.body ?? ''))
      if (text) {
        agendas.set(sessionId, text)
      }
    }
  }
  return agendas
}

export function useCommitteeSessions(
  committeeId: number | null,
  withTranscriptOnly: boolean,
): UseCommitteeSessionsResult {
  const [sessions, setSessions] = useState<CommitteeSession[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function fetchSessions() {
      if (committeeId == null) {
        setSessions([])
        setLoading(false)
        setError(null)
        return
      }

      setLoading(true)
      setError(null)

      if (supabaseConfigError || !supabase) {
        setError(supabaseConfigError ?? 'Supabase client is not configured')
        setSessions([])
        setLoading(false)
        return
      }

      try {
        const { data, error: queryError } = await supabase
          .from('knesset_committee_sessions')
          .select(
            'id, knesset_session_id, committee_id, session_number, session_type_desc, status_desc, location, start_at, finish_at',
          )
          .eq('committee_id', committeeId)
          .order('start_at', { ascending: false, nullsFirst: false })

        if (cancelled) {
          return
        }

        if (queryError) {
          setError(queryError.message)
          setSessions([])
          setLoading(false)
          return
        }

        const rows = (data ?? []) as CommitteeSessionRow[]
        const readyIds = await fetchReadySessionIds(rows.map((r) => r.id))

        if (cancelled) {
          return
        }

        let candidateIds = rows
          .filter((row) => !withTranscriptOnly || readyIds.has(row.id))
          .map((row) => row.id)

        const [agendas, messageCounts] = await Promise.all([
          fetchAgendaBySessionIds(candidateIds),
          fetchMessageCountsBySessionIds(candidateIds),
        ])

        if (cancelled) {
          return
        }

        let normalized = rows.map((row) =>
          normalizeSession(
            row,
            readyIds.has(row.id),
            agendas.get(row.id) ?? null,
            messageCounts.has(row.id) ? messageCounts.get(row.id)! : null,
          ),
        )
        if (withTranscriptOnly) {
          normalized = normalized.filter((session) => session.hasTranscript)
        }

        setSessions(normalized)
        setLoading(false)
      } catch (err) {
        if (cancelled) {
          return
        }
        setError(err instanceof Error ? err.message : 'שגיאה בטעינת ישיבות')
        setSessions([])
        setLoading(false)
      }
    }

    void fetchSessions()

    return () => {
      cancelled = true
    }
  }, [committeeId, withTranscriptOnly])

  return { sessions, loading, error }
}

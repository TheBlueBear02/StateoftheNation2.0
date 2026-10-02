import { useEffect, useState } from 'react'
import {
  type CommitteeTranscript,
  type CommitteeTranscriptPart,
  type CommitteeTranscriptPartRow,
} from '../lib/committeeTypes'
import { supabase, supabaseConfigError } from '../lib/supabase'

export type UseCommitteeTranscriptResult = {
  transcript: CommitteeTranscript | null
  loading: boolean
  error: string | null
}

/** PostgREST/Supabase default max rows per response. */
const PARTS_PAGE_SIZE = 1000

function unwrapRelation<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) {
    return value[0] ?? null
  }
  return value ?? null
}

function normalizePart(row: CommitteeTranscriptPartRow): CommitteeTranscriptPart {
  const person = unwrapRelation(row.person)
  return {
    id: row.id,
    transcriptId: row.transcript_id,
    sessionId: row.session_id,
    ordinal: row.ordinal,
    speakerHeader: row.speaker_header,
    personId: row.person_id,
    fullName: person?.full_name ?? null,
    imageUrl: person?.image_url ?? null,
    body: row.body,
  }
}

/**
 * Load every transcript part for a transcript id, paging past the ~1000-row
 * PostgREST cap so long sittings (2000+ turns) are not truncated mid-session.
 */
async function fetchAllTranscriptParts(
  transcriptId: number,
): Promise<{ rows: CommitteeTranscriptPartRow[]; error: string | null }> {
  if (!supabase) {
    return { rows: [], error: 'Supabase client is not configured' }
  }

  const rows: CommitteeTranscriptPartRow[] = []
  let from = 0
  for (;;) {
    const to = from + PARTS_PAGE_SIZE - 1
    const { data, error } = await supabase
      .from('knesset_committee_transcript_parts')
      .select(
        'id, transcript_id, session_id, ordinal, speaker_header, person_id, body, person:people(full_name, image_url)',
      )
      .eq('transcript_id', transcriptId)
      .order('ordinal', { ascending: true })
      .range(from, to)

    if (error) {
      return { rows: [], error: error.message }
    }

    const chunk = (data ?? []) as CommitteeTranscriptPartRow[]
    rows.push(...chunk)
    if (chunk.length < PARTS_PAGE_SIZE) {
      break
    }
    from += PARTS_PAGE_SIZE
  }

  return { rows, error: null }
}

export function useCommitteeTranscript(
  sessionId: number | null,
): UseCommitteeTranscriptResult {
  const [transcript, setTranscript] = useState<CommitteeTranscript | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function fetchTranscript() {
      if (sessionId == null) {
        setTranscript(null)
        setLoading(false)
        setError(null)
        return
      }

      setLoading(true)
      setError(null)

      if (supabaseConfigError || !supabase) {
        setError(supabaseConfigError ?? 'Supabase client is not configured')
        setTranscript(null)
        setLoading(false)
        return
      }

      const { data: header, error: headerError } = await supabase
        .from('knesset_committee_session_transcripts')
        .select('id, session_id, parse_status, full_text')
        .eq('session_id', sessionId)
        .maybeSingle()

      if (cancelled) {
        return
      }

      if (headerError) {
        setError(headerError.message)
        setTranscript(null)
        setLoading(false)
        return
      }

      if (!header) {
        setTranscript(null)
        setLoading(false)
        return
      }

      const { rows: partRows, error: partsError } = await fetchAllTranscriptParts(
        header.id as number,
      )

      if (cancelled) {
        return
      }

      if (partsError) {
        setError(partsError)
        setTranscript(null)
        setLoading(false)
        return
      }

      setTranscript({
        id: header.id as number,
        sessionId: header.session_id as number,
        parseStatus: header.parse_status as string,
        fullText: (header.full_text as string | null) ?? null,
        parts: partRows.map(normalizePart),
      })
      setLoading(false)
    }

    void fetchTranscript()

    return () => {
      cancelled = true
    }
  }, [sessionId])

  return { transcript, loading, error }
}

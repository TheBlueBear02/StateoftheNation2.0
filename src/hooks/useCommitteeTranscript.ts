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

      const { data: partRows, error: partsError } = await supabase
        .from('knesset_committee_transcript_parts')
        .select(
          'id, transcript_id, session_id, ordinal, speaker_header, person_id, body, person:people(full_name, image_url)',
        )
        .eq('transcript_id', header.id)
        .order('ordinal', { ascending: true })

      if (cancelled) {
        return
      }

      if (partsError) {
        setError(partsError.message)
        setTranscript(null)
        setLoading(false)
        return
      }

      setTranscript({
        id: header.id as number,
        sessionId: header.session_id as number,
        parseStatus: header.parse_status as string,
        fullText: (header.full_text as string | null) ?? null,
        parts: ((partRows ?? []) as CommitteeTranscriptPartRow[]).map(
          normalizePart,
        ),
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

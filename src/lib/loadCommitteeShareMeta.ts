import { createServerSupabaseClient } from './supabaseServer'
import { buildCommitteesSharePath } from './committeeShare'

export type CommitteeShareMeta = {
  title: string
  description: string
  path: string
}

const DEFAULT_TITLE = 'ועדות הכנסת'
const DEFAULT_DESCRIPTION =
  'ועדות הכנסת בצאט — תמלולים מלאים, נוכחות חברי הכנסת וסיכומי הישיבות.'

function parsePositiveInt(raw: string | string[] | undefined): number | null {
  const value = Array.isArray(raw) ? raw[0] : raw
  if (!value) {
    return null
  }
  const n = Number(value)
  return Number.isInteger(n) && n > 0 ? n : null
}

function formatShareDate(iso: string | null): string | null {
  if (!iso) {
    return null
  }
  return new Intl.DateTimeFormat('he-IL', {
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
  }).format(new Date(iso))
}

function compactAgenda(body: string | null | undefined): string | null {
  if (!body) {
    return null
  }
  const cleaned = body
    .replace(/\s+/g, ' ')
    .replace(/^סדר היום\s*:?\s*/u, '')
    .replace(/^סדר-היום\s*:?\s*/u, '')
    .replace(/^סדר\s*:?\s*/u, '')
    .trim()
  if (!cleaned) {
    return null
  }
  return cleaned.length > 160 ? `${cleaned.slice(0, 157)}…` : cleaned
}

/** Build Open Graph / page metadata for a committee or session deep link. */
export async function loadCommitteeShareMeta(searchParams: {
  committee?: string | string[]
  session?: string | string[]
  message?: string | string[]
}): Promise<CommitteeShareMeta> {
  const committeeId = parsePositiveInt(searchParams.committee)
  const sessionId = parsePositiveInt(searchParams.session)
  const messageId = parsePositiveInt(searchParams.message)
  const path = buildCommitteesSharePath(committeeId, sessionId, messageId)

  if (committeeId == null) {
    return {
      title: DEFAULT_TITLE,
      description: DEFAULT_DESCRIPTION,
      path,
    }
  }

  const supabase = createServerSupabaseClient()
  if (!supabase) {
    return {
      title: DEFAULT_TITLE,
      description: DEFAULT_DESCRIPTION,
      path,
    }
  }

  const { data: committee } = await supabase
    .from('knesset_committees')
    .select('id, name')
    .eq('id', committeeId)
    .maybeSingle()

  if (!committee) {
    return {
      title: DEFAULT_TITLE,
      description: DEFAULT_DESCRIPTION,
      path: '/knesset/committees',
    }
  }

  const committeeName = (committee.name as string)?.trim() || DEFAULT_TITLE

  if (sessionId == null) {
    return {
      title: committeeName,
      description: `ישיבות ועדת ${committeeName} עם תמלילים מלאים בצאט.`,
      path,
    }
  }

  const { data: session } = await supabase
    .from('knesset_committee_sessions')
    .select('id, committee_id, session_number, start_at')
    .eq('id', sessionId)
    .eq('committee_id', committeeId)
    .maybeSingle()

  if (!session) {
    return {
      title: committeeName,
      description: `ישיבות ועדת ${committeeName} עם תמלילים מלאים בצאט.`,
      path: buildCommitteesSharePath(committeeId, null),
    }
  }

  const sessionNumber =
    session.session_number != null ? Number(session.session_number) : null
  const dateLabel = formatShareDate(
    typeof session.start_at === 'string' ? session.start_at : null,
  )

  const { data: agendaPart } = await supabase
    .from('knesset_committee_transcript_parts')
    .select('body')
    .eq('session_id', sessionId)
    .ilike('speaker_header', 'סדר%')
    .order('ordinal', { ascending: true })
    .limit(1)
    .maybeSingle()

  const agenda = compactAgenda(
    typeof agendaPart?.body === 'string' ? agendaPart.body : null,
  )

  const sessionLabel =
    sessionNumber != null ? `ישיבה ${sessionNumber}` : 'ישיבת ועדה'
  const titleParts = [committeeName, sessionLabel]
  if (dateLabel) {
    titleParts.push(dateLabel)
  }

  return {
    title: titleParts.join(' · '),
    description:
      agenda ||
      `תמליל מלא של ${sessionLabel} ב${committeeName}${
        dateLabel ? ` (${dateLabel})` : ''
      }.`,
    path,
  }
}

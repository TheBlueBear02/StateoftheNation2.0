import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { NextRequest } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabaseServer'
import { getServiceEnv, jsonError, jsonOk } from '@/server/apiCommon'

export const maxDuration = 60

const OPENAI_MODEL = process.env.COMMITTEE_SUMMARY_MODEL?.trim() || 'gpt-4o-mini'
/** Soft cap for the model prompt. Long sessions keep start + end (votes). */
const MAX_TRANSCRIPT_CHARS = 55_000
/** Share of the budget reserved for the end of the sitting (votes live there). */
const TAIL_BUDGET_RATIO = 0.55

const SYSTEM_PROMPT = `אתה מסכם ישיבות ועדות בכנסת ישראל בעברית.

כתוב פסקת סיכום אחת קצרה בלבד (3–6 משפטים) לפי הכללים הבאים:
- התחל בדיוק במילים "בישיבה זו" ואז עבור מיד לנושא / סדר היום ולעיקרי הדיון
- אל תציין תאריך, יום בשבוע, שעה, תאריך עברי, מספר ישיבה או שם הוועדה בפתיחה — אלה כבר ידועים למשתמש
- התמקד בנקודות המהותיות מהדיון (מחלוקות, טענות מרכזיות, החלטות)
- אם היו הצבעות — ציין את נושא ההצבעה ואת התוצאה (בעד / נגד / נמנע / התקבל / נדחה / נדחו רביזיות) כפי שמופיע בתמליל
- אם לא היו הצבעות — אל תמציא; פשוט אל תזכיר הצבעות
- עובדתי בלבד מתוך הנתונים שסופקו, בלי השערות ובלי כותרת
- טון עיתונאי רגוע, בלי אימוג'י ובלי נקודות תבליט
- החזר רק את הפסקה`

type PartRow = {
  ordinal: number
  speaker_header: string | null
  body: string
}

function getAdminClient(): SupabaseClient | null {
  const { SUPABASE_URL, SUPABASE_SERVICE_KEY } = getServiceEnv()
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return null
  }
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
}

function formatPartLine(part: PartRow): string | null {
  const header = (part.speaker_header ?? '').trim() || 'ללא כותרת'
  const body = (part.body ?? '').trim()
  if (!body && header === 'ללא כותרת') {
    return null
  }
  return `${header}:\n${body}`
}

const PARTS_PAGE_SIZE = 1000

async function fetchAllSessionParts(
  client: SupabaseClient,
  sessionId: number,
): Promise<{ rows: PartRow[]; error: string | null }> {
  const rows: PartRow[] = []
  let from = 0
  for (;;) {
    const to = from + PARTS_PAGE_SIZE - 1
    const { data, error } = await client
      .from('knesset_committee_transcript_parts')
      .select('ordinal, speaker_header, body')
      .eq('session_id', sessionId)
      .order('ordinal', { ascending: true })
      .range(from, to)

    if (error) {
      return { rows: [], error: error.message }
    }

    const chunk = (data ?? []) as PartRow[]
    rows.push(...chunk)
    if (chunk.length < PARTS_PAGE_SIZE) {
      break
    }
    from += PARTS_PAGE_SIZE
  }
  return { rows, error: null }
}

/**
 * Prefer full transcript. If over the char budget, keep the opening (agenda /
 * early debate) and the closing (where votes usually sit), drop the middle.
 */
function buildTranscriptText(parts: PartRow[]): string {
  const lines: string[] = []
  for (const part of parts) {
    const line = formatPartLine(part)
    if (line) {
      lines.push(line)
    }
  }
  if (lines.length === 0) {
    return ''
  }

  const full = lines.join('\n\n')
  if (full.length <= MAX_TRANSCRIPT_CHARS) {
    return full
  }

  const separator = '…[אמצע התמליל קוצר — להלן סוף הישיבה]'
  const budget = Math.max(2_000, MAX_TRANSCRIPT_CHARS - separator.length - 4)
  const tailBudget = Math.floor(budget * TAIL_BUDGET_RATIO)
  const headBudget = budget - tailBudget

  let headEnd = 0
  let headLen = 0
  for (let i = 0; i < lines.length; i += 1) {
    const add = lines[i]!.length + (headEnd > 0 ? 2 : 0)
    if (headLen + add > headBudget) {
      break
    }
    headLen += add
    headEnd = i + 1
  }

  let tailStart = lines.length
  let tailLen = 0
  for (let i = lines.length - 1; i >= headEnd; i -= 1) {
    const add = lines[i]!.length + (tailStart < lines.length ? 2 : 0)
    if (tailLen + add > tailBudget) {
      break
    }
    tailLen += add
    tailStart = i
  }

  // Ensure we always keep some ending when the sitting is huge.
  if (tailStart >= lines.length && headEnd < lines.length) {
    tailStart = Math.max(headEnd, lines.length - 1)
  }

  const head = lines.slice(0, headEnd).join('\n\n')
  const tail = lines.slice(tailStart).join('\n\n')
  return [head, separator, tail].filter(Boolean).join('\n\n')
}

async function callOpenAiSummary(userMessage: string): Promise<string> {
  const apiKey = (process.env.OPENAI_API_KEY || '').trim()
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY_MISSING')
  }

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      temperature: 0.3,
      max_tokens: 420,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userMessage },
      ],
    }),
  })

  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new Error(
      `OPENAI_HTTP_${response.status}${detail ? `: ${detail.slice(0, 200)}` : ''}`,
    )
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string | null } }>
  }
  const text = data.choices?.[0]?.message?.content?.trim() ?? ''
  if (!text) {
    throw new Error('EMPTY_SUMMARY')
  }
  return text
}

export async function POST(request: NextRequest) {
  let body: {
    sessionId?: unknown
    committeeName?: unknown
    agenda?: unknown
  }
  try {
    body = await request.json()
  } catch {
    return jsonError('גוף בקשה לא תקין', 400)
  }

  const sessionId =
    typeof body.sessionId === 'number'
      ? body.sessionId
      : typeof body.sessionId === 'string'
        ? Number(body.sessionId)
        : NaN
  if (!Number.isInteger(sessionId) || sessionId < 1) {
    return jsonError('מזהה ישיבה לא תקין', 400)
  }

  const committeeName =
    typeof body.committeeName === 'string' ? body.committeeName.trim() : ''
  const agendaFromClient =
    typeof body.agenda === 'string' ? body.agenda.trim() : ''

  const supabase = createServerSupabaseClient()
  if (!supabase) {
    return jsonError('Supabase אינו מוגדר בשרת', 503)
  }

  const { data: transcript, error: transcriptError } = await supabase
    .from('knesset_committee_session_transcripts')
    .select('id, ai_summary, ai_summary_at')
    .eq('session_id', sessionId)
    .maybeSingle()

  if (transcriptError) {
    return jsonError(transcriptError.message, 500)
  }
  if (!transcript) {
    return jsonError('אין תמליל לישיבה זו', 404)
  }

  const cachedSummary =
    typeof transcript.ai_summary === 'string' ? transcript.ai_summary.trim() : ''
  if (cachedSummary) {
    return jsonOk({
      ok: true,
      summary: cachedSummary,
      cached: true,
      generatedAt: transcript.ai_summary_at ?? null,
    })
  }

  const { rows, error: partsError } = await fetchAllSessionParts(
    supabase,
    sessionId,
  )

  if (partsError) {
    return jsonError(partsError, 500)
  }

  if (rows.length === 0) {
    return jsonError('אין תמליל לישיבה זו', 404)
  }

  let agenda = agendaFromClient
  if (!agenda) {
    const agendaPart = rows.find((part) => {
      const header = (part.speaker_header ?? '').trim()
      return (
        header === 'סדר היום' ||
        header === 'סדר' ||
        header.startsWith('סדר היום') ||
        header.startsWith('סדר-היום')
      )
    })
    agenda = agendaPart?.body?.trim() ?? ''
  }

  const transcriptText = buildTranscriptText(rows)
  const userMessage = [
    committeeName ? `שם הוועדה: ${committeeName}` : null,
    agenda ? `סדר היום:\n${agenda}` : 'סדר היום: לא צוין במפורש',
    '',
    'תמליל הישיבה (חלקי/מקוצר אם ארוך):',
    transcriptText,
  ]
    .filter((line) => line != null)
    .join('\n')

  let summary: string
  try {
    summary = await callOpenAiSummary(userMessage)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (message === 'OPENAI_API_KEY_MISSING') {
      return jsonError('סיכום AI אינו זמין כרגע (חסר מפתח)', 503)
    }
    if (message === 'EMPTY_SUMMARY') {
      return jsonError('לא התקבל סיכום מהמודל', 502)
    }
    return jsonError('שגיאה ביצירת הסיכום', 502)
  }

  const admin = getAdminClient()
  if (!admin) {
    // Still return the summary this request, but it won't persist for next visitors.
    return jsonOk({
      ok: true,
      summary,
      cached: false,
      persisted: false,
    })
  }

  const generatedAt = new Date().toISOString()
  const { error: saveError } = await admin
    .from('knesset_committee_session_transcripts')
    .update({
      ai_summary: summary,
      ai_summary_at: generatedAt,
      ai_summary_model: OPENAI_MODEL,
    })
    .eq('id', transcript.id)

  if (saveError) {
    return jsonOk({
      ok: true,
      summary,
      cached: false,
      persisted: false,
      persistError: saveError.message,
    })
  }

  return jsonOk({
    ok: true,
    summary,
    cached: false,
    persisted: true,
    generatedAt,
  })
}

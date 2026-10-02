import type { CommitteeMember } from './committeeTypes'
import type { CommitteeTranscriptPart } from './committeeTypes'

/** Strip Hebrew/ASCII quotes and collapse whitespace for name compares. */
export function normalizeSpeakerText(value: string): string {
  return value
    .replace(/[\u05F4\u05F3"״׳'`]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

const SPEAKER_PREFIX_RE =
  /^(?:היו"?ר|יו"?ר|מ"?מ היו"?ר|חברת?\s+הכנסת|ח"?כ|השרה?|שרת?|עו"?ד|ד"?ר|פרופ'?|גב'?|מר)\s+/u

const BARE_CHAIR_RE = /^(?:היו"?ר|יו"?ר)$/u

/** Lines that are speech content, not a new speaker attribution. */
const SPEECH_CONTINUATION_HEADER_RE =
  /^(?:ואני|אני|יש לך|יש לי|אתה |את |למה |כי |אם |לא |זה |זו |הוא |היא |אנחנו |אתם |גם |רק |כל |ונ$|יא$)/u

/**
 * Reduce a protocol speaker header to a comparable person name.
 * Returns null for empty / bare role-only headers (e.g. היו"ר alone).
 */
export function speakerHeaderToName(header: string | null | undefined): string | null {
  if (!header) {
    return null
  }
  let text = header.trim()
  if (!text) {
    return null
  }
  text = text.replace(/[:：\-–—].*$/u, '').trim()
  text = text.replace(SPEAKER_PREFIX_RE, '').trim()
  text = normalizeSpeakerText(text)
  if (!text || BARE_CHAIR_RE.test(text)) {
    return null
  }
  return text
}

export function isBareChairHeader(header: string | null | undefined): boolean {
  if (!header) {
    return false
  }
  const stripped = normalizeSpeakerText(
    header.trim().replace(/[:：\-–—].*$/u, ''),
  )
  return BARE_CHAIR_RE.test(stripped)
}

function namesLooselyMatch(a: string, b: string): boolean {
  const left = normalizeSpeakerText(a)
  const right = normalizeSpeakerText(b)
  if (!left || !right) {
    return false
  }
  if (left === right) {
    return true
  }
  // Protocol often drops / adds a middle name.
  if (left.includes(right) || right.includes(left)) {
    return true
  }
  const leftParts = left.split(' ').filter(Boolean)
  const rightParts = right.split(' ').filter(Boolean)
  if (leftParts.length >= 2 && rightParts.length >= 2) {
    const leftFirst = leftParts[0]!
    const leftLast = leftParts[leftParts.length - 1]!
    const rightFirst = rightParts[0]!
    const rightLast = rightParts[rightParts.length - 1]!
    return leftFirst === rightFirst && leftLast === rightLast
  }
  return false
}

function looksLikePersonName(name: string): boolean {
  const parts = name.split(' ').filter(Boolean)
  if (parts.length < 2 || parts.length > 4) {
    return false
  }
  if (parts.some((part) => part.length < 2)) {
    return false
  }
  // Reject obvious sentence fragments that slipped through.
  if (SPEECH_CONTINUATION_HEADER_RE.test(name)) {
    return false
  }
  return /^[\u0590-\u05FF][\u0590-\u05FF'"״׳\-\s]*$/u.test(name)
}

/**
 * True when the protocol header is a real speaker turn (role prefix, seated
 * MK, or a plausible bare person name) — not a sentence that Hasadna split
 * into its own "header" (e.g. "ואני אומר לבנימין נתניהו").
 */
export function isCredibleSpeakerHeader(
  header: string | null | undefined,
  members: CommitteeMember[],
): boolean {
  const raw = (header ?? '').trim()
  if (!raw) {
    return false
  }
  if (isBareChairHeader(raw)) {
    return true
  }
  if (SPEECH_CONTINUATION_HEADER_RE.test(raw)) {
    return false
  }
  // Tiny OCR / split fragments ("ונ", "יא")
  if (raw.length <= 2) {
    return false
  }

  const hasOfficialPrefix = SPEAKER_PREFIX_RE.test(raw)
  const name = speakerHeaderToName(raw)
  if (!name) {
    return hasOfficialPrefix
  }
  if (name.length <= 2) {
    return false
  }
  if (members.some((m) => namesLooselyMatch(m.fullName, name))) {
    return true
  }
  if (hasOfficialPrefix && looksLikePersonName(name)) {
    return true
  }
  // Guest / unidentified speaker: allow only clean multi-word names.
  return !hasOfficialPrefix && looksLikePersonName(name)
}

function isStructuralMetaHeader(header: string | null | undefined): boolean {
  const text = (header ?? '').trim()
  if (!text) {
    return true
  }
  if (
    text === 'נכחו' ||
    text === 'סדר היום' ||
    text.startsWith('סדר היום') ||
    text.startsWith('חברי ') ||
    text.startsWith('חברות ')
  ) {
    return true
  }
  if (
    /^(מוזמנים|מוזמנות|ייעוץ משפטי|מנהל|מנהלת|רישום|קצרנ|יועץ משפטי|סגן מזכיר)/u.test(
      text,
    )
  ) {
    return true
  }
  if (/^[א-ת]\.\s/u.test(text) || /^\d+\.\s/u.test(text)) {
    return true
  }
  return false
}

/**
 * Merge Hasadna false splits: when a "speaker_header" is really the next
 * sentence of the previous speech, fold header+body into the previous part.
 */
export function coalesceTranscriptParts(
  parts: CommitteeTranscriptPart[],
  members: CommitteeMember[],
): CommitteeTranscriptPart[] {
  if (parts.length === 0) {
    return parts
  }

  const result: CommitteeTranscriptPart[] = []
  for (const part of parts) {
    const header = (part.speakerHeader ?? '').trim()
    if (isStructuralMetaHeader(header)) {
      result.push(part)
      continue
    }

    const prev = result[result.length - 1]
    const prevHeader = (prev?.speakerHeader ?? '').trim()
    const prevIsSpeech =
      prev != null && !isStructuralMetaHeader(prevHeader)

    if (prevIsSpeech && !isCredibleSpeakerHeader(header, members)) {
      const continuation = [header, part.body.trim()]
        .filter(Boolean)
        .join('\n')
      result[result.length - 1] = {
        ...prev!,
        body: [prev!.body.trim(), continuation].filter(Boolean).join('\n\n'),
      }
      continue
    }

    result.push(part)
  }
  return result
}

/**
 * Resolve which seated MK a transcript part belongs to.
 * Prefers stored person_id only when that person is on the session roster
 * (members + attendance guests). Global DB name matches for people who
 * were not at the sitting are ignored — they often fire on mentions
 * (e.g. someone saying "נתניהו") or loose ingest matching.
 * Falls back to header name match; maps bare יו״ר headers to the chair.
 */
export function resolvePartPersonId(
  part: CommitteeTranscriptPart,
  members: CommitteeMember[],
): number | null {
  if (part.personId != null) {
    const known = members.find((m) => m.personId === part.personId)
    if (known) {
      return known.personId
    }
    // Ignore person_id for people not on this session's table.
  }

  if (isBareChairHeader(part.speakerHeader)) {
    const chair = members.find((m) => m.seatRole === 'chair')
    return chair?.personId ?? null
  }

  if (!isCredibleSpeakerHeader(part.speakerHeader, members)) {
    return null
  }

  const fromHeader = speakerHeaderToName(part.speakerHeader)
  if (fromHeader) {
    const hit = members.find((m) => namesLooselyMatch(m.fullName, fromHeader))
    if (hit) {
      return hit.personId
    }
  }

  return null
}

export function partBelongsToPerson(
  part: CommitteeTranscriptPart,
  personId: number,
  members: CommitteeMember[],
): boolean {
  return resolvePartPersonId(part, members) === personId
}

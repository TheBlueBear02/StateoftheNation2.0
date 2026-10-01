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

/**
 * Resolve which seated MK a transcript part belongs to.
 * Prefers stored person_id; falls back to header name match; maps bare
 * יו״ר headers to the committee chair.
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
    // Keep DB id even if not seated (rare guest speaker).
    return part.personId
  }

  if (isBareChairHeader(part.speakerHeader)) {
    const chair = members.find((m) => m.seatRole === 'chair')
    return chair?.personId ?? null
  }

  const fromHeader = speakerHeaderToName(part.speakerHeader)
  const fromPerson = part.fullName ? normalizeSpeakerText(part.fullName) : null
  const candidates = [fromHeader, fromPerson].filter(Boolean) as string[]

  for (const candidate of candidates) {
    const hit = members.find((m) => namesLooselyMatch(m.fullName, candidate))
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

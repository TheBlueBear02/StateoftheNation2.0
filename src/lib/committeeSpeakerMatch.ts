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
  /^(?:היו"?ר|יו"?ר|מ"?מ היו"?ר|חברת?\s+הכנסת|ח"?כ|השרה?|שרת?|ה?יועצ[ת]?\s+המשפטי[ת]?|יועמ"?ש|עו"?ד|ד"?ר|פרופ'?|גב'?|מר)\s+/u

const BARE_CHAIR_RE = /^(?:היו"?ר|יו"?ר)$/u

/** Synthetic id when counsel has no people-row match in the transcript. */
export const LEGAL_COUNSEL_FALLBACK_PERSON_ID = -900_001
/** Synthetic id for מנהל/ת הוועדה seat / chat linking. */
export const COMMITTEE_MANAGER_FALLBACK_PERSON_ID = -900_002

const COUNSEL_SECTION_HEADER_RE =
  /^(?:ייעוץ משפטי|יועץ משפטי|יועצת משפטית)(?=\s|$|[:：])/u

const BARE_COUNSEL_RE =
  /^(?:ה?יועצ[ת]?\s*המשפטי[ת]?|יועמ"?ש)$/u

const COUNSEL_ROLE_IN_HEADER_RE =
  /ה?יועצ[ת]?\s*המשפטי[ת]?|יועמ"?ש|ייעוץ\s*משפטי/u

/** מנהל הוועדה / מנהלת הוועדה / מנהל/ת הוועדה */
const MANAGER_SECTION_HEADER_RE =
  /^(?:מנהל(?:ת)?(?:\s*\/\s*ת)?\s+הוו?עדה)(?=\s|$|[:：])/u

const BARE_MANAGER_RE =
  /^(?:מנהל(?:ת)?(?:\s*\/\s*ת)?\s+הוו?עדה)$/u

const MANAGER_ROLE_IN_HEADER_RE =
  /מנהל(?:ת)?(?:\s*\/\s*ת)?\s+הוו?עדה/u

const STAFF_SECTION_SKIP_RE =
  /^(?:ייעוץ משפטי|יועץ משפטי|יועצת משפטית|מנהל(?:ת)?(?:\s*\/\s*ת)?\s+הוו?עדה|מוזמנים|מוזמנות|רישום|קצרנ)/u

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
  if (
    !text ||
    BARE_CHAIR_RE.test(text) ||
    BARE_COUNSEL_RE.test(text) ||
    BARE_MANAGER_RE.test(text)
  ) {
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

export function isBareCounselHeader(header: string | null | undefined): boolean {
  if (!header) {
    return false
  }
  const stripped = normalizeSpeakerText(
    header.trim().replace(/[:：\-–—].*$/u, ''),
  )
  return BARE_COUNSEL_RE.test(stripped)
}

export function isBareManagerHeader(header: string | null | undefined): boolean {
  if (!header) {
    return false
  }
  const stripped = normalizeSpeakerText(
    header.trim().replace(/[:：\-–—].*$/u, ''),
  )
  return BARE_MANAGER_RE.test(stripped)
}

function headerMatchesStaffName(
  header: string,
  staffName: string | null | undefined,
  fallbackLabel: string,
): boolean {
  const normalizedHeader = normalizeSpeakerText(header)
  const name = staffName?.trim() ? normalizeSpeakerText(staffName) : ''
  if (!name || name === normalizeSpeakerText(fallbackLabel)) {
    return false
  }
  if (normalizedHeader.includes(name) || name.includes(normalizedHeader)) {
    return true
  }
  const fromHeader = speakerHeaderToName(header)
  return Boolean(fromHeader && namesLooselyMatch(fromHeader, name))
}

/** True when a speech header belongs to the session's legal counsel. */
export function headerMatchesLegalCounsel(
  header: string | null | undefined,
  counselName: string | null | undefined,
): boolean {
  if (!header?.trim()) {
    return false
  }
  const raw = header.trim()
  // The yellow "ייעוץ משפטי" attendance card is not a speech turn.
  if (/^(?:ייעוץ משפטי|יועץ משפטי|יועצת משפטית)\s*$/u.test(raw)) {
    return false
  }
  if (isBareCounselHeader(raw)) {
    return true
  }
  if (headerMatchesStaffName(raw, counselName, 'יועמ״ש')) {
    return true
  }
  // Role title with an optional name still counts as counsel speech.
  if (COUNSEL_ROLE_IN_HEADER_RE.test(raw) && !COUNSEL_SECTION_HEADER_RE.test(raw)) {
    return true
  }
  return false
}

/** True when a speech header belongs to מנהל/ת הוועדה. */
export function headerMatchesCommitteeManager(
  header: string | null | undefined,
  managerName: string | null | undefined,
): boolean {
  if (!header?.trim()) {
    return false
  }
  const raw = header.trim()
  if (BARE_MANAGER_RE.test(normalizeSpeakerText(raw.replace(/[:：\-–—].*$/u, '')))) {
    return true
  }
  // Exact section label is the yellow card, not a speech.
  if (MANAGER_SECTION_HEADER_RE.test(raw) && /הוו?עדה\s*$/u.test(raw)) {
    return false
  }
  if (headerMatchesStaffName(raw, managerName, 'מנהל/ת')) {
    return true
  }
  if (MANAGER_ROLE_IN_HEADER_RE.test(raw) && !MANAGER_SECTION_HEADER_RE.test(raw)) {
    return true
  }
  return false
}

function firstStaffNameFromBody(body: string): string | null {
  for (const rawLine of body.split(/\n+/u)) {
    let text = rawLine.trim()
    if (!text) {
      continue
    }
    // Drop trailing role notes ("שם – יועמ״ש").
    text = text.replace(/\s*[–—\-].*$/u, '').trim()
    text = text.replace(SPEAKER_PREFIX_RE, '').trim()
    text = normalizeSpeakerText(text)
    if (!text || text.length < 2) {
      continue
    }
    // Skip section leftovers that are not names.
    if (
      STAFF_SECTION_SKIP_RE.test(text) ||
      BARE_COUNSEL_RE.test(text) ||
      BARE_MANAGER_RE.test(text)
    ) {
      continue
    }
    return text
  }
  return null
}

/**
 * Build a seat/chat identity for the session's legal counsel from the
 * "ייעוץ משפטי" protocol block (and matching speech parts for photo/name).
 * Always returns a counsel row so the יועמ״ש circle stays selectable.
 */
export function extractLegalCounselMember(
  parts: CommitteeTranscriptPart[],
  committeeId: number,
): CommitteeMember {
  const section = parts.find((part) => {
    const header = (part.speakerHeader ?? '').trim()
    return COUNSEL_SECTION_HEADER_RE.test(header)
  })

  let fullName = section ? firstStaffNameFromBody(section.body) : null
  let imageUrl: string | null = null

  if (fullName) {
    for (const part of parts) {
      if (!headerMatchesLegalCounsel(part.speakerHeader, fullName)) {
        continue
      }
      if (part.fullName?.trim()) {
        fullName = part.fullName.trim()
      }
      if (part.imageUrl) {
        imageUrl = part.imageUrl
        break
      }
    }
  }

  if (!fullName) {
    fullName = 'יועמ״ש'
  }

  return {
    id: LEGAL_COUNSEL_FALLBACK_PERSON_ID,
    committeeId,
    personId: LEGAL_COUNSEL_FALLBACK_PERSON_ID,
    fullName,
    imageUrl,
    factionName: null,
    seatRole: 'legal_counsel',
    roleDesc: 'ייעוץ משפטי',
    startDate: null,
    endDate: null,
  }
}

/**
 * Build a seat/chat identity for מנהל/ת הוועדה from the protocol block.
 * Always returns a manager row so the circle stays selectable.
 */
export function extractCommitteeManagerMember(
  parts: CommitteeTranscriptPart[],
  committeeId: number,
): CommitteeMember {
  const section = parts.find((part) => {
    const header = (part.speakerHeader ?? '').trim()
    return MANAGER_SECTION_HEADER_RE.test(header)
  })

  let fullName = section ? firstStaffNameFromBody(section.body) : null
  let imageUrl: string | null = null

  if (fullName) {
    for (const part of parts) {
      if (!headerMatchesCommitteeManager(part.speakerHeader, fullName)) {
        continue
      }
      if (part.fullName?.trim()) {
        fullName = part.fullName.trim()
      }
      if (part.imageUrl) {
        imageUrl = part.imageUrl
        break
      }
    }
  }

  if (!fullName) {
    fullName = 'מנהל/ת'
  }

  return {
    id: COMMITTEE_MANAGER_FALLBACK_PERSON_ID,
    committeeId,
    personId: COMMITTEE_MANAGER_FALLBACK_PERSON_ID,
    fullName,
    imageUrl,
    factionName: null,
    seatRole: 'committee_manager',
    roleDesc: 'מנהל/ת הוועדה',
    startDate: null,
    endDate: null,
  }
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
  // Guests often appear as a first name only ("דובי", "יוסי"); allow 1–4
  // Hebrew name tokens. Reject 1-letter stubs and overly long "headers".
  if (parts.length < 1 || parts.length > 4) {
    return false
  }
  if (parts.length === 1) {
    const sole = parts[0]!
    if (sole.length < 3 || sole.length > 14) {
      return false
    }
  } else if (parts.some((part) => part.length < 2)) {
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
  // Agenda / סדר היום must never count as a speaker turn.
  if (isAgendaSectionHeader(raw) || isStructuralMetaHeader(raw)) {
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
  // Guest / unidentified speaker: clean Hebrew name (first-only or multi-word).
  return !hasOfficialPrefix && looksLikePersonName(name)
}

/** Strip bidi / zero-width / niqqud / wrapping punct from protocol section labels. */
export function normalizeProtocolSectionHeader(header: string): string {
  return header
    .replace(/[\u200b-\u200f\u202a-\u202e\u2060\u2066-\u2069\ufeff]/gu, '')
    .replace(/[\u0591-\u05C7]/gu, '')
    .replace(/^[\s<"«『【\[]+|[\s>"»』】\]]+$/gu, '')
    .replace(/[:：.。־–—-]+$/gu, '')
    .trim()
}

/**
 * Agenda section labels: "סדר", "סדר היום", "סדר-היום", "סדר: …".
 * Also "מסדר היום …" removal-from-agenda headers.
 */
export function isAgendaSectionHeader(header: string): boolean {
  const text = normalizeProtocolSectionHeader(header)
  if (!text) {
    return false
  }
  return /^(?:מ?סדר)(?:[\s\-־–—:].*)?$/u.test(text) || text.startsWith('סדר')
}

/**
 * Protocol attendance blocks (נכחו / חברי הכנסת) — shown on the table, not
 * as chat cards.
 */
export function isAttendanceProtocolHeader(
  header: string | null | undefined,
): boolean {
  const text = normalizeProtocolSectionHeader((header ?? '').trim())
  if (!text) {
    return false
  }
  if (text === 'נכחו') {
    return true
  }
  // Exact guest-MK attendance labels (avoid stripping every "חברי …" header).
  return /^(?:חברי|חברות)\s+הכנסת$/u.test(text)
}

/**
 * Staff roster section cards (ייעוץ משפטי / מנהל/ת הוועדה) — used to build
 * table seats, omitted from the chat like attendance blocks. Does not match
 * named speech turns (e.g. "היועץ המשפטי איתי עצמון").
 */
export function isStaffRosterProtocolHeader(
  header: string | null | undefined,
): boolean {
  const text = normalizeProtocolSectionHeader((header ?? '').trim())
  if (!text) {
    return false
  }
  if (/^(?:ייעוץ משפטי|יועץ משפטי|יועצת משפטית)$/u.test(text)) {
    return true
  }
  return BARE_MANAGER_RE.test(text)
}

function isStructuralMetaHeader(header: string | null | undefined): boolean {
  const text = (header ?? '').trim()
  if (!text) {
    return true
  }
  if (
    isAttendanceProtocolHeader(text) ||
    isAgendaSectionHeader(text) ||
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
  const counsel = members.find((m) => m.seatRole === 'legal_counsel') ?? null
  const manager =
    members.find((m) => m.seatRole === 'committee_manager') ?? null

  // Staff speeches first — titles/names often don't share the people-row id.
  if (
    counsel &&
    headerMatchesLegalCounsel(part.speakerHeader, counsel.fullName)
  ) {
    return counsel.personId
  }
  if (
    manager &&
    headerMatchesCommitteeManager(part.speakerHeader, manager.fullName)
  ) {
    return manager.personId
  }

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

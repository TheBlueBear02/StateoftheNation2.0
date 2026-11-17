/** Shared validation for the /knesset/edit MK form. No network. */

export const MK_IMAGE_BUCKET = 'mk-images'
export const MAX_MK_IMAGE_BYTES = 4 * 1024 * 1024

export const PERSON_MANUAL_FIELDS = [
  'full_name',
  'gender',
  'birth_date',
  'email',
  'image_url',
  'wikipedia_url',
  'twitter_handle',
] as const

export type PersonManualField = (typeof PERSON_MANUAL_FIELDS)[number]

const MANUAL_FIELD_SET = new Set<string>(PERSON_MANUAL_FIELDS)
const GENDERS = new Set(['זכר', 'נקבה'])
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export const MEMBER_EDIT_MIGRATION =
  'יש להריץ פעם אחת את schema_knesset_member_edits.sql ב-Supabase לפני שמירת חבר כנסת או העלאת תמונה'

export type ParsedMemberEdit = {
  membershipId: number
  personId: number
  knessetId: number
  fullName: string
  gender: string | null
  birthDate: string | null
  email: string | null
  imageUrl: string | null
  twitterHandle: string | null
  wikipediaUrl: string | null
  factionId: number | null
}

export type ParseResult =
  | { ok: true; value: ParsedMemberEdit }
  | { ok: false; error: string }

function nullableText(value: unknown): string | null | undefined {
  if (value == null) {
    return null
  }
  if (typeof value !== 'string') {
    return undefined
  }
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function positiveInt(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : Number(value)
  if (!Number.isInteger(parsed) || parsed < 1) {
    return null
  }
  return parsed
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

export function parseMemberEdit(body: unknown): ParseResult {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: 'בקשה לא תקינה' }
  }
  const input = body as Record<string, unknown>

  const membershipId = positiveInt(input.membershipId)
  const personId = positiveInt(input.personId)
  const knessetId = positiveInt(input.knessetId)
  if (membershipId == null) {
    return { ok: false, error: 'מזהה חברות לא תקין' }
  }
  if (personId == null) {
    return { ok: false, error: 'מזהה אדם לא תקין' }
  }
  if (knessetId == null) {
    return { ok: false, error: 'מזהה כנסת לא תקין' }
  }

  const fullName = typeof input.fullName === 'string' ? input.fullName.trim() : ''
  if (!fullName) {
    return { ok: false, error: 'יש להזין שם מלא' }
  }
  if (fullName.length > 200) {
    return { ok: false, error: 'השם ארוך מדי' }
  }

  const gender = nullableText(input.gender)
  if (gender === undefined) {
    return { ok: false, error: 'מגדר לא תקין' }
  }
  if (gender && !GENDERS.has(gender)) {
    return { ok: false, error: 'מגדר חייב להיות זכר או נקבה' }
  }

  const birthDate = nullableText(input.birthDate)
  if (birthDate === undefined || (birthDate && !DATE_RE.test(birthDate))) {
    return { ok: false, error: 'תאריך לידה חייב להיות בפורמט YYYY-MM-DD' }
  }

  const email = nullableText(input.email)
  if (email === undefined || (email && !email.includes('@'))) {
    return { ok: false, error: 'אימייל לא תקין' }
  }

  const imageUrl = nullableText(input.imageUrl)
  if (imageUrl === undefined || (imageUrl && !isHttpUrl(imageUrl))) {
    return { ok: false, error: 'קישור התמונה חייב להתחיל ב-http או https' }
  }

  const wikipediaUrl = nullableText(input.wikipediaUrl)
  if (wikipediaUrl === undefined || (wikipediaUrl && !isHttpUrl(wikipediaUrl))) {
    return { ok: false, error: 'קישור ויקיפדיה חייב להתחיל ב-http או https' }
  }

  let twitterHandle = nullableText(input.twitterHandle)
  if (twitterHandle === undefined) {
    return { ok: false, error: 'שם משתמש בטוויטר לא תקין' }
  }
  if (twitterHandle?.startsWith('@')) {
    twitterHandle = twitterHandle.slice(1)
  }
  if (twitterHandle && (/\s/.test(twitterHandle) || twitterHandle.length > 50)) {
    return { ok: false, error: 'שם משתמש בטוויטר לא תקין' }
  }

  let factionId: number | null = null
  if (input.factionId != null && input.factionId !== '') {
    factionId = positiveInt(input.factionId)
    if (factionId == null) {
      return { ok: false, error: 'מזהה סיעה לא תקין' }
    }
  }

  return {
    ok: true,
    value: {
      membershipId,
      personId,
      knessetId,
      fullName,
      gender,
      birthDate,
      email,
      imageUrl,
      twitterHandle,
      wikipediaUrl,
      factionId,
    },
  }
}

export function mergeManualFields(
  existing: unknown,
  added: readonly string[],
): string[] {
  const current = Array.isArray(existing)
    ? existing.filter((item): item is string => typeof item === 'string')
    : []
  const merged = new Set<string>()
  for (const field of [...current, ...added]) {
    if (MANUAL_FIELD_SET.has(field)) {
      merged.add(field)
    }
  }
  return [...merged]
}

export function imageExtension(contentType: string): 'jpg' | 'png' | 'webp' | null {
  if (contentType === 'image/jpeg' || contentType === 'image/jpg') {
    return 'jpg'
  }
  if (contentType === 'image/png') {
    return 'png'
  }
  if (contentType === 'image/webp') {
    return 'webp'
  }
  return null
}

export function missingSchemaColumn(message: string, column: string): boolean {
  const text = message.toLowerCase()
  return text.includes(column.toLowerCase()) && text.includes('column')
}

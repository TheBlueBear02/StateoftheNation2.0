import { isDev, getKnessetEditSecret } from './runtimeEnv'
import type { ParsedMemberEdit } from './knessetMemberEdit'

export type MemberEditPayload = ParsedMemberEdit

export type UpdateKnessetMemberResult =
  | { ok: true; imageUrl?: string }
  | { ok: false; error: string }

function devOnly(): UpdateKnessetMemberResult | null {
  if (!isDev) {
    return {
      ok: false,
      error: 'זמין רק בסביבת פיתוח (npm run dev)',
    }
  }
  return null
}

function secretHeaders(): HeadersInit {
  const secret = getKnessetEditSecret()
  return secret ? { 'X-Knesset-Edit-Secret': secret } : {}
}

async function readResult(response: Response): Promise<UpdateKnessetMemberResult> {
  const body = (await response.json()) as UpdateKnessetMemberResult
  if (!response.ok) {
    return body.ok === false ? body : { ok: false, error: 'שמירה נכשלה' }
  }
  return body
}

export async function updateKnessetMember(
  input: MemberEditPayload,
): Promise<UpdateKnessetMemberResult> {
  const blocked = devOnly()
  if (blocked) {
    return blocked
  }

  const response = await fetch('/api/knesset/update-member', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...secretHeaders(),
    },
    body: JSON.stringify(input),
  })
  return readResult(response)
}

export async function uploadKnessetMemberImage(
  personId: number,
  file: File,
): Promise<UpdateKnessetMemberResult> {
  const blocked = devOnly()
  if (blocked) {
    return blocked
  }

  const body = new FormData()
  body.set('personId', String(personId))
  body.set('file', file)

  const response = await fetch('/api/knesset/upload-member-image', {
    method: 'POST',
    headers: secretHeaders(),
    body,
  })
  return readResult(response)
}

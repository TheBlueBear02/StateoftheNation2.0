import type { ParsedMemberEdit } from './knessetMemberEdit'
import { knessetEditSecretHeaders } from './knessetEditSession'

export type MemberEditPayload = ParsedMemberEdit

export type UpdateKnessetMemberResult =
  | { ok: true; imageUrl?: string }
  | { ok: false; error: string }

function secretHeaders(): HeadersInit {
  return knessetEditSecretHeaders()
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

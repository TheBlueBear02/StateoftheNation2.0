/** Password typed on /knesset/edit. Never reads process.env. */

export const KNESSET_EDIT_SECRET_STORAGE_KEY = 'knesset-edit-secret'

export function readKnessetEditSecret(): string {
  if (typeof sessionStorage === 'undefined') {
    return ''
  }
  try {
    return sessionStorage.getItem(KNESSET_EDIT_SECRET_STORAGE_KEY) ?? ''
  } catch {
    return ''
  }
}

export function storeKnessetEditSecret(secret: string): void {
  sessionStorage.setItem(KNESSET_EDIT_SECRET_STORAGE_KEY, secret)
}

export function clearKnessetEditSecret(): void {
  try {
    sessionStorage.removeItem(KNESSET_EDIT_SECRET_STORAGE_KEY)
  } catch {
    // ignore
  }
}

export function knessetEditSecretHeaders(): Record<string, string> {
  const secret = readKnessetEditSecret()
  return secret ? { 'X-Knesset-Edit-Secret': secret } : {}
}

export async function verifyKnessetEditSecret(
  secret: string,
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  let response: Response
  try {
    response = await fetch('/api/knesset/verify-edit-access', {
      method: 'POST',
      headers: secret ? { 'X-Knesset-Edit-Secret': secret } : {},
    })
  } catch {
    return { ok: false, status: 0, error: 'לא ניתן לאמת את הסיסמה' }
  }

  let error = 'לא ניתן לאמת את הסיסמה'
  try {
    const body = (await response.json()) as { ok?: boolean; error?: string }
    if (response.ok && body.ok) {
      return { ok: true }
    }
    if (typeof body.error === 'string' && body.error) {
      error = body.error
    }
  } catch {
    // keep the fallback message
  }

  return { ok: false, status: response.status, error }
}

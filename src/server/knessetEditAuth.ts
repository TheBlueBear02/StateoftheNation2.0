import { createHash, timingSafeEqual } from 'node:crypto'

/**
 * Server-only names for the /knesset/edit password.
 * NEXT_PUBLIC_* is intentionally absent so the value is never read from
 * a variable Next.js inlines into the browser bundle.
 * Dynamic env[name] access also keeps Next from inlining the value at build time.
 */
const SERVER_SECRET_ENV_NAMES = [
  'KNESSET_EDIT_SECRET',
  'PIPELINE_EDIT_SECRET',
  'ELECTIONS_EDIT_SECRET',
  'VITE_KNESSET_EDIT_SECRET',
] as const

const MAX_SECRET_CHARS = 512

export const KNESSET_EDIT_AUTH_FAILURE_DELAY_MS = 500

export const KNESSET_EDIT_SECRET_MISSING_ERROR =
  'חסר KNESSET_EDIT_SECRET בשרת'

export function readServerKnessetEditSecret(
  env: NodeJS.ProcessEnv = process.env,
): string {
  for (const name of SERVER_SECRET_ENV_NAMES) {
    const value = env[name]
    if (typeof value === 'string' && value.trim()) {
      return value.trim()
    }
  }
  return ''
}

/** SHA-256 digests are fixed length, so timingSafeEqual does not throw on mismatched input lengths. */
export function knessetEditSecretsMatch(
  provided: string,
  expected: string,
): boolean {
  if (
    !expected ||
    provided.length > MAX_SECRET_CHARS ||
    expected.length > MAX_SECRET_CHARS
  ) {
    return false
  }
  const providedDigest = createHash('sha256').update(provided, 'utf8').digest()
  const expectedDigest = createHash('sha256').update(expected, 'utf8').digest()
  return timingSafeEqual(providedDigest, expectedDigest)
}

function delay(ms: number): Promise<void> {
  if (ms <= 0) {
    return Promise.resolve()
  }
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

export async function authorizeKnessetEdit(
  request: Request,
  options?: { env?: NodeJS.ProcessEnv; delayMs?: number },
): Promise<{ ok: true } | { ok: false; status: 401 | 503; error: string }> {
  const expected = readServerKnessetEditSecret(options?.env ?? process.env)
  if (!expected) {
    return {
      ok: false,
      status: 503,
      error: KNESSET_EDIT_SECRET_MISSING_ERROR,
    }
  }

  const provided = (request.headers.get('x-knesset-edit-secret') ?? '').trim()
  if (!knessetEditSecretsMatch(provided, expected)) {
    await delay(options?.delayMs ?? KNESSET_EDIT_AUTH_FAILURE_DELAY_MS)
    return { ok: false, status: 401, error: 'אין הרשאה לערוך' }
  }

  return { ok: true }
}

/** Shared unlock for /piplines dashboard and all pipeline /edit pages. */

import { getPipelineEditSecret } from './runtimeEnv'

export const PIPELINE_UNLOCK_STORAGE_KEY = 'pipeline-unlocked'

export const PIPELINE_SECRET_MISSING_MESSAGE =
  'חסר PIPELINE_EDIT_SECRET / NEXT_PUBLIC_PIPELINE_EDIT_SECRET בקובץ .env (או ELECTIONS/KNESSET_EDIT_SECRET)'

export function getPipelineSecretConfigured(): boolean {
  const secret = getPipelineEditSecret()?.trim() ?? ''
  return secret.length > 0
}

export function isPipelineUnlockedInSession(): boolean {
  try {
    return sessionStorage.getItem(PIPELINE_UNLOCK_STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

export function setPipelineUnlockedInSession(): void {
  try {
    sessionStorage.setItem(PIPELINE_UNLOCK_STORAGE_KEY, '1')
  } catch {
    // ignore
  }
}

export function verifyPipelinePassword(password: string): boolean {
  const secret = getPipelineEditSecret()?.trim() ?? ''
  return Boolean(secret) && password === secret
}

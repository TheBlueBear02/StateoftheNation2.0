/** Client + server shared env helpers for the Next.js app. */

export const isDev = process.env.NODE_ENV === 'development'

export function getSupabaseUrl(): string | undefined {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.SUPABASE_URL ||
    process.env.VITE_SUPABASE_URL ||
    undefined
  )
}

export function getSupabaseAnonKey(): string | undefined {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY ||
    undefined
  )
}

function getLegacyElectionsEditSecret(): string | undefined {
  return (
    process.env.NEXT_PUBLIC_ELECTIONS_EDIT_SECRET ||
    process.env.ELECTIONS_EDIT_SECRET ||
    process.env.VITE_ELECTIONS_EDIT_SECRET ||
    undefined
  )
}

function getLegacyKnessetEditSecret(): string | undefined {
  return (
    process.env.NEXT_PUBLIC_KNESSET_EDIT_SECRET ||
    process.env.KNESSET_EDIT_SECRET ||
    process.env.VITE_KNESSET_EDIT_SECRET ||
    undefined
  )
}

/** Shared unlock secret for /piplines dashboard and all pipeline /edit pages. */
export function getPipelineEditSecret(): string | undefined {
  return (
    process.env.NEXT_PUBLIC_PIPELINE_EDIT_SECRET ||
    process.env.PIPELINE_EDIT_SECRET ||
    getLegacyElectionsEditSecret() ||
    getLegacyKnessetEditSecret() ||
    undefined
  )
}

/** @deprecated Prefer getPipelineEditSecret — kept as alias for existing callers. */
export function getElectionsEditSecret(): string | undefined {
  return getPipelineEditSecret()
}

/** @deprecated Prefer getPipelineEditSecret — kept as alias for existing callers. */
export function getKnessetEditSecret(): string | undefined {
  return getPipelineEditSecret()
}

/** Ensure an absolute origin URL (bare domains get https://). */
function normalizeSiteUrl(raw: string): string {
  const trimmed = raw.trim().replace(/\/$/, '')
  if (!trimmed) return trimmed
  if (/^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(trimmed)) return trimmed
  return `https://${trimmed}`
}

export function getSiteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL
  if (explicit?.trim()) return normalizeSiteUrl(explicit)
  if (process.env.VERCEL_URL) {
    return normalizeSiteUrl(process.env.VERCEL_URL)
  }
  return 'http://localhost:3000'
}

/** Pipeline spawn APIs: local dev or explicit opt-in. */
export function pipelineApisEnabled(): boolean {
  return (
    isDev ||
    process.env.ENABLE_PIPELINE_API === '1' ||
    process.env.ENABLE_PIPELINE_API === 'true'
  )
}

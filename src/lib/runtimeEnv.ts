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

export function getElectionsEditSecret(): string | undefined {
  return (
    process.env.NEXT_PUBLIC_ELECTIONS_EDIT_SECRET ||
    process.env.ELECTIONS_EDIT_SECRET ||
    process.env.VITE_ELECTIONS_EDIT_SECRET ||
    undefined
  )
}

export function getKnessetEditSecret(): string | undefined {
  return (
    process.env.NEXT_PUBLIC_KNESSET_EDIT_SECRET ||
    process.env.KNESSET_EDIT_SECRET ||
    process.env.VITE_KNESSET_EDIT_SECRET ||
    undefined
  )
}

export function getSiteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL
  if (explicit) return explicit.replace(/\/$/, '')
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`.replace(/\/$/, '')
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

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { getSupabaseAnonKey, getSupabaseUrl } from './runtimeEnv'

/** Anon Supabase client for Server Components, sitemap, and metadata. */
export function createServerSupabaseClient(): SupabaseClient | null {
  const url = getSupabaseUrl()
  const key = getSupabaseAnonKey()
  if (!url || !key) return null
  return createClient(url, key)
}

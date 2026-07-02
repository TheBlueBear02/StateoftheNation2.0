import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabaseConfigError =
  !supabaseUrl || !supabaseAnonKey
    ? 'Missing Supabase env vars — add VITE_SUPABASE_ANON_KEY (public anon key) to .env'
    : null

export const supabase: SupabaseClient | null = supabaseConfigError
  ? null
  : createClient(supabaseUrl, supabaseAnonKey)

export const ACTIVE_KNESSET_ID = 26

export type KnessetFaction = {
  name: string
  color: string | null
  is_coalition: boolean
}

export type KnessetPerson = {
  full_name: string
  image_url: string | null
}

export type KnessetMembershipRow = {
  id: number
  faction_id: number | null
  person: KnessetPerson | KnessetPerson[] | null
  faction: KnessetFaction | KnessetFaction[] | null
}

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

export type KnessetOption = {
  id: number
  knessetNumber: number
  knessetName: string | null
  startDate: string | null
  endDate: string | null
  isActive: boolean
}

export type KnessetRow = {
  id: number
  knesset_number: number
  knesset_name: string | null
  start_date: string | null
  end_date: string | null
  is_active: boolean
}

export type KnessetFaction = {
  name: string
  short_name: string | null
  logo_url: string | null
  color: string | null
  is_coalition: boolean
}

export type KnessetPerson = {
  full_name: string
  image_url: string | null
}

export type KnessetTerm = {
  knesset_number: number
  start_date: string | null
  end_date: string | null
}

export type KnessetMembershipRow = {
  id: number
  person_id: number
  faction_id: number | null
  start_date: string | null
  person: KnessetPerson | KnessetPerson[] | null
  faction: KnessetFaction | KnessetFaction[] | null
  knesset: KnessetTerm | KnessetTerm[] | null
}

export type KnessetMembershipTenureRow = {
  person_id: number
  start_date: string | null
  end_date: string | null
  knesset: Pick<KnessetTerm, 'knesset_number'> | Pick<KnessetTerm, 'knesset_number'>[] | null
}

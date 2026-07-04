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
export const ACTIVE_ELECTION_YEAR = 2026

export type KnessetOption = {
  id: number
  knessetNumber: number
  knessetName: string | null
  startDate: string | null
  endDate: string | null
  isActive: boolean
}

export type GovernmentOption = {
  id: number
  governmentNumber: number
  knessetId: number | null
  startDate: string | null
  endDate: string | null
  isActive: boolean
}

export type ElectionOption = {
  id: number
  year: number
  date: string | null
  name: string | null
  knessetNumber: number | null
}

export type ElectionParty = {
  id: number
  electionId: number
  knessetFactionId: number | null
  name: string
  shortName: string | null
  color: string | null
  logoUrl: string | null
  ballotLetter: string | null
  description: string | null
  leader: ElectionPartyLeader | null
}

export type ElectionPartyLeader = {
  fullName: string
  imageUrl: string | null
}

export type KnessetRow = {
  id: number
  knesset_number: number
  knesset_name: string | null
  start_date: string | null
  end_date: string | null
  is_active: boolean
}

export type GovernmentRow = {
  id: number
  government_number: number
  knesset_id: number | null
  start_date: string | null
  end_date: string | null
  is_active: boolean
}

export type ElectionRow = {
  id: number
  year: number
  date: string | null
  name: string | null
  knesset_number: number | null
}

export type ElectionPartyRow = {
  id: number
  election_id: number
  knesset_faction_id?: number | null
  name: string
  short_name: string | null
  color: string | null
  logo_url: string | null
  ballot_letter: string | null
  description: string | null
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

export type ElectionCandidatePerson = {
  full_name: string
  image_url: string | null
  birth_date: string | null
  gender: string | null
  wikipedia_url: string | null
}

export type ElectionCandidateRow = {
  id: number
  election_id: number
  party_id: number
  person_id: number
  list_position: number
  description: string | null
  city: string | null
  latitude: string | number | null
  longitude: string | number | null
  person: ElectionCandidatePerson | ElectionCandidatePerson[] | null
}

export type ElectionLeaderCandidateRow = {
  party_id: number
  person: Pick<ElectionCandidatePerson, 'full_name' | 'image_url'> | Pick<ElectionCandidatePerson, 'full_name' | 'image_url'>[] | null
}

export type ElectionMembershipRow = {
  person_id: number
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
  duty_desc: string | null
  person: KnessetPerson | KnessetPerson[] | null
  faction: KnessetFaction | KnessetFaction[] | null
  knesset: KnessetTerm | KnessetTerm[] | null
}

export type OfficeRow = {
  name: string | null
  knesset_category_name: string | null
}

export type MinisterAppointmentRow = {
  person_id: number
  duty_desc: string | null
  is_acting: boolean
  office: OfficeRow | OfficeRow[] | null
}

export type GovernmentAppointmentRow = {
  id: number
  person_id: number
  government_id: number
  office_id: number | null
  start_date: string | null
  end_date: string | null
  duty_desc: string | null
  is_acting: boolean
  person: KnessetPerson | KnessetPerson[] | null
  office: OfficeRow | OfficeRow[] | null
}

export type GovernmentMembershipFactionRow = {
  person_id: number
  faction_id: number | null
  start_date: string | null
  end_date: string | null
  faction: KnessetFaction | KnessetFaction[] | null
}

export type KnessetMembershipTenureRow = {
  person_id: number
  start_date: string | null
  end_date: string | null
  knesset: Pick<KnessetTerm, 'knesset_number'> | Pick<KnessetTerm, 'knesset_number'>[] | null
}

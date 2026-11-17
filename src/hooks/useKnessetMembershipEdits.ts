import { useCallback, useEffect, useState } from 'react'
import { supabase, supabaseConfigError } from '../lib/supabase'

type PersonEmbed = {
  id: number
  full_name: string | null
  gender: string | null
  birth_date: string | null
  email: string | null
  image_url: string | null
  twitter_handle: string | null
  wikipedia_url: string | null
  manual_fields?: string[] | null
}

type FactionEmbed = {
  id: number
  name: string | null
  short_name: string | null
}

type MembershipEditRow = {
  id: number
  person_id: number
  knesset_id: number
  faction_id: number | null
  faction_id_provisional?: boolean | null
  faction_id_manual?: boolean | null
  start_date: string | null
  end_date: string | null
  person: PersonEmbed | PersonEmbed[] | null
  faction: FactionEmbed | FactionEmbed[] | null
}

export type MembershipEdit = {
  membershipId: number
  personId: number
  knessetId: number
  factionId: number | null
  factionName: string | null
  factionProvisional: boolean
  factionManual: boolean
  startDate: string | null
  endDate: string | null
  fullName: string
  gender: string | null
  birthDate: string | null
  email: string | null
  imageUrl: string | null
  twitterHandle: string | null
  wikipediaUrl: string | null
  manualFields: string[]
}

const BASE_SELECT = [
  'id',
  'person_id',
  'knesset_id',
  'faction_id',
  'faction_id_provisional',
  'start_date',
  'end_date',
  'person:people(id, full_name, gender, birth_date, email, image_url, twitter_handle, wikipedia_url)',
  'faction:knesset_factions(id, name, short_name)',
].join(', ')

const EDIT_SELECT = [
  'id',
  'person_id',
  'knesset_id',
  'faction_id',
  'faction_id_provisional',
  'faction_id_manual',
  'start_date',
  'end_date',
  'person:people(id, full_name, gender, birth_date, email, image_url, twitter_handle, wikipedia_url, manual_fields)',
  'faction:knesset_factions(id, name, short_name)',
].join(', ')

function unwrap<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) {
    return value[0] ?? null
  }
  return value ?? null
}

function normalize(row: MembershipEditRow): MembershipEdit {
  const person = unwrap(row.person)
  const faction = unwrap(row.faction)
  return {
    membershipId: row.id,
    personId: row.person_id,
    knessetId: row.knesset_id,
    factionId: row.faction_id,
    factionName: faction?.short_name || faction?.name || null,
    factionProvisional: Boolean(row.faction_id_provisional),
    factionManual: Boolean(row.faction_id_manual),
    startDate: row.start_date,
    endDate: row.end_date,
    fullName: person?.full_name ?? 'חבר כנסת',
    gender: person?.gender ?? null,
    birthDate: person?.birth_date?.slice(0, 10) ?? null,
    email: person?.email ?? null,
    imageUrl: person?.image_url ?? null,
    twitterHandle: person?.twitter_handle ?? null,
    wikipediaUrl: person?.wikipedia_url ?? null,
    manualFields: Array.isArray(person?.manual_fields) ? person.manual_fields : [],
  }
}

async function fetchPage(
  knessetId: number,
  columns: string,
  offset: number,
) {
  return supabase!
    .from('knesset_memberships')
    .select(columns)
    .eq('knesset_id', knessetId)
    .order('id')
    .range(offset, offset + 999)
}

export function useKnessetMembershipEdits(knessetId: number | null) {
  const [members, setMembers] = useState<MembershipEdit[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [schemaReady, setSchemaReady] = useState(true)

  const refetch = useCallback(async () => {
    if (!knessetId) {
      setMembers([])
      setLoading(false)
      setError(null)
      return
    }
    if (supabaseConfigError || !supabase) {
      setError(supabaseConfigError ?? 'Supabase client is not configured')
      setMembers([])
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    let columns = EDIT_SELECT
    let ready = true
    const rows: MembershipEditRow[] = []
    let offset = 0
    while (true) {
      const { data, error: queryError } = await fetchPage(knessetId, columns, offset)
      if (queryError) {
        const message = queryError.message.toLowerCase()
        if (
          ready &&
          (message.includes('manual_fields') || message.includes('faction_id_manual'))
        ) {
          columns = BASE_SELECT
          ready = false
          offset = 0
          rows.length = 0
          continue
        }
        setError(queryError.message)
        setMembers([])
        setSchemaReady(ready)
        setLoading(false)
        return
      }
      const batch = (data ?? []) as unknown as MembershipEditRow[]
      rows.push(...batch)
      if (batch.length < 1000) {
        break
      }
      offset += 1000
    }

    rows.sort((a, b) => {
      const left = unwrap(a.person)?.full_name ?? ''
      const right = unwrap(b.person)?.full_name ?? ''
      return left.localeCompare(right, 'he')
    })
    setMembers(rows.map(normalize))
    setSchemaReady(ready)
    setLoading(false)
  }, [knessetId])

  useEffect(() => {
    void refetch()
  }, [refetch])

  return { members, loading, error, schemaReady, refetch }
}

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  ACTIVE_ELECTION_YEAR,
  type ElectionOption,
  type ElectionParty,
  type ElectionPartyLeader,
  type ElectionLeaderCandidateRow,
  type ElectionPartyRow,
  type ElectionRow,
} from './supabase'

function normalizeElection(row: ElectionRow): ElectionOption {
  return {
    id: row.id,
    year: row.year,
    date: row.date,
    name: row.name,
    knessetNumber: row.knesset_number,
  }
}

function unwrapRelation<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) {
    return value[0] ?? null
  }
  return value ?? null
}

function normalizeLeader(
  row: ElectionLeaderCandidateRow,
): ElectionPartyLeader | null {
  const person = unwrapRelation(row.person)

  if (!person?.full_name) {
    return null
  }

  return {
    fullName: person.full_name,
    imageUrl: person.image_url,
  }
}

function normalizeParty(
  row: ElectionPartyRow,
  leadersByPartyId: Map<number, ElectionPartyLeader>,
): ElectionParty {
  return {
    id: row.id,
    electionId: row.election_id,
    knessetFactionId: row.knesset_faction_id ?? null,
    name: row.name,
    shortName: row.short_name,
    color: row.color,
    logoUrl: row.logo_url,
    ballotLetter: row.ballot_letter,
    description: row.description,
    leader: leadersByPartyId.get(row.id) ?? null,
  }
}

async function fetchPartyRows(
  client: SupabaseClient,
  electionId: number | null,
) {
  let query = client
    .from('election_parties')
    .select(
      'id, election_id, name, short_name, color, logo_url, ballot_letter, description, knesset_faction_id',
    )
    .eq('party_status', 'confirmed')
    .order('id', { ascending: true })

  if (electionId !== null) {
    query = query.eq('election_id', electionId)
  }

  return query
}

async function fetchPartyLeaders(
  client: SupabaseClient,
  partyIds: number[],
) {
  const leadersByPartyId = new Map<number, ElectionPartyLeader>()

  if (partyIds.length === 0) {
    return leadersByPartyId
  }

  const { data, error } = await client
    .from('election_candidates')
    .select('party_id, person:people(full_name, image_url)')
    .in('party_id', partyIds)
    .eq('list_position', 1)

  if (error) {
    return leadersByPartyId
  }

  for (const row of (data ?? []) as unknown as ElectionLeaderCandidateRow[]) {
    const leader = normalizeLeader(row)
    if (leader) {
      leadersByPartyId.set(row.party_id, leader)
    }
  }

  return leadersByPartyId
}

export function formatElectionDate(date: string | null): string | null {
  if (!date) {
    return null
  }

  return new Intl.DateTimeFormat('he-IL', {
    timeZone: 'Asia/Jerusalem',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(date))
}

export type FetchElectionPartiesResult = {
  election: ElectionOption | null
  parties: ElectionParty[]
  error: string | null
}

export async function fetchElectionParties(
  client: SupabaseClient,
): Promise<FetchElectionPartiesResult> {
  const { data: electionData, error: electionError } = await client
    .from('elections')
    .select('id, year, date, name, knesset_number')
    .eq('year', ACTIVE_ELECTION_YEAR)
    .maybeSingle()

  const electionRow =
    !electionError && electionData ? (electionData as ElectionRow) : null

  let { data: partyData, error: partyError } = await fetchPartyRows(
    client,
    electionRow?.id ?? null,
  )

  if (!partyError && electionRow && (partyData?.length ?? 0) === 0) {
    const fallback = await fetchPartyRows(client, null)
    partyData = fallback.data
    partyError = fallback.error
  }

  if (partyError) {
    return {
      election: electionRow ? normalizeElection(electionRow) : null,
      parties: [],
      error: partyError.message,
    }
  }

  const partyRows = (partyData ?? []) as ElectionPartyRow[]
  const leadersByPartyId = await fetchPartyLeaders(
    client,
    partyRows.map((party) => party.id),
  )

  return {
    election: electionRow ? normalizeElection(electionRow) : null,
    parties: partyRows.map((party) => normalizeParty(party, leadersByPartyId)),
    error: null,
  }
}

const PARTY_SELECT =
  'id, election_id, name, short_name, color, logo_url, ballot_letter, description, knesset_faction_id'

/** Load one confirmed party (with list leader) by `election_parties.id`. */
export async function fetchElectionPartyById(
  client: SupabaseClient,
  partyId: number,
): Promise<{ party: ElectionParty | null; error: string | null }> {
  if (!Number.isInteger(partyId) || partyId < 1) {
    return { party: null, error: null }
  }

  const { data, error } = await client
    .from('election_parties')
    .select(PARTY_SELECT)
    .eq('id', partyId)
    .eq('party_status', 'confirmed')
    .maybeSingle()

  if (error) {
    return { party: null, error: error.message }
  }

  if (!data) {
    return { party: null, error: null }
  }

  const row = data as ElectionPartyRow
  const leadersByPartyId = await fetchPartyLeaders(client, [row.id])
  return {
    party: normalizeParty(row, leadersByPartyId),
    error: null,
  }
}

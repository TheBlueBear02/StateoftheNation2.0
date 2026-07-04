import { useEffect, useState } from 'react'
import {
  ACTIVE_ELECTION_YEAR,
  supabase,
  supabaseConfigError,
  type ElectionOption,
  type ElectionPartyLeader,
  type ElectionParty,
  type ElectionLeaderCandidateRow,
  type ElectionPartyRow,
  type ElectionRow,
} from '../lib/supabase'

export type UseElectionPartiesResult = {
  election: ElectionOption | null
  parties: ElectionParty[]
  loading: boolean
  error: string | null
}

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

async function fetchPartyRows(electionId: number | null) {
  let query = supabase
    ?.from('election_parties')
    .select(
      'id, election_id, name, short_name, color, logo_url, ballot_letter, description',
    )
    .order('id', { ascending: true })

  if (electionId !== null) {
    query = query?.eq('election_id', electionId)
  }

  return query
}

async function fetchPartyLeaders(partyIds: number[]) {
  const leadersByPartyId = new Map<number, ElectionPartyLeader>()

  if (!supabase || partyIds.length === 0) {
    return leadersByPartyId
  }

  const { data, error } = await supabase
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

export function useElectionParties(): UseElectionPartiesResult {
  const [election, setElection] = useState<ElectionOption | null>(null)
  const [parties, setParties] = useState<ElectionParty[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function fetchParties() {
      setLoading(true)
      setError(null)

      if (supabaseConfigError || !supabase) {
        setError(supabaseConfigError ?? 'Supabase client is not configured')
        setElection(null)
        setParties([])
        setLoading(false)
        return
      }

      const { data: electionData, error: electionError } = await supabase
        .from('elections')
        .select('id, year, date, name, knesset_number')
        .eq('year', ACTIVE_ELECTION_YEAR)
        .maybeSingle()

      if (cancelled) {
        return
      }

      const electionRow =
        !electionError && electionData ? (electionData as ElectionRow) : null
      const partyResult = await fetchPartyRows(electionRow?.id ?? null)

      if (!partyResult) {
        setError('Supabase client is not configured')
        setElection(electionRow ? normalizeElection(electionRow) : null)
        setParties([])
        setLoading(false)
        return
      }

      let { data: partyData, error: partyError } = partyResult

      if (
        !partyError &&
        electionRow &&
        (partyData?.length ?? 0) === 0
      ) {
        const fallbackPartyResult = await fetchPartyRows(null)

        if (cancelled) {
          return
        }

        if (!fallbackPartyResult) {
          setError('Supabase client is not configured')
          setElection(normalizeElection(electionRow))
          setParties([])
          setLoading(false)
          return
        }

        const fallbackRows = await fallbackPartyResult
        partyData = fallbackRows.data
        partyError = fallbackRows.error
      }

      if (cancelled) {
        return
      }

      if (partyError) {
        setError(partyError.message)
        setElection(electionRow ? normalizeElection(electionRow) : null)
        setParties([])
        setLoading(false)
        return
      }

      const partyRows = (partyData ?? []) as ElectionPartyRow[]
      const leadersByPartyId = await fetchPartyLeaders(
        partyRows.map((party) => party.id),
      )

      if (cancelled) {
        return
      }

      setElection(electionRow ? normalizeElection(electionRow) : null)
      setParties(
        partyRows.map((party) => normalizeParty(party, leadersByPartyId)),
      )
      setLoading(false)
    }

    void fetchParties()

    return () => {
      cancelled = true
    }
  }, [])

  return { election, parties, loading, error }
}

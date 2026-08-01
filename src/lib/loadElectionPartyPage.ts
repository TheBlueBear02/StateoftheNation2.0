import { cache } from 'react'
import { fetchElectionCandidates } from './fetchElectionCandidates'
import { fetchElectionPartyById } from './fetchElectionParties'
import type { ElectionCandidate } from './fetchElectionCandidates'
import type { ElectionParty } from './supabase'
import { createServerSupabaseClient } from './supabaseServer'

/** Request-scoped cache for party detail metadata + page body (Server Components only). */
export const loadElectionPartyPage = cache(async (partyId: number) => {
  const client = createServerSupabaseClient()
  if (!client || !Number.isInteger(partyId) || partyId < 1) {
    return {
      party: null as ElectionParty | null,
      candidates: [] as ElectionCandidate[],
      error: null as string | null,
    }
  }

  const partyResult = await fetchElectionPartyById(client, partyId)
  if (!partyResult.party) {
    return {
      party: null,
      candidates: [],
      error: partyResult.error,
    }
  }

  const candidatesResult = await fetchElectionCandidates(
    client,
    partyResult.party.id,
  )

  return {
    party: partyResult.party,
    candidates: candidatesResult.candidates,
    error: partyResult.error ?? candidatesResult.error,
  }
})

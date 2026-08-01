import { useCallback, useEffect, useState } from 'react'
import {
  registerPartyBranding,
  resolvePartyBranding,
  type PartyBranding,
} from '../lib/pollChartData'
import {
  ACTIVE_ELECTION_YEAR,
  supabase,
  supabaseConfigError,
  type PartyBloc,
  type PollPublisherRow,
  type PollsterRow,
  type PollResultRow,
  type PollRow,
} from '../lib/supabase'

export type PollPartyResult = {
  partyId: number
  partyName: string
  partyShortName: string | null
  partyColor: string | null
  partyLogoUrl: string | null
  bloc: PartyBloc | null
  seats: number | null
  voteShare: number | null
  belowThreshold: boolean | null
}

export type PollWithResults = {
  id: number
  pollster: string
  pollsterHe: string | null
  publisher: string
  publisherHe: string | null
  publisherLogoUrl: string | null
  fieldworkStart: string
  fieldworkEnd: string
  sampleSize: number | null
  marginOfError: number | null
  isScenario: boolean
  scenarioDesc: string | null
  sourceUrl: string | null
  results: PollPartyResult[]
}

export type UsePollsResult = {
  polls: PollWithResults[]
  loading: boolean
  error: string | null
  refetch: () => Promise<void>
}

function formatFieldwork(start: string, end: string): string {
  const fmt = (d: string) =>
    new Intl.DateTimeFormat('he-IL', {
      timeZone: 'Asia/Jerusalem',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(new Date(d))

  if (start === end) {
    return fmt(start)
  }

  return `${fmt(start)} – ${fmt(end)}`
}

const PARTY_BRANDING_SELECT =
  'id, name, short_name, color, logo_url, bloc, knesset_faction:knesset_factions(logo_url, color, short_name)'

type PartyBrandingSourceRow = {
  id: number
  name: string
  short_name: string | null
  color: string | null
  logo_url: string | null
  bloc: string | null
  knesset_faction?:
    | {
        logo_url: string | null
        color: string | null
        short_name: string | null
      }
    | {
        logo_url: string | null
        color: string | null
        short_name: string | null
      }[]
    | null
}

function unwrapRelation<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) {
    return value[0] ?? null
  }

  return value ?? null
}

function ingestPartyBranding(
  brandingByKey: Map<string, PartyBranding>,
  row: PartyBrandingSourceRow,
): void {
  const faction = unwrapRelation(row.knesset_faction)
  registerPartyBranding(brandingByKey, row.short_name, row.color, row.logo_url)
  registerPartyBranding(brandingByKey, row.name, row.color, row.logo_url)
  registerPartyBranding(
    brandingByKey,
    faction?.short_name,
    faction?.color,
    faction?.logo_url,
  )
}

export function usePolls(limit = 30): UsePollsResult {
  const [polls, setPolls] = useState<PollWithResults[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchPolls = useCallback(async () => {
    setLoading(true)
    setError(null)

    if (supabaseConfigError || !supabase) {
      setError(supabaseConfigError ?? 'Supabase client is not configured')
      setPolls([])
      setLoading(false)
      return
    }

    const { data: electionData, error: electionError } = await supabase
      .from('elections')
      .select('id')
      .eq('year', ACTIVE_ELECTION_YEAR)
      .maybeSingle()

    if (electionError || !electionData) {
      setError(electionError?.message ?? 'Election not found')
      setPolls([])
      setLoading(false)
      return
    }

    const { data: pollRows, error: pollError } = await supabase
      .from('polls')
      .select('*')
      .eq('election_id', electionData.id)
      .eq('is_scenario', false)
      .order('fieldwork_end', { ascending: false })
      .limit(limit)

    if (pollError) {
      setError(pollError.message)
      setPolls([])
      setLoading(false)
      return
    }

    const typedPolls = (pollRows ?? []) as PollRow[]
    const pollIds = typedPolls.map((p) => p.id)

    if (pollIds.length === 0) {
      setPolls([])
      setLoading(false)
      return
    }

    const { data: resultRows, error: resultError } = await supabase
      .from('poll_results')
      .select('poll_id, party_id, seats, vote_share, below_threshold')
      .in('poll_id', pollIds)

    if (resultError) {
      setError(resultError.message)
      setPolls([])
      setLoading(false)
      return
    }

    const publisherLogoById = new Map<number, string | null>()
    const publisherLogoByName = new Map<string, string | null>()
    const publisherHeById = new Map<number, string | null>()
    const publisherHeByName = new Map<string, string | null>()
    const { data: publisherRows } = await supabase
      .from('poll_publishers')
      .select('id, name, name_he, logo_url')

    for (const row of (publisherRows ?? []) as PollPublisherRow[]) {
      publisherLogoById.set(row.id, row.logo_url)
      publisherLogoByName.set(row.name, row.logo_url)
      publisherHeById.set(row.id, row.name_he)
      publisherHeByName.set(row.name, row.name_he)
    }

    const pollsterHeById = new Map<number, string | null>()
    const pollsterHeByName = new Map<string, string | null>()
    const { data: pollsterRows } = await supabase
      .from('pollsters')
      .select('id, name, name_he')

    for (const row of (pollsterRows ?? []) as PollsterRow[]) {
      pollsterHeById.set(row.id, row.name_he)
      pollsterHeByName.set(row.name, row.name_he)
    }

    const partyIds = [
      ...new Set((resultRows ?? []).map((r) => (r as PollResultRow).party_id)),
    ]

    const partyMap = new Map<
      number,
      {
        name: string
        shortName: string | null
        color: string | null
        logoUrl: string | null
        bloc: PartyBloc | null
      }
    >()

    const brandingByKey = new Map<string, PartyBranding>()

    const { data: confirmedPartyRows } = await supabase
      .from('election_parties')
      .select(PARTY_BRANDING_SELECT)
      .eq('election_id', electionData.id)
      .eq('party_status', 'confirmed')

    for (const row of (confirmedPartyRows ?? []) as PartyBrandingSourceRow[]) {
      ingestPartyBranding(brandingByKey, row)
    }

    if (partyIds.length > 0) {
      const { data: partyRows } = await supabase
        .from('election_parties')
        .select(PARTY_BRANDING_SELECT)
        .in('id', partyIds)

      for (const p of (partyRows ?? []) as PartyBrandingSourceRow[]) {
        ingestPartyBranding(brandingByKey, p)
        const branding = resolvePartyBranding(
          p.short_name,
          p.color,
          p.logo_url,
          brandingByKey,
        )
        partyMap.set(p.id, {
          name: p.name,
          shortName: p.short_name,
          color: branding.color,
          logoUrl: branding.logoUrl,
          bloc: (p.bloc as PartyBloc | null) ?? null,
        })
      }
    }

    const resultsByPoll = new Map<number, PollPartyResult[]>()
    for (const row of (resultRows ?? []) as PollResultRow[]) {
      const party = partyMap.get(row.party_id)
      const list = resultsByPoll.get(row.poll_id) ?? []
      list.push({
        partyId: row.party_id,
        partyName: party?.name ?? `#${row.party_id}`,
        partyShortName: party?.shortName ?? null,
        partyColor: party?.color ?? null,
        partyLogoUrl: party?.logoUrl ?? null,
        bloc: party?.bloc ?? null,
        seats: row.seats,
        voteShare: row.vote_share !== null ? Number(row.vote_share) : null,
        belowThreshold: row.below_threshold,
      })
      resultsByPoll.set(row.poll_id, list)
    }

    setPolls(
      typedPolls.map((poll) => ({
        id: poll.id,
        pollster: poll.pollster,
        pollsterHe:
          poll.pollster_he?.trim() ||
          (poll.pollster_id !== null
            ? pollsterHeById.get(poll.pollster_id)
            : undefined) ||
          pollsterHeByName.get(poll.pollster) ||
          null,
        publisher: poll.publisher,
        publisherHe:
          poll.publisher_he?.trim() ||
          (poll.publisher_id !== null
            ? publisherHeById.get(poll.publisher_id)
            : undefined) ||
          publisherHeByName.get(poll.publisher) ||
          null,
        publisherLogoUrl:
          (poll.publisher_id !== null
            ? publisherLogoById.get(poll.publisher_id)
            : undefined) ??
          publisherLogoByName.get(poll.publisher) ??
          null,
        fieldworkStart: poll.fieldwork_start,
        fieldworkEnd: poll.fieldwork_end,
        sampleSize: poll.sample_size,
        marginOfError:
          poll.margin_of_error !== null ? Number(poll.margin_of_error) : null,
        isScenario: poll.is_scenario,
        scenarioDesc: poll.scenario_desc,
        sourceUrl: poll.source_url,
        results: (resultsByPoll.get(poll.id) ?? []).sort(
          (a, b) => (b.seats ?? 0) - (a.seats ?? 0),
        ),
      })),
    )
    setLoading(false)
  }, [limit])

  useEffect(() => {
    void fetchPolls()
  }, [fetchPolls])

  return { polls, loading, error, refetch: fetchPolls }
}

export { formatFieldwork }

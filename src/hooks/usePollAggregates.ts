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
  type PartyLineageRow,
  type PollAggregateRow,
} from '../lib/supabase'

export type AggregateMethod = 'weighted' | 'last3'

export type PartyAggregate = {
  partyId: number
  partyName: string
  partyShortName: string | null
  partyColor: string | null
  partyLogoUrl: string | null
  bloc: PartyBloc | null
  partyStatus: string | null
  seatsAvg: number
  pollCount: number
}

export type AggregateSnapshot = {
  asOfDate: string
  method: AggregateMethod
  parties: PartyAggregate[]
  blocTotals: {
    coalition: number
    opposition: number
    unaligned: number
  }
}

export type TrendPoint = {
  date: string
  seatsAvg: number
}

export type PartyTrendSeries = {
  partyId: number
  partyName: string
  partyShortName: string | null
  partyColor: string | null
  partyLogoUrl: string | null
  segments: TrendPoint[][]
}

export type UsePollAggregatesResult = {
  current: AggregateSnapshot | null
  historical: PartyTrendSeries[]
  lineage: PartyLineageRow[]
  loading: boolean
  error: string | null
  method: AggregateMethod
  setMethod: (method: AggregateMethod) => void
  refetch: () => Promise<void>
}

const PARTY_BRANDING_SELECT =
  'id, name, short_name, color, logo_url, bloc, party_status, knesset_faction:knesset_factions(logo_url, color, short_name)'

type PartyBrandingSourceRow = {
  id: number
  name: string
  short_name: string | null
  color: string | null
  logo_url: string | null
  bloc: string | null
  party_status: string | null
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

export function usePollAggregates(): UsePollAggregatesResult {
  const [current, setCurrent] = useState<AggregateSnapshot | null>(null)
  const [historical, setHistorical] = useState<PartyTrendSeries[]>([])
  const [lineage, setLineage] = useState<PartyLineageRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [method, setMethod] = useState<AggregateMethod>('weighted')

  const fetchAggregates = useCallback(async () => {
    setLoading(true)
    setError(null)

    if (supabaseConfigError || !supabase) {
      setError(supabaseConfigError ?? 'Supabase client is not configured')
      setCurrent(null)
      setHistorical([])
      setLineage([])
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
      setLoading(false)
      return
    }

    const { data: aggRows, error: aggError } = await supabase
      .from('poll_aggregates')
      .select('*')
      .eq('election_id', electionData.id)
      .eq('method', method)
      .order('as_of_date', { ascending: false })
      .limit(1000)

    if (aggError) {
      setError(aggError.message)
      setLoading(false)
      return
    }

    const typedAggs = (aggRows ?? []) as PollAggregateRow[]

    if (typedAggs.length === 0) {
      setCurrent(null)
      setHistorical([])
      setLoading(false)
      return
    }

    const latestDate = typedAggs[0].as_of_date
    const latestAggs = typedAggs.filter((a) => a.as_of_date === latestDate)

    const partyIds = [...new Set(typedAggs.map((a) => a.party_id))]

    const { data: partyRows } = await supabase
      .from('election_parties')
      .select(PARTY_BRANDING_SELECT)
      .in('id', partyIds)

    const brandingByKey = new Map<string, PartyBranding>()
    for (const row of (partyRows ?? []) as PartyBrandingSourceRow[]) {
      ingestPartyBranding(brandingByKey, row)
    }

    // Second pass over confirmed parties with matching short names fills logo gaps.
    const { data: confirmedRows } = await supabase
      .from('election_parties')
      .select(PARTY_BRANDING_SELECT)
      .eq('party_status', 'confirmed')

    for (const row of (confirmedRows ?? []) as PartyBrandingSourceRow[]) {
      ingestPartyBranding(brandingByKey, row)
    }

    const partyMap = new Map(
      ((partyRows ?? []) as PartyBrandingSourceRow[]).map((p) => {
        const branding = resolvePartyBranding(
          p.short_name ?? p.name,
          p.color,
          p.logo_url,
          brandingByKey,
        )
        return [
          p.id,
          {
            name: p.name,
            shortName: p.short_name,
            color: branding.color,
            logoUrl: branding.logoUrl,
            bloc: p.bloc as PartyBloc | null,
            partyStatus: p.party_status ?? null,
          },
        ]
      }),
    )

    const parties: PartyAggregate[] = latestAggs
      .map((a) => {
        const party = partyMap.get(a.party_id)
        return {
          partyId: a.party_id,
          partyName: party?.name ?? `#${a.party_id}`,
          partyShortName: party?.shortName ?? null,
          partyColor: party?.color ?? null,
          partyLogoUrl: party?.logoUrl ?? null,
          bloc: party?.bloc ?? null,
          partyStatus: party?.partyStatus ?? null,
          seatsAvg: Number(a.seats_avg),
          pollCount: a.poll_count,
        }
      })
      .sort((a, b) => b.seatsAvg - a.seatsAvg)

    const blocTotals = { coalition: 0, opposition: 0, unaligned: 0 }
    for (const p of parties) {
      if (p.bloc === 'coalition') blocTotals.coalition += p.seatsAvg
      else if (p.bloc === 'opposition') blocTotals.opposition += p.seatsAvg
      else if (p.bloc === 'unaligned') blocTotals.unaligned += p.seatsAvg
    }

    setCurrent({
      asOfDate: latestDate,
      method,
      parties,
      blocTotals,
    })

    const { data: lineageRows } = await supabase
      .from('party_lineage')
      .select('*')
      .order('event_date', { ascending: true })

    setLineage((lineageRows ?? []) as PartyLineageRow[])

    const byParty = new Map<number, TrendPoint[]>()
    for (const a of typedAggs) {
      const list = byParty.get(a.party_id) ?? []
      list.push({ date: a.as_of_date, seatsAvg: Number(a.seats_avg) })
      byParty.set(a.party_id, list)
    }

    const lineageEvents = (lineageRows ?? []) as PartyLineageRow[]
    const breakDatesByParty = new Map<number, string[]>()
    for (const event of lineageEvents) {
      if (event.predecessor_id) {
        const dates = breakDatesByParty.get(event.predecessor_id) ?? []
        dates.push(event.event_date)
        breakDatesByParty.set(event.predecessor_id, dates)
      }
    }

    const series: PartyTrendSeries[] = []
    for (const [partyId, points] of byParty) {
      const sorted = points.sort((a, b) => a.date.localeCompare(b.date))
      const breaks = breakDatesByParty.get(partyId) ?? []
      const segments: TrendPoint[][] = [[]]

      for (const point of sorted) {
        const lastSegment = segments[segments.length - 1]
        if (
          breaks.some(
            (b) => b <= point.date && lastSegment.some((p) => p.date < b),
          ) &&
          lastSegment.length > 0
        ) {
          segments.push([])
        }
        segments[segments.length - 1].push(point)
      }

      const party = partyMap.get(partyId)
      series.push({
        partyId,
        partyName: party?.name ?? `#${partyId}`,
        partyShortName: party?.shortName ?? null,
        partyColor: party?.color ?? null,
        partyLogoUrl: party?.logoUrl ?? null,
        segments: segments.filter((s) => s.length > 0),
      })
    }

    setHistorical(series.sort((a, b) => a.partyName.localeCompare(b.partyName, 'he')))
    setLoading(false)
  }, [method])

  useEffect(() => {
    void fetchAggregates()
  }, [fetchAggregates])

  return {
    current,
    historical,
    lineage,
    loading,
    error,
    method,
    setMethod,
    refetch: fetchAggregates,
  }
}

import { useCallback, useEffect, useState } from 'react'
import {
  supabase,
  supabaseConfigError,
  type ElectionCandidateRow,
  type ElectionParty,
  type KnessetMembershipTenureRow,
} from '../lib/supabase'
import { computeMemberTenureStats } from '../lib/knessetTenure'
import type { CandidateMapPin } from './useElectionCandidates'

export type ElectionOverviewMapPin = CandidateMapPin & {
  partyId: number
  partyName: string
  partyColor: string | null
}

export type UseAllElectionMapPinsResult = {
  pins: ElectionOverviewMapPin[]
  loading: boolean
  error: string | null
}

function unwrapRelation<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) {
    return value[0] ?? null
  }

  return value ?? null
}

function toNumber(value: string | number | null): number | null {
  if (value === null) {
    return null
  }

  const next = Number(value)
  return Number.isFinite(next) ? next : null
}

function buildTenureMap(
  tenureRows: KnessetMembershipTenureRow[],
): Map<number, { totalDaysInKnesset: number; totalYearsInKnesset: number }> {
  const membershipsByPerson = new Map<number, KnessetMembershipTenureRow[]>()

  for (const row of tenureRows) {
    const existing = membershipsByPerson.get(row.person_id) ?? []
    existing.push(row)
    membershipsByPerson.set(row.person_id, existing)
  }

  const tenureMap = new Map<
    number,
    { totalDaysInKnesset: number; totalYearsInKnesset: number }
  >()

  for (const [personId, memberships] of membershipsByPerson) {
    const tenure = computeMemberTenureStats(
      memberships.map((membership) => ({
        startDate: membership.start_date ?? '',
        endDate: membership.end_date,
      })),
      null,
    )

    tenureMap.set(personId, {
      totalDaysInKnesset: tenure.totalDaysInKnesset,
      totalYearsInKnesset: tenure.totalYearsInKnesset,
    })
  }

  return tenureMap
}

export function useAllElectionMapPins(
  parties: ElectionParty[],
): UseAllElectionMapPinsResult {
  const [pins, setPins] = useState<ElectionOverviewMapPin[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchPins = useCallback(async () => {
    setLoading(true)
    setError(null)

    if (supabaseConfigError || !supabase) {
      setError(supabaseConfigError ?? 'Supabase client is not configured')
      setPins([])
      setLoading(false)
      return
    }

    if (parties.length === 0) {
      setPins([])
      setLoading(false)
      return
    }

    const partyIds = parties.map((party) => party.id)
    const partyById = new Map(
      parties.map((party) => [
        party.id,
        {
          name: party.shortName ?? party.name,
          color: party.color,
        },
      ]),
    )

    const { data, error: queryError } = await supabase
      .from('election_candidates')
      .select(
        'id, party_id, person_id, city, latitude, longitude, person:people(full_name, image_url)',
      )
      .in('party_id', partyIds)
      .not('city', 'is', null)
      .not('latitude', 'is', null)
      .not('longitude', 'is', null)

    if (queryError) {
      setError(queryError.message)
      setPins([])
      setLoading(false)
      return
    }

    const rows = (data ?? []) as unknown as ElectionCandidateRow[]
    const personIds = [
      ...new Set(rows.map((row) => row.person_id).filter(Boolean)),
    ]

    if (personIds.length === 0) {
      setPins([])
      setLoading(false)
      return
    }

    const { data: membershipData, error: membershipError } = await supabase
      .from('knesset_memberships')
      .select('person_id, start_date, end_date, knesset:knessets(knesset_number)')
      .in('person_id', personIds)

    if (membershipError) {
      setError(membershipError.message)
      setPins([])
      setLoading(false)
      return
    }

    const tenureMap = buildTenureMap(
      (membershipData ?? []) as unknown as KnessetMembershipTenureRow[],
    )

    const nextPins: ElectionOverviewMapPin[] = []

    for (const row of rows) {
      const latitude = toNumber(row.latitude)
      const longitude = toNumber(row.longitude)
      const city = row.city
      const party = partyById.get(row.party_id)

      if (latitude === null || longitude === null || !city || !party) {
        continue
      }

      const person = unwrapRelation(row.person)
      const tenure = tenureMap.get(row.person_id) ?? {
        totalDaysInKnesset: 0,
        totalYearsInKnesset: 0,
      }

      nextPins.push({
        id: row.id,
        fullName: person?.full_name ?? 'מועמד/ת',
        city,
        imageUrl: person?.image_url ?? null,
        latitude,
        longitude,
        totalDaysInKnesset: tenure.totalDaysInKnesset,
        totalYearsInKnesset: tenure.totalYearsInKnesset,
        partyId: row.party_id,
        partyName: party.name,
        partyColor: party.color,
      })
    }

    setPins(nextPins)
    setLoading(false)
  }, [parties])

  useEffect(() => {
    void fetchPins()
  }, [fetchPins])

  return { pins, loading, error }
}

import { useEffect, useMemo, useState } from 'react'
import {
  supabase,
  supabaseConfigError,
  type ElectionCandidatePerson,
  type ElectionCandidateRow,
  type ElectionMembershipRow,
} from '../lib/supabase'

export type ElectionCandidate = {
  id: number
  partyId: number
  personId: number
  listPosition: number
  fullName: string
  imageUrl: string | null
  birthDate: string | null
  gender: string | null
  description: string | null
  city: string | null
  latitude: number | null
  longitude: number | null
  isNewMk: boolean
}

export type ElectionStat = {
  value: number | null
  count: number
  total: number
}

export type ElectionCandidateStats = {
  total: number
  averageAge: ElectionStat
  women: ElectionStat
  newMks: ElectionStat
}

export type CandidateMapPin = {
  id: number
  fullName: string
  city: string
  latitude: number
  longitude: number
}

export type UseElectionCandidatesResult = {
  candidates: ElectionCandidate[]
  stats: ElectionCandidateStats
  mapPins: CandidateMapPin[]
  loading: boolean
  error: string | null
}

const EMPTY_STATS: ElectionCandidateStats = {
  total: 0,
  averageAge: { value: null, count: 0, total: 0 },
  women: { value: null, count: 0, total: 0 },
  newMks: { value: null, count: 0, total: 0 },
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

function calculateAge(birthDate: string | null): number | null {
  if (!birthDate) {
    return null
  }

  const [year, month, day] = birthDate.slice(0, 10).split('-').map(Number)

  if (!year || !month || !day) {
    return null
  }

  const today = new Date()
  let age = today.getFullYear() - year
  const currentMonth = today.getMonth() + 1
  const currentDay = today.getDate()

  if (currentMonth < month || (currentMonth === month && currentDay < day)) {
    age -= 1
  }

  return age >= 0 && age < 130 ? age : null
}

function percentage(count: number, total: number): number | null {
  if (total === 0) {
    return null
  }

  return Math.round((count / total) * 100)
}

function average(values: number[]): number | null {
  if (values.length === 0) {
    return null
  }

  const sum = values.reduce((total, value) => total + value, 0)
  return Math.round((sum / values.length) * 10) / 10
}

function normalizeCandidate(
  row: ElectionCandidateRow,
  servedPersonIds: Set<number>,
): ElectionCandidate {
  const person = unwrapRelation<ElectionCandidatePerson>(row.person)

  return {
    id: row.id,
    partyId: row.party_id,
    personId: row.person_id,
    listPosition: row.list_position,
    fullName: person?.full_name ?? 'מועמד/ת',
    imageUrl: person?.image_url ?? null,
    birthDate: person?.birth_date ?? null,
    gender: person?.gender ?? null,
    description: row.description,
    city: row.city,
    latitude: toNumber(row.latitude),
    longitude: toNumber(row.longitude),
    isNewMk: !servedPersonIds.has(row.person_id),
  }
}

function buildStats(candidates: ElectionCandidate[]): ElectionCandidateStats {
  if (candidates.length === 0) {
    return EMPTY_STATS
  }

  const ages = candidates
    .map((candidate) => calculateAge(candidate.birthDate))
    .filter((age): age is number => age !== null)
  const genderKnown = candidates.filter((candidate) => candidate.gender)
  const womenCount = genderKnown.filter(
    (candidate) => candidate.gender === 'נקבה',
  ).length
  const newMkCount = candidates.filter((candidate) => candidate.isNewMk).length

  return {
    total: candidates.length,
    averageAge: {
      value: average(ages),
      count: ages.length,
      total: candidates.length,
    },
    women: {
      value: percentage(womenCount, genderKnown.length),
      count: womenCount,
      total: genderKnown.length,
    },
    newMks: {
      value: percentage(newMkCount, candidates.length),
      count: newMkCount,
      total: candidates.length,
    },
  }
}

function buildMapPins(candidates: ElectionCandidate[]): CandidateMapPin[] {
  return candidates.flatMap((candidate) => {
    if (
      candidate.latitude === null ||
      candidate.longitude === null ||
      !candidate.city
    ) {
      return []
    }

    return [
      {
        id: candidate.id,
        fullName: candidate.fullName,
        city: candidate.city,
        latitude: candidate.latitude,
        longitude: candidate.longitude,
      },
    ]
  })
}

export function useElectionCandidates(
  partyId: number | null,
): UseElectionCandidatesResult {
  const [candidates, setCandidates] = useState<ElectionCandidate[]>([])
  const [loading, setLoading] = useState(Boolean(partyId))
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function fetchCandidates() {
      setLoading(true)
      setError(null)

      if (!partyId) {
        setCandidates([])
        setLoading(false)
        return
      }

      if (supabaseConfigError || !supabase) {
        setError(supabaseConfigError ?? 'Supabase client is not configured')
        setCandidates([])
        setLoading(false)
        return
      }

      const { data, error: queryError } = await supabase
        .from('election_candidates')
        .select(
          'id, election_id, party_id, person_id, list_position, description, city, latitude, longitude, person:people(full_name, image_url, birth_date, gender)',
        )
        .eq('party_id', partyId)
        .order('list_position', { ascending: true })

      if (cancelled) {
        return
      }

      if (queryError) {
        setError(queryError.message)
        setCandidates([])
        setLoading(false)
        return
      }

      const rows = (data ?? []) as unknown as ElectionCandidateRow[]
      const personIds = [
        ...new Set(rows.map((row) => row.person_id).filter(Boolean)),
      ]

      if (personIds.length === 0) {
        setCandidates([])
        setLoading(false)
        return
      }

      const { data: membershipData, error: membershipError } = await supabase
        .from('knesset_memberships')
        .select('person_id')
        .in('person_id', personIds)

      if (cancelled) {
        return
      }

      if (membershipError) {
        setError(membershipError.message)
        setCandidates([])
        setLoading(false)
        return
      }

      const servedPersonIds = new Set(
        ((membershipData ?? []) as ElectionMembershipRow[]).map(
          (row) => row.person_id,
        ),
      )

      setCandidates(rows.map((row) => normalizeCandidate(row, servedPersonIds)))
      setLoading(false)
    }

    void fetchCandidates()

    return () => {
      cancelled = true
    }
  }, [partyId])

  const stats = useMemo(() => buildStats(candidates), [candidates])
  const mapPins = useMemo(() => buildMapPins(candidates), [candidates])

  return { candidates, stats, mapPins, loading, error }
}

import { useEffect, useMemo, useState } from 'react'
import {
  supabase,
  supabaseConfigError,
  type KnessetMembershipRow,
  type KnessetMembershipTenureRow,
  type KnessetOption,
  type MinisterAppointmentRow,
} from '../lib/supabase'
import {
  buildFactionGroups,
  buildHemicycleLayout,
  resolveFactionColor,
  type FactionGroup,
  type PlacedMember,
} from '../lib/hemicycle'
import {
  computeMemberTenureStats,
  type MemberTenureStats,
} from '../lib/knessetTenure'
import {
  buildMinisterRolesMap,
  mergeAdditionalRoles,
} from '../lib/memberRoles'

export type KnessetMember = {
  id: number
  factionId: number | null
  fullName: string
  imageUrl: string | null
  factionName: string | null
  factionColor: string | null
  factionLogoUrl: string | null
  isCoalition: boolean
  knessetNumber: number | null
  firstElectedYear: number | null
  totalDaysInKnesset: number
  totalYearsInKnesset: number
  additionalRoles: string[]
}

export type UseKnessetMembersResult = {
  members: KnessetMember[]
  placedMembers: PlacedMember[]
  factionGroups: FactionGroup[]
  coalitionCount: number
  oppositionCount: number
  hasCoalitionData: boolean
  loading: boolean
  error: string | null
}

function unwrapRelation<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) {
    return value[0] ?? null
  }

  return value ?? null
}

function toDateString(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function dedupeByPerson(rows: KnessetMembershipRow[]): KnessetMembershipRow[] {
  const byPerson = new Map<number, KnessetMembershipRow>()

  for (const row of rows) {
    const existing = byPerson.get(row.person_id)

    if (!existing) {
      byPerson.set(row.person_id, row)
      continue
    }

    const existingStart = existing.start_date ?? ''
    const rowStart = row.start_date ?? ''

    if (rowStart > existingStart) {
      byPerson.set(row.person_id, row)
    }
  }

  return [...byPerson.values()]
}

function buildTenureMap(
  tenureRows: KnessetMembershipTenureRow[],
  currentKnessetByPerson: Map<number, number | null>,
): Map<number, MemberTenureStats> {
  const membershipsByPerson = new Map<number, KnessetMembershipTenureRow[]>()

  for (const row of tenureRows) {
    const existing = membershipsByPerson.get(row.person_id) ?? []
    existing.push(row)
    membershipsByPerson.set(row.person_id, existing)
  }

  const tenureMap = new Map<number, MemberTenureStats>()

  for (const [personId, memberships] of membershipsByPerson) {
    tenureMap.set(
      personId,
      computeMemberTenureStats(
        memberships.map((membership) => ({
          startDate: membership.start_date ?? '',
          endDate: membership.end_date,
        })),
        currentKnessetByPerson.get(personId) ?? null,
      ),
    )
  }

  return tenureMap
}

function normalizeMembers(
  rows: KnessetMembershipRow[],
  tenureMap: Map<number, MemberTenureStats>,
  ministerRolesMap: Map<number, string[]>,
): KnessetMember[] {
  return rows.map((row) => {
    const person = unwrapRelation(row.person)
    const faction = unwrapRelation(row.faction)
    const knesset = unwrapRelation(row.knesset)
    const factionName = faction?.short_name ?? faction?.name ?? null
    const tenure = tenureMap.get(row.person_id) ?? {
      knessetNumber: knesset?.knesset_number ?? null,
      firstElectedYear: null,
      totalDaysInKnesset: 0,
      totalYearsInKnesset: 0,
    }

    return {
      id: row.id,
      factionId: row.faction_id,
      fullName: person?.full_name ?? 'חבר/ת כנסת',
      imageUrl: person?.image_url ?? null,
      factionName,
      factionColor: resolveFactionColor(
        row.faction_id,
        faction?.color,
        factionName,
      ),
      factionLogoUrl: faction?.logo_url ?? null,
      isCoalition: faction?.is_coalition ?? false,
      knessetNumber: tenure.knessetNumber ?? knesset?.knesset_number ?? null,
      firstElectedYear: tenure.firstElectedYear,
      totalDaysInKnesset: tenure.totalDaysInKnesset,
      totalYearsInKnesset: tenure.totalYearsInKnesset,
      additionalRoles: mergeAdditionalRoles(
        row.duty_desc,
        ministerRolesMap.get(row.person_id) ?? [],
      ),
    }
  })
}

export function useKnessetMembers(
  term: KnessetOption | null,
): UseKnessetMembersResult {
  const [members, setMembers] = useState<KnessetMember[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [loadedTermId, setLoadedTermId] = useState<number | null>(null)

  useEffect(() => {
    let cancelled = false

    async function fetchMembers() {
      setLoading(true)
      setError(null)

      if (!term) {
        setMembers([])
        setLoadedTermId(null)
        setLoading(false)
        return
      }

      if (supabaseConfigError || !supabase) {
        setError(supabaseConfigError ?? 'Supabase client is not configured')
        setMembers([])
        setLoadedTermId(term.id)
        setLoading(false)
        return
      }

      const refDate = term.endDate?.slice(0, 10) ?? toDateString(new Date())
      const knessetId = term.id

      const { data, error: queryError } = await supabase
        .from('knesset_memberships')
        .select(
          'id, person_id, faction_id, start_date, duty_desc, person:people(full_name, image_url), faction:knesset_factions(name, short_name, logo_url, color, is_coalition), knesset:knessets(knesset_number, start_date, end_date)',
        )
        .eq('knesset_id', knessetId)
        .lte('start_date', refDate)
        .or(`end_date.is.null,end_date.gte.${refDate}`)
        .order('faction_id')

      if (cancelled) {
        return
      }

      if (queryError) {
        setError(queryError.message)
        setMembers([])
        setLoadedTermId(knessetId)
        setLoading(false)
        return
      }

      const snapshotRows = dedupeByPerson(
        (data ?? []) as unknown as KnessetMembershipRow[],
      )
      const personIds = [
        ...new Set(snapshotRows.map((row) => row.person_id).filter(Boolean)),
      ]

      if (personIds.length === 0) {
        setMembers([])
        setLoadedTermId(knessetId)
        setLoading(false)
        return
      }

      const [tenureResult, rolesResult] = await Promise.all([
        supabase
          .from('knesset_memberships')
          .select('person_id, start_date, end_date, knesset:knessets(knesset_number)')
          .in('person_id', personIds),
        supabase
          .from('minister_appointments')
          .select(
            'person_id, duty_desc, is_acting, office:offices(name, knesset_category_name)',
          )
          .in('person_id', personIds)
          .lte('start_date', refDate)
          .or(`end_date.is.null,end_date.gte.${refDate}`),
      ])

      if (cancelled) {
        return
      }

      if (tenureResult.error) {
        setError(tenureResult.error.message)
        setMembers([])
        setLoadedTermId(knessetId)
        setLoading(false)
        return
      }

      if (rolesResult.error) {
        setError(rolesResult.error.message)
        setMembers([])
        setLoadedTermId(knessetId)
        setLoading(false)
        return
      }

      const currentKnessetByPerson = new Map<number, number | null>(
        snapshotRows.map((row) => [
          row.person_id,
          unwrapRelation(row.knesset)?.knesset_number ?? null,
        ]),
      )

      const tenureMap = buildTenureMap(
        (tenureResult.data ?? []) as unknown as KnessetMembershipTenureRow[],
        currentKnessetByPerson,
      )

      const ministerRolesMap = buildMinisterRolesMap(
        (rolesResult.data ?? []) as unknown as MinisterAppointmentRow[],
      )

      setMembers(normalizeMembers(snapshotRows, tenureMap, ministerRolesMap))
      setLoadedTermId(knessetId)
      setLoading(false)
    }

    void fetchMembers()

    return () => {
      cancelled = true
    }
  }, [term])

  const hasCoalitionData = useMemo(
    () => members.some((member) => member.isCoalition),
    [members],
  )

  const coalitionCount = useMemo(
    () => members.filter((member) => member.isCoalition).length,
    [members],
  )

  const oppositionCount = useMemo(
    () => members.filter((member) => !member.isCoalition).length,
    [members],
  )

  const memberInputs = useMemo(
    () =>
      members.map((member) => ({
        factionId: member.factionId,
        factionName: member.factionName,
        factionColor: member.factionColor,
        factionLogoUrl: member.factionLogoUrl,
        isCoalition: member.isCoalition,
        fullName: member.fullName,
        imageUrl: member.imageUrl,
        knessetNumber: member.knessetNumber,
        firstElectedYear: member.firstElectedYear,
        totalDaysInKnesset: member.totalDaysInKnesset,
        totalYearsInKnesset: member.totalYearsInKnesset,
        additionalRoles: member.additionalRoles,
      })),
    [members],
  )

  const placedMembers = useMemo(
    () =>
      buildHemicycleLayout(memberInputs, {
        splitByBloc: hasCoalitionData,
      }),
    [memberInputs, hasCoalitionData],
  )

  const factionGroups = useMemo(
    () => buildFactionGroups(memberInputs, { splitByBloc: hasCoalitionData }),
    [memberInputs, hasCoalitionData],
  )

  return {
    members,
    placedMembers,
    factionGroups,
    coalitionCount,
    oppositionCount,
    hasCoalitionData,
    loading: loading || (term !== null && loadedTermId !== term.id && !error),
    error,
  }
}

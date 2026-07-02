import { useEffect, useMemo, useState } from 'react'
import {
  ACTIVE_KNESSET_ID,
  supabase,
  supabaseConfigError,
  type KnessetMembershipRow,
} from '../lib/supabase'
import {
  buildFactionGroups,
  buildHemicycleLayout,
  type FactionGroup,
  type PlacedMember,
} from '../lib/hemicycle'

export type KnessetMember = {
  id: number
  factionId: number | null
  fullName: string
  imageUrl: string | null
  factionName: string | null
  factionColor: string | null
  isCoalition: boolean
}

export type UseKnessetMembersResult = {
  members: KnessetMember[]
  placedMembers: PlacedMember[]
  factionGroups: FactionGroup[]
  coalitionCount: number
  oppositionCount: number
  loading: boolean
  error: string | null
}

function unwrapRelation<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) {
    return value[0] ?? null
  }

  return value ?? null
}

function normalizeMembers(rows: KnessetMembershipRow[]): KnessetMember[] {
  return rows.map((row) => {
    const person = unwrapRelation(row.person)
    const faction = unwrapRelation(row.faction)

    return {
      id: row.id,
      factionId: row.faction_id,
      fullName: person?.full_name ?? 'חבר/ת כנסת',
      imageUrl: person?.image_url ?? null,
      factionName: faction?.name ?? null,
      factionColor: faction?.color ?? null,
      isCoalition: faction?.is_coalition ?? false,
    }
  })
}

export function useKnessetMembers(): UseKnessetMembersResult {
  const [members, setMembers] = useState<KnessetMember[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function fetchMembers() {
      setLoading(true)
      setError(null)

      if (supabaseConfigError || !supabase) {
        setError(supabaseConfigError ?? 'Supabase client is not configured')
        setMembers([])
        setLoading(false)
        return
      }

      const { data, error: queryError } = await supabase
        .from('knesset_memberships')
        .select(
          'id, faction_id, person:people(full_name, image_url), faction:knesset_factions(name, color, is_coalition)',
        )
        .eq('knesset_id', ACTIVE_KNESSET_ID)
        .is('end_date', null)
        .order('faction_id')

      if (cancelled) {
        return
      }

      if (queryError) {
        setError(queryError.message)
        setMembers([])
        setLoading(false)
        return
      }

      setMembers(normalizeMembers((data ?? []) as unknown as KnessetMembershipRow[]))
      setLoading(false)
    }

    void fetchMembers()

    return () => {
      cancelled = true
    }
  }, [])

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
        isCoalition: member.isCoalition,
        fullName: member.fullName,
        imageUrl: member.imageUrl,
      })),
    [members],
  )

  const placedMembers = useMemo(
    () => buildHemicycleLayout(memberInputs),
    [memberInputs],
  )

  const factionGroups = useMemo(
    () => buildFactionGroups(memberInputs),
    [memberInputs],
  )

  return {
    members,
    placedMembers,
    factionGroups,
    coalitionCount,
    oppositionCount,
    loading,
    error,
  }
}

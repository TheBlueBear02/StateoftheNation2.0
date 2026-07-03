import { useEffect, useMemo, useState } from 'react'
import {
  buildGovernmentOfficeGroups,
  buildGovernmentPyramidTiers,
  classifyGovernmentRole,
  formatGovernmentRoleTitle,
  type GovernmentAppointment,
  type GovernmentOfficeGroup,
  type GovernmentPyramidTier,
} from '../lib/governmentStructure'
import { resolveFactionColor } from '../lib/hemicycle'
import {
  supabase,
  supabaseConfigError,
  type GovernmentAppointmentRow,
  type GovernmentMembershipFactionRow,
  type GovernmentOption,
  type KnessetFaction,
  type KnessetPerson,
  type OfficeRow,
} from '../lib/supabase'

export type UseGovernmentMinistersResult = {
  appointments: GovernmentAppointment[]
  pyramidTiers: GovernmentPyramidTier[]
  officeGroups: GovernmentOfficeGroup[]
  ministerAndDeputyCount: number
  officeCount: number
  loading: boolean
  error: string | null
}

type FactionSnapshot = {
  factionId: number | null
  factionName: string | null
  factionColor: string | null
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

function dedupeAppointmentRows(
  rows: GovernmentAppointmentRow[],
): GovernmentAppointmentRow[] {
  const byPersonAndOffice = new Map<string, GovernmentAppointmentRow>()

  for (const row of rows) {
    const key = `${row.person_id}-${row.office_id ?? 'none'}`
    const existing = byPersonAndOffice.get(key)

    if (!existing) {
      byPersonAndOffice.set(key, row)
      continue
    }

    const existingStart = existing.start_date ?? ''
    const rowStart = row.start_date ?? ''

    if (rowStart > existingStart) {
      byPersonAndOffice.set(key, row)
    }
  }

  return [...byPersonAndOffice.values()]
}

function buildFactionMap(
  rows: GovernmentMembershipFactionRow[],
): Map<number, FactionSnapshot> {
  const byPerson = new Map<number, GovernmentMembershipFactionRow>()

  for (const row of rows) {
    const existing = byPerson.get(row.person_id)

    if (!existing || (row.start_date ?? '') > (existing.start_date ?? '')) {
      byPerson.set(row.person_id, row)
    }
  }

  const result = new Map<number, FactionSnapshot>()

  for (const [personId, row] of byPerson) {
    const faction = unwrapRelation<KnessetFaction>(row.faction)
    const factionName = faction?.short_name ?? faction?.name ?? null

    result.set(personId, {
      factionId: row.faction_id,
      factionName,
      factionColor: resolveFactionColor(row.faction_id, faction?.color, factionName),
    })
  }

  return result
}

function normalizeAppointments(
  rows: GovernmentAppointmentRow[],
  factionMap: Map<number, FactionSnapshot>,
): GovernmentAppointment[] {
  return rows.map((row) => {
    const person = unwrapRelation<KnessetPerson>(row.person)
    const office = unwrapRelation<OfficeRow>(row.office)
    const officeName =
      office?.knesset_category_name?.trim() || office?.name?.trim() || 'משרד ללא שם'
    const roleTitle = formatGovernmentRoleTitle({
      dutyDesc: row.duty_desc,
      officeName,
      isActing: row.is_acting,
    })
    const faction = factionMap.get(row.person_id)

    return {
      id: row.id,
      personId: row.person_id,
      officeId: row.office_id,
      fullName: person?.full_name ?? 'שר/ה',
      imageUrl: person?.image_url ?? null,
      officeName,
      roleTitle,
      roleKind: classifyGovernmentRole(row.duty_desc, officeName),
      isActing: row.is_acting,
      factionId: faction?.factionId ?? null,
      factionName: faction?.factionName ?? null,
      factionColor: faction?.factionColor ?? null,
      additionalRoles: [roleTitle],
    }
  })
}

export function useGovernmentMinisters(
  government: GovernmentOption | null,
): UseGovernmentMinistersResult {
  const [appointments, setAppointments] = useState<GovernmentAppointment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function fetchMinisters() {
      setLoading(true)
      setError(null)

      if (!government) {
        setAppointments([])
        setLoading(false)
        return
      }

      if (supabaseConfigError || !supabase) {
        setError(supabaseConfigError ?? 'Supabase client is not configured')
        setAppointments([])
        setLoading(false)
        return
      }

      const refDate = government.endDate?.slice(0, 10) ?? toDateString(new Date())

      const { data, error: queryError } = await supabase
        .from('minister_appointments')
        .select(
          'id, person_id, government_id, office_id, start_date, end_date, duty_desc, is_acting, person:people(full_name, image_url), office:offices(name, knesset_category_name)',
        )
        .eq('government_id', government.id)
        .lte('start_date', refDate)
        .or(`end_date.is.null,end_date.gte.${refDate}`)
        .order('office_id')

      if (cancelled) {
        return
      }

      if (queryError) {
        setError(queryError.message)
        setAppointments([])
        setLoading(false)
        return
      }

      const snapshotRows = dedupeAppointmentRows(
        (data ?? []) as unknown as GovernmentAppointmentRow[],
      )
      const personIds = [
        ...new Set(snapshotRows.map((row) => row.person_id).filter(Boolean)),
      ]

      if (personIds.length === 0) {
        setAppointments([])
        setLoading(false)
        return
      }

      let factionRows: GovernmentMembershipFactionRow[] = []

      if (government.knessetId) {
        const { data: factionData, error: factionError } = await supabase
          .from('knesset_memberships')
          .select(
            'person_id, faction_id, start_date, end_date, faction:knesset_factions(name, short_name, logo_url, color, is_coalition)',
          )
          .eq('knesset_id', government.knessetId)
          .in('person_id', personIds)
          .lte('start_date', refDate)
          .or(`end_date.is.null,end_date.gte.${refDate}`)
          .order('start_date', { ascending: false })

        if (cancelled) {
          return
        }

        if (factionError) {
          setError(factionError.message)
          setAppointments([])
          setLoading(false)
          return
        }

        factionRows = (factionData ?? []) as unknown as GovernmentMembershipFactionRow[]
      }

      setAppointments(
        normalizeAppointments(snapshotRows, buildFactionMap(factionRows)),
      )
      setLoading(false)
    }

    void fetchMinisters()

    return () => {
      cancelled = true
    }
  }, [government])

  const pyramidTiers = useMemo(
    () => buildGovernmentPyramidTiers(appointments),
    [appointments],
  )
  const officeGroups = useMemo(
    () => buildGovernmentOfficeGroups(appointments),
    [appointments],
  )
  const ministerAndDeputyCount = useMemo(
    () => new Set(appointments.map((appointment) => appointment.personId)).size,
    [appointments],
  )

  return {
    appointments,
    pyramidTiers,
    officeGroups,
    ministerAndDeputyCount,
    officeCount: officeGroups.length,
    loading,
    error,
  }
}

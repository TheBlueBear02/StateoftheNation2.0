import type { MinisterAppointmentRow, OfficeRow } from './supabase'

const GENERIC_KM_DUTIES = new Set(['חבר כנסת', 'חברת כנסת'])

function unwrapOffice(
  value: OfficeRow | OfficeRow[] | null | undefined,
): OfficeRow | null {
  if (Array.isArray(value)) {
    return value[0] ?? null
  }

  return value ?? null
}

export function formatMembershipDuty(dutyDesc: string | null | undefined): string | null {
  if (!dutyDesc?.trim()) {
    return null
  }

  const trimmed = dutyDesc.trim()

  if (GENERIC_KM_DUTIES.has(trimmed)) {
    return null
  }

  return trimmed
}

export function formatMinisterAppointmentRole(
  appointment: Pick<MinisterAppointmentRow, 'duty_desc' | 'is_acting' | 'office'>,
): string | null {
  if (appointment.duty_desc?.trim()) {
    return appointment.duty_desc.trim()
  }

  const office = unwrapOffice(appointment.office)
  const officeName = office?.knesset_category_name?.trim() || office?.name?.trim()

  if (!officeName) {
    return null
  }

  return appointment.is_acting ? `מ"מ ${officeName}` : officeName
}

export function mergeAdditionalRoles(
  membershipDuty: string | null | undefined,
  ministerRoles: string[],
): string[] {
  const roles: string[] = []
  const seen = new Set<string>()

  const membershipRole = formatMembershipDuty(membershipDuty)

  if (membershipRole) {
    roles.push(membershipRole)
    seen.add(membershipRole)
  }

  for (const role of ministerRoles) {
    if (!seen.has(role)) {
      roles.push(role)
      seen.add(role)
    }
  }

  return roles
}

export function buildMinisterRolesMap(
  rows: MinisterAppointmentRow[],
): Map<number, string[]> {
  const byPerson = new Map<number, string[]>()

  for (const row of rows) {
    const role = formatMinisterAppointmentRole(row)

    if (!role) {
      continue
    }

    const existing = byPerson.get(row.person_id) ?? []

    if (!existing.includes(role)) {
      existing.push(role)
    }

    byPerson.set(row.person_id, existing)
  }

  return byPerson
}

export type GovernmentRoleKind =
  | 'primeMinister'
  | 'alternatePrimeMinister'
  | 'deputyPrimeMinister'
  | 'minister'
  | 'deputyMinister'

export type GovernmentAppointment = {
  id: number
  personId: number
  officeId: number | null
  fullName: string
  imageUrl: string | null
  officeName: string
  roleTitle: string
  roleKind: GovernmentRoleKind
  isActing: boolean
  factionId: number | null
  factionName: string | null
  factionColor: string | null
  additionalRoles: string[]
}

export type GovernmentPyramidMember = {
  personId: number
  fullName: string
  imageUrl: string | null
  officeName: string
  roleTitle: string
  roleKind: GovernmentRoleKind
  factionId: number | null
  factionName: string | null
  factionColor: string | null
  additionalRoles: string[]
}

export type GovernmentPyramidTier = {
  id: string
  label: string
  members: GovernmentPyramidMember[]
}

export type GovernmentOfficeGroup = {
  officeId: number | null
  officeName: string
  ministers: GovernmentAppointment[]
  deputies: GovernmentAppointment[]
}

const ROLE_PRIORITY: Record<GovernmentRoleKind, number> = {
  primeMinister: 0,
  alternatePrimeMinister: 1,
  deputyPrimeMinister: 2,
  minister: 3,
  deputyMinister: 4,
}

function normalizeText(value: string | null | undefined): string {
  return value?.trim().replace(/\s+/g, ' ') ?? ''
}

function startsWithAny(value: string, prefixes: string[]): boolean {
  return prefixes.some((prefix) => value.startsWith(prefix))
}

function unique(values: string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []

  for (const value of values) {
    if (!value || seen.has(value)) {
      continue
    }

    seen.add(value)
    result.push(value)
  }

  return result
}

function comparePeople(
  left: Pick<GovernmentAppointment, 'fullName' | 'roleKind'>,
  right: Pick<GovernmentAppointment, 'fullName' | 'roleKind'>,
): number {
  const roleCompare = ROLE_PRIORITY[left.roleKind] - ROLE_PRIORITY[right.roleKind]

  if (roleCompare !== 0) {
    return roleCompare
  }

  return left.fullName.localeCompare(right.fullName, 'he')
}

function isPrimeMinisterOffice(officeName: string): boolean {
  return officeName.includes('ראש הממשלה')
}

function isPrimeMinisterRole(duty: string): boolean {
  return (
    duty === 'ראש הממשלה' ||
    duty.startsWith('ראש הממשלה ו') ||
    duty.startsWith('ראש הממשלה,')
  )
}

export function classifyGovernmentRole(
  dutyDesc: string | null | undefined,
  officeName: string | null | undefined,
): GovernmentRoleKind {
  const duty = normalizeText(dutyDesc)
  const office = normalizeText(officeName)

  if (
    startsWithAny(duty, ['סגן שר', 'סגנית שר']) ||
    startsWithAny(office, ['סגן שר', 'סגנית שר'])
  ) {
    return 'deputyMinister'
  }

  if (startsWithAny(duty, ['שר במשרד ראש הממשלה', 'שרה במשרד ראש הממשלה'])) {
    return 'minister'
  }

  if (duty.includes('ראש הממשלה החלופי')) {
    return 'alternatePrimeMinister'
  }

  if (isPrimeMinisterRole(duty)) {
    return 'primeMinister'
  }

  if (
    duty.includes('סגן ראש הממשלה') ||
    duty.includes('סגנית ראש הממשלה') ||
    duty.includes('משנה לראש הממשלה')
  ) {
    return 'deputyPrimeMinister'
  }

  return 'minister'
}

export function formatGovernmentRoleTitle({
  dutyDesc,
  officeName,
  isActing,
}: {
  dutyDesc: string | null | undefined
  officeName: string | null | undefined
  isActing: boolean
}): string {
  const duty = normalizeText(dutyDesc)
  const title = duty || normalizeText(officeName) || 'שר/ה'

  return isActing && !title.startsWith('מ"מ') ? `מ"מ ${title}` : title
}

function toPyramidMember(
  appointment: GovernmentAppointment,
): GovernmentPyramidMember {
  return {
    personId: appointment.personId,
    fullName: appointment.fullName,
    imageUrl: appointment.imageUrl,
    officeName: appointment.officeName,
    roleTitle: appointment.roleTitle,
    roleKind: appointment.roleKind,
    factionId: appointment.factionId,
    factionName: appointment.factionName,
    factionColor: appointment.factionColor,
    additionalRoles: appointment.additionalRoles,
  }
}

function dedupePyramidMembers(
  appointments: GovernmentAppointment[],
): GovernmentPyramidMember[] {
  const byPerson = new Map<number, GovernmentPyramidMember>()

  for (const appointment of appointments) {
    if (appointment.roleKind === 'deputyMinister') {
      continue
    }

    const existing = byPerson.get(appointment.personId)

    if (!existing) {
      byPerson.set(appointment.personId, toPyramidMember(appointment))
      continue
    }

    const existingPriority = ROLE_PRIORITY[existing.roleKind]
    const appointmentPriority = ROLE_PRIORITY[appointment.roleKind]
    const next =
      appointmentPriority < existingPriority
        ? toPyramidMember(appointment)
        : existing

    byPerson.set(appointment.personId, {
      ...next,
      additionalRoles: unique([
        ...existing.additionalRoles,
        ...appointment.additionalRoles,
      ]),
    })
  }

  return [...byPerson.values()].sort(comparePeople)
}

function orderPrimeOfficeTier(
  members: GovernmentPyramidMember[],
): GovernmentPyramidMember[] {
  const sorted = [...members].sort((left, right) => {
    if (left.roleKind === 'primeMinister' && right.roleKind !== 'primeMinister') {
      return 1
    }

    if (right.roleKind === 'primeMinister' && left.roleKind !== 'primeMinister') {
      return -1
    }

    return comparePeople(left, right)
  })
  const primeIndex = sorted.findIndex((member) => member.roleKind === 'primeMinister')

  if (primeIndex === -1) {
    return sorted
  }

  const [primeMinister] = sorted.splice(primeIndex, 1)
  sorted.splice(Math.floor(sorted.length / 2), 0, primeMinister)

  return sorted
}

export function buildGovernmentPyramidTiers(
  appointments: GovernmentAppointment[],
): GovernmentPyramidTier[] {
  const members = dedupePyramidMembers(appointments)
  const primeOfficeTier = orderPrimeOfficeTier(members.filter(
    (member) =>
      member.roleKind === 'primeMinister' ||
      member.roleKind === 'alternatePrimeMinister' ||
      member.roleKind === 'deputyPrimeMinister' ||
      (member.roleKind === 'minister' && isPrimeMinisterOffice(member.officeName)),
  ))
  const ministers = members.filter(
    (member) =>
      member.roleKind === 'minister' && !isPrimeMinisterOffice(member.officeName),
  )
  const tiers: GovernmentPyramidTier[] = []

  if (primeOfficeTier.length > 0) {
    tiers.push({ id: 'prime-minister', label: 'ראשות הממשלה', members: primeOfficeTier })
  }

  if (ministers.length > 0) {
    tiers.push({ id: 'ministers', label: 'שרים', members: ministers })
  }

  return tiers
}

function compareOffices(
  left: GovernmentOfficeGroup,
  right: GovernmentOfficeGroup,
): number {
  const leftIsPrime = left.officeName.includes('ראש הממשלה')
  const rightIsPrime = right.officeName.includes('ראש הממשלה')

  if (leftIsPrime !== rightIsPrime) {
    return leftIsPrime ? -1 : 1
  }

  return left.officeName.localeCompare(right.officeName, 'he')
}

export function buildGovernmentOfficeGroups(
  appointments: GovernmentAppointment[],
): GovernmentOfficeGroup[] {
  const byOffice = new Map<string, GovernmentOfficeGroup>()

  for (const appointment of appointments) {
    const key = `${appointment.officeId ?? 'none'}-${appointment.officeName}`
    const existing = byOffice.get(key) ?? {
      officeId: appointment.officeId,
      officeName: appointment.officeName,
      ministers: [],
      deputies: [],
    }

    if (appointment.roleKind === 'deputyMinister') {
      existing.deputies.push(appointment)
    } else {
      existing.ministers.push(appointment)
    }

    byOffice.set(key, existing)
  }

  return [...byOffice.values()]
    .map((group) => ({
      ...group,
      ministers: [...group.ministers].sort(comparePeople),
      deputies: [...group.deputies].sort(comparePeople),
    }))
    .sort(compareOffices)
}

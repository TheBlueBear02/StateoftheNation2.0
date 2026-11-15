/** Knessets that have committee sessions, for the committees-page picker. */

export type CommitteeKnessetOption = {
  id: number
  knessetNumber: number
  label: string
  isCurrent: boolean
}

export type SessionKnessetJoin = {
  id: number
  knesset_number: number
  knesset_name?: string | null
  is_active?: boolean | null
}

export type SessionCommitteeJoin = {
  knesset: SessionKnessetJoin | SessionKnessetJoin[] | null
}

export type SessionKnessetRow = {
  committee: SessionCommitteeJoin | SessionCommitteeJoin[] | null
}

function unwrapRelation<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) {
    return value[0] ?? null
  }
  return value ?? null
}

export function committeeKnessetLabel(
  knessetNumber: number,
  knessetName: string | null | undefined,
): string {
  const name = knessetName?.trim()
  if (name) {
    return name
  }
  return `הכנסת ה-${knessetNumber}`
}

/** Distinct knessets from session rows, newest number first. */
export function committeeKnessetsFromSessionRows(
  rows: SessionKnessetRow[],
): CommitteeKnessetOption[] {
  const byId = new Map<number, CommitteeKnessetOption>()
  for (const row of rows) {
    const committee = unwrapRelation(row.committee)
    const knesset = unwrapRelation(committee?.knesset)
    if (knesset?.id == null || knesset.knesset_number == null) {
      continue
    }
    if (byId.has(knesset.id)) {
      continue
    }
    byId.set(knesset.id, {
      id: knesset.id,
      knessetNumber: knesset.knesset_number,
      label: committeeKnessetLabel(
        knesset.knesset_number,
        knesset.knesset_name,
      ),
      isCurrent: knesset.is_active === true,
    })
  }
  return [...byId.values()].sort((a, b) => b.knessetNumber - a.knessetNumber)
}

/**
 * The requested Knesset when it has sessions; otherwise the current Knesset
 * if it has sessions; otherwise the newest Knesset that has sessions.
 */
export function resolveCommitteeKnesset(
  requestedNumber: number | null,
  options: CommitteeKnessetOption[],
): CommitteeKnessetOption | null {
  if (options.length === 0) {
    return null
  }
  const newestFirst = [...options].sort(
    (a, b) => b.knessetNumber - a.knessetNumber,
  )
  if (requestedNumber != null) {
    const requested = newestFirst.find(
      (option) => option.knessetNumber === requestedNumber,
    )
    if (requested) {
      return requested
    }
  }
  return (
    newestFirst.find((option) => option.isCurrent) ?? newestFirst[0] ?? null
  )
}

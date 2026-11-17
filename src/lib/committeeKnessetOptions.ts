/** Knessets that have committees, for the committees-page picker. */

export type CommitteeKnessetOption = {
  id: number
  knessetNumber: number
  label: string
  isCurrent: boolean
  endDate: string | null
}

export type SessionKnessetJoin = {
  id: number
  knesset_number: number
  knesset_name?: string | null
  is_active?: boolean | null
  end_date?: string | null
}

export type SessionCommitteeJoin = {
  knesset: SessionKnessetJoin | SessionKnessetJoin[] | null
}

export type SessionKnessetRow = {
  committee: SessionCommitteeJoin | SessionCommitteeJoin[] | null
}

export type CommitteeKnessetRow = {
  knesset: SessionKnessetJoin | SessionKnessetJoin[] | null
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

function optionFromKnesset(
  knesset: SessionKnessetJoin | null,
): CommitteeKnessetOption | null {
  if (knesset?.id == null || knesset.knesset_number == null) {
    return null
  }
  return {
    id: knesset.id,
    knessetNumber: knesset.knesset_number,
    label: committeeKnessetLabel(knesset.knesset_number, knesset.knesset_name),
    isCurrent: knesset.is_active === true,
    endDate: knesset.end_date ?? null,
  }
}

function distinctKnessetOptions(
  knessets: Array<SessionKnessetJoin | null>,
): CommitteeKnessetOption[] {
  const byId = new Map<number, CommitteeKnessetOption>()
  for (const knesset of knessets) {
    const option = optionFromKnesset(knesset)
    if (!option || byId.has(option.id)) {
      continue
    }
    byId.set(option.id, option)
  }
  return [...byId.values()].sort((a, b) => b.knessetNumber - a.knessetNumber)
}

/** Distinct knessets from session rows, newest number first. */
export function committeeKnessetsFromSessionRows(
  rows: SessionKnessetRow[],
): CommitteeKnessetOption[] {
  return distinctKnessetOptions(
    rows.map((row) => unwrapRelation(unwrapRelation(row.committee)?.knesset)),
  )
}

/** Distinct knessets from committee rows, newest number first. */
export function committeeKnessetsFromCommitteeRows(
  rows: CommitteeKnessetRow[],
): CommitteeKnessetOption[] {
  return distinctKnessetOptions(
    rows.map((row) => unwrapRelation(row.knesset)),
  )
}

/**
 * The requested Knesset when it has committees; otherwise the current Knesset
 * if it has committees; otherwise the newest Knesset that has committees.
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

import {
  DREAM_ALL_OFFICES,
  type DreamOfficeId,
} from './dreamGovernmentOffices'
import type { DreamOfficeSelection } from '../components/elections/dream/DreamOfficeSquare'

const PICKS_COOKIE = 'dream-gov-picks'
const PICKS_MAX_AGE_SECONDS = 60 * 60 * 24 * 180 // 180 days

const VALID_OFFICE_IDS = new Set<string>(
  DREAM_ALL_OFFICES.map((office) => office.id),
)

export type DreamGovStoredPick = {
  officeId: DreamOfficeId
  candidateId: number
  partyId: number
}

function readRawCookie(name: string): string | null {
  if (typeof document === 'undefined') return null
  const prefix = `${name}=`
  const parts = document.cookie.split(';')
  for (const part of parts) {
    const trimmed = part.trim()
    if (!trimmed.startsWith(prefix)) continue
    return decodeURIComponent(trimmed.slice(prefix.length))
  }
  return null
}

function writeRawCookie(name: string, value: string, maxAgeSeconds: number) {
  if (typeof document === 'undefined') return
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${maxAgeSeconds}; SameSite=Lax`
}

function clearRawCookie(name: string) {
  if (typeof document === 'undefined') return
  document.cookie = `${name}=; path=/; max-age=0; SameSite=Lax`
}

function isStoredPick(value: unknown): value is DreamGovStoredPick {
  if (!value || typeof value !== 'object') return false
  const row = value as Record<string, unknown>
  return (
    typeof row.officeId === 'string' &&
    VALID_OFFICE_IDS.has(row.officeId) &&
    Number.isInteger(row.candidateId) &&
    (row.candidateId as number) > 0 &&
    Number.isInteger(row.partyId) &&
    (row.partyId as number) > 0
  )
}

/** Compact cookie payload — IDs only (full portraits rehydrate from Supabase). */
export function loadDreamGovPicksFromCookie(): DreamGovStoredPick[] {
  try {
    const raw = readRawCookie(PICKS_COOKIE)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []

    const seen = new Set<string>()
    const picks: DreamGovStoredPick[] = []
    for (const item of parsed) {
      if (!isStoredPick(item)) continue
      if (seen.has(item.officeId)) continue
      seen.add(item.officeId)
      picks.push({
        officeId: item.officeId,
        candidateId: item.candidateId,
        partyId: item.partyId,
      })
    }
    return picks
  } catch {
    return []
  }
}

export function saveDreamGovPicksToCookie(
  selections: Partial<Record<DreamOfficeId, DreamOfficeSelection>>,
): void {
  const picks: DreamGovStoredPick[] = []
  for (const office of DREAM_ALL_OFFICES) {
    const selection = selections[office.id]
    if (!selection) continue
    picks.push({
      officeId: office.id,
      candidateId: selection.candidate.id,
      partyId: selection.party.id,
    })
  }

  if (picks.length === 0) {
    clearRawCookie(PICKS_COOKIE)
    return
  }

  try {
    writeRawCookie(PICKS_COOKIE, JSON.stringify(picks), PICKS_MAX_AGE_SECONDS)
  } catch {
    // ignore cookie / private-mode failures
  }
}

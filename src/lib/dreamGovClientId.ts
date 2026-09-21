const CLIENT_ID_KEY = 'dream-gov-client-id'
const HAS_SHARED_KEY = 'dream-gov-has-shared'

function createClientId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const rand = (Math.random() * 16) | 0
    const value = char === 'x' ? rand : (rand & 0x3) | 0x8
    return value.toString(16)
  })
}

/** Stable anonymous voter id for dream-government share upserts. */
export function getOrCreateDreamGovClientId(): string {
  if (typeof window === 'undefined') {
    return createClientId()
  }

  try {
    const existing = window.localStorage.getItem(CLIENT_ID_KEY)?.trim()
    if (
      existing &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        existing,
      )
    ) {
      return existing
    }
    const next = createClientId()
    window.localStorage.setItem(CLIENT_ID_KEY, next)
    return next
  } catch {
    return createClientId()
  }
}

/** Whether this browser has successfully shared at least once (show % bars). */
export function hasSharedDreamGovernment(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem(HAS_SHARED_KEY) === '1'
  } catch {
    return false
  }
}

export function markDreamGovernmentShared(): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(HAS_SHARED_KEY, '1')
  } catch {
    // ignore quota / private mode
  }
}

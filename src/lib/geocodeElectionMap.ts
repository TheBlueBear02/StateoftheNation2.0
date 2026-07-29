import { isDev, getElectionsEditSecret } from './runtimeEnv'

export type GeocodeElectionMapResult =
  | {
      ok: true
      message?: string
      geocoded: number
      failed: number
      total: number
      uniqueCities?: number
    }
  | { ok: false; error: string }

export async function geocodeElectionMap(
  partyId: number,
): Promise<GeocodeElectionMapResult> {
  if (!isDev) {
    return {
      ok: false,
      error: 'זמין רק בסביבת פיתוח (npm run dev)',
    }
  }

  const secret = getElectionsEditSecret()

  const response = await fetch('/api/elections/geocode-map', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(secret ? { 'X-Elections-Edit-Secret': secret } : {}),
    },
    body: JSON.stringify({ partyId }),
  })

  const body = (await response.json()) as GeocodeElectionMapResult
  if (!response.ok) {
    return body.ok === false
      ? body
      : { ok: false, error: 'עדכון המפה נכשל' }
  }

  return body
}

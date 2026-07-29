import { isDev, getKnessetEditSecret } from './runtimeEnv'

export type KnessetFactionEditInput = {
  factionId: number
  shortName: string | null
  color: string | null
  isCoalition: boolean
  logoUrl: string | null
}

export type UpdateKnessetFactionResult =
  | { ok: true }
  | { ok: false; error: string }

export async function updateKnessetFaction(
  input: KnessetFactionEditInput,
): Promise<UpdateKnessetFactionResult> {
  if (!isDev) {
    return {
      ok: false,
      error: 'זמין רק בסביבת פיתוח (npm run dev)',
    }
  }

  const secret = getKnessetEditSecret()

  const response = await fetch('/api/knesset/update-faction', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(secret ? { 'X-Knesset-Edit-Secret': secret } : {}),
    },
    body: JSON.stringify(input),
  })

  const body = (await response.json()) as UpdateKnessetFactionResult
  if (!response.ok) {
    return body.ok === false
      ? body
      : { ok: false, error: 'שמירה נכשלה' }
  }

  return body
}

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import path from 'node:path'
import type { NextRequest } from 'next/server'
import {
  assertPipelineEnabled,
  emptyToNull,
  getServiceEnv,
  jsonError,
  jsonOk,
  requireKnessetSecret,
  runPythonScript,
} from '@/server/apiCommon'

export const maxDuration = 300

const STAGE_TIMEOUT_MS: Record<number, number> = {
  1: 300_000,
  2: 300_000,
  3: 300_000,
  4: 300_000,
  5: 300_000,
  6: 900_000,
}
const FACTION_TIMEOUT_MS = 300_000
const IMAGES_TIMEOUT_MS = 120_000
const STATUS_TIMEOUT_MS = 120_000
const FULL_SYNC_TIMEOUT_MS = 2_700_000
const PIPELINE_DEFAULT_TIMEOUT_MS = 300_000

const KNESSET_DIR = path.join(
  process.cwd(),
  'Layer 1 - Gathering Data',
  'knesset',
)

type KnessetFactionEditInput = {
  factionId: number
  shortName: string | null
  color: string | null
  isCoalition: boolean
  logoUrl: string | null
}

type UpdateFactionResult = { ok: true } | { ok: false; error: string }

async function updateFactionWithClient(
  client: SupabaseClient,
  input: KnessetFactionEditInput,
): Promise<UpdateFactionResult> {
  if (!Number.isInteger(input.factionId) || input.factionId < 1) {
    return { ok: false, error: 'מזהה סיעה לא תקין' }
  }

  const shortName = emptyToNull(input.shortName ?? '')
  const color = emptyToNull(input.color ?? '')
  const logoUrl = emptyToNull(input.logoUrl ?? '')

  const { data, error } = await client
    .from('knesset_factions')
    .update({
      short_name: shortName,
      color,
      is_coalition: input.isCoalition,
      logo_url: logoUrl,
    })
    .eq('id', input.factionId)
    .select('id')

  if (error) {
    return { ok: false, error: error.message }
  }

  if (!data?.length) {
    return { ok: false, error: 'לא ניתן לעדכן את הסיעה' }
  }

  return { ok: true }
}

function getAdminClient() {
  const { SUPABASE_URL, SUPABASE_SERVICE_KEY } = getServiceEnv()
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return null
  }
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
}

type RouteContext = { params: Promise<{ path: string[] }> }

export async function GET(request: NextRequest, context: RouteContext) {
  const gated = assertPipelineEnabled()
  if (gated) return gated

  const auth = requireKnessetSecret(request)
  if (auth.error) return auth.error

  const { path: segments } = await context.params
  const route = segments.join('/')

  if (route === 'status') {
    try {
      const result = await runPythonScript(
        KNESSET_DIR,
        ['run_knesset_pipeline_api.py', 'status', '--json'],
        { timeoutMs: STATUS_TIMEOUT_MS },
      )
      return jsonOk(result, result.ok ? 200 : 400)
    } catch {
      return jsonError('שגיאת שרת בעת קריאת סטטוס', 500)
    }
  }

  return jsonError('Not found', 404)
}

export async function POST(request: NextRequest, context: RouteContext) {
  const gated = assertPipelineEnabled()
  if (gated) return gated

  const auth = requireKnessetSecret(request)
  if (auth.error) return auth.error

  const { path: segments } = await context.params
  const route = segments.join('/')

  try {
    if (route === 'pipeline/stage') {
      const body = (await request.json()) as { stage?: number }
      const stage = Number(body?.stage)

      if (!Number.isInteger(stage) || stage < 1 || stage > 6) {
        return jsonError('מספר שלב לא תקין', 400)
      }

      const result = await runPythonScript(
        KNESSET_DIR,
        [
          'run_knesset_pipeline_api.py',
          'stage',
          '--stage',
          String(stage),
          '--json',
        ],
        {
          timeoutMs: STAGE_TIMEOUT_MS[stage] ?? PIPELINE_DEFAULT_TIMEOUT_MS,
        },
      )
      return jsonOk(result, result.ok ? 200 : 400)
    }

    if (route === 'pipeline/sync-full') {
      const result = await runPythonScript(
        KNESSET_DIR,
        ['run_knesset_pipeline_api.py', 'sync-full', '--json'],
        { timeoutMs: FULL_SYNC_TIMEOUT_MS },
      )
      return jsonOk(result, result.ok ? 200 : 400)
    }

    if (route === 'faction-preview') {
      const result = await runPythonScript(
        KNESSET_DIR,
        ['run_knesset_pipeline_api.py', 'faction-preview', '--json'],
        { timeoutMs: FACTION_TIMEOUT_MS },
      )
      return jsonOk(result, result.ok ? 200 : 400)
    }

    if (route === 'faction-apply') {
      const result = await runPythonScript(
        KNESSET_DIR,
        ['run_knesset_pipeline_api.py', 'faction-apply', '--json'],
        { timeoutMs: FACTION_TIMEOUT_MS },
      )
      return jsonOk(result, result.ok ? 200 : 400)
    }

    if (route === 'images') {
      const result = await runPythonScript(
        KNESSET_DIR,
        ['run_knesset_pipeline_api.py', 'images', '--json'],
        { timeoutMs: IMAGES_TIMEOUT_MS },
      )
      return jsonOk(result, result.ok ? 200 : 400)
    }

    if (route === 'update-faction') {
      const admin = getAdminClient()
      if (!admin) {
        return jsonError('חסר SUPABASE_SERVICE_KEY או SUPABASE_URL', 503)
      }

      const body = (await request.json()) as KnessetFactionEditInput
      const result = await updateFactionWithClient(admin, body)
      return jsonOk(result, result.ok ? 200 : 400)
    }
  } catch {
    if (route === 'pipeline/stage') {
      return jsonError('שגיאת שרת בעת הרצת שלב', 500)
    }
    if (route === 'pipeline/sync-full') {
      return jsonError('שגיאת שרת בעת סנכרון מלא', 500)
    }
    if (route === 'faction-preview') {
      return jsonError('שגיאת שרת בעת תצוגה מקדימה של קישורי סיעות', 500)
    }
    if (route === 'faction-apply') {
      return jsonError('שגיאת שרת בעת החלת קישורי סיעות', 500)
    }
    if (route === 'images') {
      return jsonError('שגיאת שרת בעת עדכון תמונות', 500)
    }
    if (route === 'update-faction') {
      return jsonError('שגיאת שרת בעת השמירה', 500)
    }
    return jsonError('שגיאת שרת', 500)
  }

  return jsonError('Not found', 404)
}

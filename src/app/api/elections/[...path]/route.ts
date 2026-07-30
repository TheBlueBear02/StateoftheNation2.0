import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import path from 'node:path'
import type { NextRequest } from 'next/server'
import {
  assertPipelineEnabled,
  emptyToNull,
  getServiceEnv,
  jsonError,
  jsonOk,
  requireElectionsSecret,
  runPythonScript,
} from '@/server/apiCommon'

export const maxDuration = 300

const ENRICH_TIMEOUT_MS = 90_000
const STAGE_TIMEOUT_MS: Record<number, number> = {
  1: 120_000,
  2: 120_000,
  3: 600_000,
  4: 900_000,
  5: 120_000,
  6: 120_000,
}
const PIPELINE_DEFAULT_TIMEOUT_MS = 120_000

const ELECTIONS_DIR = path.join(
  process.cwd(),
  'Layer 1 - Gathering Data',
  'Elections',
)

type ElectionCandidateEditInput = {
  candidateId: number
  personId: number
  partyId: number
  fullName: string
  description: string | null
  city: string | null
  imageUrl: string | null
  birthDate: string | null
  gender: string | null
  wikipediaUrl: string | null
  listPosition: number
  previousCity: string | null
  siblingPositions: Array<{ candidateId: number; listPosition: number }>
}

type ElectionPartyEditInput = {
  partyId: number
  name: string
  shortName: string | null
  color: string | null
  logoUrl: string | null
  ballotLetter: string | null
  description: string | null
}

type UpdateResult = { ok: true } | { ok: false; error: string }

async function updateWithClient(
  client: SupabaseClient,
  input: ElectionCandidateEditInput,
): Promise<UpdateResult> {
  const fullName = input.fullName.trim()
  if (!fullName) {
    return { ok: false, error: 'יש להזין שם מלא' }
  }

  if (!Number.isInteger(input.listPosition) || input.listPosition < 1) {
    return { ok: false, error: 'מיקום ברשימה חייב להיות מספר שלם חיובי' }
  }

  const positionTaken = input.siblingPositions.some(
    (sibling) =>
      sibling.candidateId !== input.candidateId &&
      sibling.listPosition === input.listPosition,
  )
  if (positionTaken) {
    return {
      ok: false,
      error: `מיקום ${input.listPosition} כבר תפוס ברשימת המפלגה`,
    }
  }

  const city = emptyToNull(input.city ?? '')
  const description = emptyToNull(input.description ?? '')
  const imageUrl = emptyToNull(input.imageUrl ?? '')
  const birthDate = emptyToNull(input.birthDate ?? '')
  const gender = emptyToNull(input.gender ?? '')
  const wikipediaUrl = emptyToNull(input.wikipediaUrl ?? '')
  const cityChanged = city !== (input.previousCity ?? null)

  const { data: peopleData, error: peopleError } = await client
    .from('people')
    .update({
      full_name: fullName,
      image_url: imageUrl,
      birth_date: birthDate,
      gender,
      wikipedia_url: wikipediaUrl,
    })
    .eq('id', input.personId)
    .select('id')

  if (peopleError) {
    return { ok: false, error: peopleError.message }
  }

  if (!peopleData?.length) {
    return { ok: false, error: 'לא ניתן לעדכן את פרטי האדם' }
  }

  const candidateUpdate: Record<string, string | number | null> = {
    description,
    city,
    list_position: input.listPosition,
  }

  if (cityChanged) {
    candidateUpdate.latitude = null
    candidateUpdate.longitude = null
  }

  const { data: candidateData, error: candidateError } = await client
    .from('election_candidates')
    .update(candidateUpdate)
    .eq('id', input.candidateId)
    .select('id')

  if (candidateError) {
    const message = candidateError.message
    if (
      message.toLowerCase().includes('unique') ||
      message.toLowerCase().includes('duplicate')
    ) {
      return {
        ok: false,
        error: `מיקום ${input.listPosition} כבר תפוס ברשימת המפלגה`,
      }
    }
    return { ok: false, error: message }
  }

  if (!candidateData?.length) {
    return { ok: false, error: 'לא ניתן לעדכן את המועמד' }
  }

  return { ok: true }
}

async function updatePartyWithClient(
  client: SupabaseClient,
  input: ElectionPartyEditInput,
): Promise<UpdateResult> {
  if (!Number.isInteger(input.partyId) || input.partyId < 1) {
    return { ok: false, error: 'מזהה מפלגה לא תקין' }
  }

  const name = input.name.trim()
  if (!name) {
    return { ok: false, error: 'יש להזין שם מפלגה' }
  }

  const { data, error } = await client
    .from('election_parties')
    .update({
      name,
      short_name: emptyToNull(input.shortName ?? ''),
      color: emptyToNull(input.color ?? ''),
      logo_url: emptyToNull(input.logoUrl ?? ''),
      ballot_letter: emptyToNull(input.ballotLetter ?? ''),
      description: emptyToNull(input.description ?? ''),
    })
    .eq('id', input.partyId)
    .select('id')

  if (error) {
    return { ok: false, error: error.message }
  }

  if (!data?.length) {
    return { ok: false, error: 'לא ניתן לעדכן את המפלגה' }
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

  const auth = requireElectionsSecret(request)
  if (auth.error) return auth.error

  const { path: segments } = await context.params
  const route = segments.join('/')

  if (route === 'pipeline/review-queue') {
    const partyId = Number(request.nextUrl.searchParams.get('partyId'))
    if (!Number.isInteger(partyId) || partyId < 1) {
      return jsonError('מזהה מפלגה לא תקין', 400)
    }

    try {
      const result = await runPythonScript(
        ELECTIONS_DIR,
        [
          'run_party_pipeline_api.py',
          'review-queue',
          '--party-id',
          String(partyId),
          '--json',
        ],
        { timeoutMs: PIPELINE_DEFAULT_TIMEOUT_MS },
      )
      return jsonOk(result, result.ok ? 200 : 400)
    } catch {
      return jsonError('שגיאת שרת בעת קריאת תור הבדיקה', 500)
    }
  }

  return jsonError('Not found', 404)
}

/** Data edits use service role + edit secret in all environments.
 *  Python pipeline routes stay behind assertPipelineEnabled (dev / opt-in). */
const DATA_EDIT_ROUTES = new Set(['update-candidate', 'update-party'])

export async function POST(request: NextRequest, context: RouteContext) {
  const { path: segments } = await context.params
  const route = segments.join('/')

  if (!DATA_EDIT_ROUTES.has(route)) {
    const gated = assertPipelineEnabled()
    if (gated) return gated
  }

  const auth = requireElectionsSecret(request)
  if (auth.error) return auth.error

  try {
    if (route === 'pipeline/preview') {
      const body = (await request.json()) as {
        partyId?: number
        text?: string
        format?: 'txt' | 'csv'
      }
      const partyId = Number(body?.partyId)
      const text = body?.text ?? ''
      const format = body?.format === 'csv' ? 'csv' : 'txt'

      if (!Number.isInteger(partyId) || partyId < 1) {
        return jsonError('מזהה מפלגה לא תקין', 400)
      }

      const result = await runPythonScript(
        ELECTIONS_DIR,
        [
          'run_party_pipeline_api.py',
          'preview',
          '--party-id',
          String(partyId),
          '--format',
          format,
          '--text',
          '-',
          '--json',
        ],
        { stdin: text, timeoutMs: PIPELINE_DEFAULT_TIMEOUT_MS },
      )
      return jsonOk(result, result.ok ? 200 : 400)
    }

    if (route === 'pipeline/insert') {
      const body = (await request.json()) as {
        partyId?: number
        text?: string
        format?: 'txt' | 'csv'
      }
      const partyId = Number(body?.partyId)
      const text = body?.text ?? ''
      const format = body?.format === 'csv' ? 'csv' : 'txt'

      if (!Number.isInteger(partyId) || partyId < 1) {
        return jsonError('מזהה מפלגה לא תקין', 400)
      }

      const result = await runPythonScript(
        ELECTIONS_DIR,
        [
          'run_party_pipeline_api.py',
          'insert',
          '--party-id',
          String(partyId),
          '--format',
          format,
          '--text',
          '-',
          '--json',
        ],
        { stdin: text, timeoutMs: PIPELINE_DEFAULT_TIMEOUT_MS },
      )
      return jsonOk(result, result.ok ? 200 : 400)
    }

    if (route === 'pipeline/stage') {
      const body = (await request.json()) as { stage?: number }
      const stage = Number(body?.stage)

      if (!Number.isInteger(stage) || stage < 1 || stage > 6) {
        return jsonError('מספר שלב לא תקין', 400)
      }

      const result = await runPythonScript(
        ELECTIONS_DIR,
        [
          'run_party_pipeline_api.py',
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

    if (route === 'pipeline/resolve-review') {
      const body = (await request.json()) as {
        partyId?: number
        actions?: Array<{
          rawId: number
          action: 'approve' | 'new'
          correctPersonId?: number
        }>
      }
      const partyId = Number(body?.partyId)
      const actions = body?.actions ?? []

      if (!Number.isInteger(partyId) || partyId < 1) {
        return jsonError('מזהה מפלגה לא תקין', 400)
      }

      if (!Array.isArray(actions) || actions.length === 0) {
        return jsonError('יש לספק פעולות לתור הבדיקה', 400)
      }

      const result = await runPythonScript(
        ELECTIONS_DIR,
        [
          'run_party_pipeline_api.py',
          'resolve-review',
          '--party-id',
          String(partyId),
          '--actions',
          JSON.stringify(actions),
          '--json',
        ],
        { timeoutMs: PIPELINE_DEFAULT_TIMEOUT_MS },
      )
      return jsonOk(result, result.ok ? 200 : 400)
    }

    if (route === 'update-candidate') {
      const admin = getAdminClient()
      if (!admin) {
        return jsonError('חסר SUPABASE_SERVICE_KEY או SUPABASE_URL', 503)
      }

      const body = (await request.json()) as ElectionCandidateEditInput
      const result = await updateWithClient(admin, body)
      return jsonOk(result, result.ok ? 200 : 400)
    }

    if (route === 'update-party') {
      const admin = getAdminClient()
      if (!admin) {
        return jsonError('חסר SUPABASE_SERVICE_KEY או SUPABASE_URL', 503)
      }

      const body = (await request.json()) as ElectionPartyEditInput
      const result = await updatePartyWithClient(admin, body)
      return jsonOk(result, result.ok ? 200 : 400)
    }

    if (route === 'enrich-candidate') {
      const body = (await request.json()) as { candidateId?: number }
      const candidateId = Number(body?.candidateId)

      if (!Number.isInteger(candidateId) || candidateId < 1) {
        return jsonError('מזהה מועמד לא תקין', 400)
      }

      const result = await runPythonScript(
        ELECTIONS_DIR,
        [
          'enrich_single_candidate.py',
          '--candidate-id',
          String(candidateId),
          '--json',
        ],
        { timeoutMs: ENRICH_TIMEOUT_MS },
      )
      return jsonOk(result, result.ok ? 200 : 400)
    }

    if (route === 'geocode-map') {
      const body = (await request.json()) as { partyId?: number }
      const partyId = Number(body?.partyId)

      if (!Number.isInteger(partyId) || partyId < 1) {
        return jsonError('מזהה מפלגה לא תקין', 400)
      }

      const result = await runPythonScript(
        ELECTIONS_DIR,
        [
          'run_party_pipeline_api.py',
          'geocode-map',
          '--party-id',
          String(partyId),
          '--json',
        ],
        { timeoutMs: STAGE_TIMEOUT_MS[4] },
      )
      return jsonOk(result, result.ok ? 200 : 400)
    }
  } catch {
    if (route === 'pipeline/preview') {
      return jsonError('שגיאת שרת בעת תצוגה מקדימה', 500)
    }
    if (route === 'pipeline/insert') {
      return jsonError('שגיאת שרת בעת הכנסת הרשימה', 500)
    }
    if (route === 'pipeline/stage') {
      return jsonError('שגיאת שרת בעת הרצת שלב', 500)
    }
    if (route === 'pipeline/resolve-review') {
      return jsonError('שגיאת שרת בעת אישור תור הבדיקה', 500)
    }
    if (route === 'update-candidate' || route === 'update-party') {
      return jsonError('שגיאת שרת בעת השמירה', 500)
    }
    if (route === 'enrich-candidate') {
      return jsonError('שגיאת שרת בעת הרצת pipeline', 500)
    }
    if (route === 'geocode-map') {
      return jsonError('שגיאת שרת בעת עדכון המפה', 500)
    }
    return jsonError('שגיאת שרת', 500)
  }

  return jsonError('Not found', 404)
}

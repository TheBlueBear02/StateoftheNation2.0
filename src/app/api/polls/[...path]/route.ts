import path from 'node:path'
import type { NextRequest } from 'next/server'
import {
  assertPipelineEnabled,
  jsonError,
  jsonOk,
  requireElectionsSecret,
  runPythonScript,
} from '@/server/apiCommon'

export const maxDuration = 300

const STATUS_TIMEOUT_MS = 120_000
const STAGE_TIMEOUT_MS = 600_000
const FULL_SYNC_TIMEOUT_MS = 1_800_000

const POLLS_DIR = path.join(process.cwd(), 'Layer 1 - Gathering Data', 'Polls')

type RouteContext = { params: Promise<{ path: string[] }> }

export async function GET(request: NextRequest, context: RouteContext) {
  const gated = assertPipelineEnabled()
  if (gated) return gated

  const auth = requireElectionsSecret(request)
  if (auth.error) return auth.error

  const { path: segments } = await context.params
  const route = segments.join('/')

  if (route === 'status') {
    try {
      const result = await runPythonScript(
        POLLS_DIR,
        ['run_polls_pipeline_api.py', 'status', '--json'],
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

  const auth = requireElectionsSecret(request)
  if (auth.error) return auth.error

  const { path: segments } = await context.params
  const route = segments.join('/')

  try {
    if (route === 'pipeline/stage') {
      const body = (await request.json()) as {
        stage?: number
        backfill?: boolean
        force?: boolean
      }
      const stage = Number(body?.stage)

      if (!Number.isInteger(stage) || stage < 1 || stage > 6) {
        return jsonError('מספר שלב לא תקין', 400)
      }

      const args = [
        'run_polls_pipeline_api.py',
        'stage',
        '--stage',
        String(stage),
        '--json',
      ]
      if (body?.backfill) {
        args.push('--backfill')
      }
      if (body?.force) {
        args.push('--force')
      }

      const result = await runPythonScript(POLLS_DIR, args, {
        timeoutMs: STAGE_TIMEOUT_MS,
      })
      return jsonOk(result, result.ok ? 200 : 400)
    }

    if (route === 'pipeline/sync-full') {
      const body = (await request.json()) as {
        backfill?: boolean
        force?: boolean
      }

      const args = ['run_polls_pipeline_api.py', 'sync-full', '--json']
      if (body?.backfill) {
        args.push('--backfill')
      }
      if (body?.force) {
        args.push('--force')
      }

      const result = await runPythonScript(POLLS_DIR, args, {
        timeoutMs: FULL_SYNC_TIMEOUT_MS,
      })
      return jsonOk(result, result.ok ? 200 : 400)
    }
  } catch {
    if (route === 'pipeline/stage') {
      return jsonError('שגיאת שרת בעת הרצת שלב', 500)
    }
    if (route === 'pipeline/sync-full') {
      return jsonError('שגיאת שרת בעת סנכרון סקרים', 500)
    }
    return jsonError('שגיאת שרת', 500)
  }

  return jsonError('Not found', 404)
}

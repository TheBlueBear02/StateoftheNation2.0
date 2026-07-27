import { spawn } from 'node:child_process'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { IncomingMessage, ServerResponse } from 'node:http'
import path from 'node:path'
import type { Plugin } from 'vite'

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

type UpdateResult = { ok: true } | { ok: false; error: string }

type EnrichCandidateInput = {
  candidateId: number
}

type EnrichCandidateResult =
  | {
      ok: true
      updates: Record<string, string>
      filledFields: string[]
      message?: string
    }
  | { ok: false; error: string }

type PythonScriptResult = { ok: true; [key: string]: unknown } | { ok: false; error: string }

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

function emptyToNull(value: string): string | null {
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

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

function readJsonBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8')
        resolve(raw ? JSON.parse(raw) : null)
      } catch (error) {
        reject(error)
      }
    })
    req.on('error', reject)
  })
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(body))
}

function checkEditSecret(
  req: IncomingMessage,
  res: ServerResponse,
  editSecret: string,
): boolean {
  if (!editSecret) {
    sendJson(res, 503, {
      ok: false,
      error: 'חסר VITE_ELECTIONS_EDIT_SECRET בקובץ .env',
    })
    return false
  }

  const providedSecret = req.headers['x-elections-edit-secret']
  if (providedSecret !== editSecret) {
    sendJson(res, 401, { ok: false, error: 'אין הרשאה לערוך' })
    return false
  }

  return true
}

function runPythonScript(
  args: string[],
  env: Record<string, string>,
  options?: { timeoutMs?: number; stdin?: string },
): Promise<PythonScriptResult> {
  return new Promise((resolve) => {
    const pythonCmd = process.platform === 'win32' ? 'python' : 'python3'
    const child = spawn(pythonCmd, args, {
      cwd: ELECTIONS_DIR,
      env: {
        ...process.env,
        PYTHONIOENCODING: 'utf-8',
        SUPABASE_URL: (
          env.VITE_SUPABASE_URL ||
          env.SUPABASE_URL ||
          ''
        ).trim(),
        SUPABASE_SERVICE_KEY: (env.SUPABASE_SERVICE_KEY || '').trim(),
        OPENAI_API_KEY: (env.OPENAI_API_KEY || '').trim(),
      },
    })

    let stdout = ''
    let stderr = ''
    const timeoutMs = options?.timeoutMs ?? PIPELINE_DEFAULT_TIMEOUT_MS

    const timer = setTimeout(() => {
      child.kill()
      resolve({
        ok: false,
        error: 'הרצת ה-pipeline נמשכה יותר מדי זמן',
      })
    }, timeoutMs)

    if (options?.stdin !== undefined) {
      child.stdin.write(options.stdin)
      child.stdin.end()
    }

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8')
    })

    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8')
    })

    child.on('close', (code) => {
      clearTimeout(timer)

      const trimmed = stdout.trim()
      const lastLine = trimmed.split('\n').filter(Boolean).pop() ?? ''

      try {
        const parsed = JSON.parse(lastLine) as PythonScriptResult
        if (parsed && typeof parsed === 'object' && 'ok' in parsed) {
          resolve(parsed)
          return
        }
      } catch {
        // fall through to error handling
      }

      if (code !== 0) {
        resolve({
          ok: false,
          error:
            stderr.trim() ||
            trimmed ||
            'שגיאה בהרצת pipeline',
        })
        return
      }

      resolve({
        ok: false,
        error: 'תשובה לא תקינה מהסקריפט',
      })
    })

    child.on('error', (error) => {
      clearTimeout(timer)
      resolve({
        ok: false,
        error: error.message || 'לא ניתן להריץ את Python',
      })
    })
  })
}

function runEnrichCandidate(
  candidateId: number,
  env: Record<string, string>,
): Promise<EnrichCandidateResult> {
  return runPythonScript(
    [
      'enrich_single_candidate.py',
      '--candidate-id',
      String(candidateId),
      '--json',
    ],
    env,
    { timeoutMs: ENRICH_TIMEOUT_MS },
  ) as Promise<EnrichCandidateResult>
}

export function electionsEditApiPlugin(env: Record<string, string>): Plugin {
  const supabaseUrl = (env.VITE_SUPABASE_URL || env.SUPABASE_URL || '').trim()
  const serviceKey = (env.SUPABASE_SERVICE_KEY || '').trim()
  const editSecret = (env.VITE_ELECTIONS_EDIT_SECRET || '').trim()

  return {
    name: 'elections-edit-api',
    configureServer(server) {
      if (!supabaseUrl || !serviceKey) {
        return
      }

      const admin = createClient(supabaseUrl, serviceKey)

      server.middlewares.use(async (req, res, next) => {
        const url = req.url?.split('?')[0]
        const query = new URL(req.url ?? '', 'http://localhost').searchParams

        if (url === '/api/elections/pipeline/review-queue' && req.method === 'GET') {
          if (!checkEditSecret(req, res, editSecret)) {
            return
          }

          const partyId = Number(query.get('partyId'))
          if (!Number.isInteger(partyId) || partyId < 1) {
            sendJson(res, 400, { ok: false, error: 'מזהה מפלגה לא תקין' })
            return
          }

          try {
            const result = await runPythonScript(
              [
                'run_party_pipeline_api.py',
                'review-queue',
                '--party-id',
                String(partyId),
                '--json',
              ],
              env,
            )
            sendJson(res, result.ok ? 200 : 400, result)
          } catch {
            sendJson(res, 500, {
              ok: false,
              error: 'שגיאת שרת בעת קריאת תור הבדיקה',
            })
          }
          return
        }

        if (req.method !== 'POST') {
          next()
          return
        }

        if (url === '/api/elections/pipeline/preview') {
          if (!checkEditSecret(req, res, editSecret)) {
            return
          }

          try {
            const body = (await readJsonBody(req)) as {
              partyId?: number
              text?: string
              format?: 'txt' | 'csv'
            }
            const partyId = Number(body?.partyId)
            const text = body?.text ?? ''
            const format = body?.format === 'csv' ? 'csv' : 'txt'

            if (!Number.isInteger(partyId) || partyId < 1) {
              sendJson(res, 400, { ok: false, error: 'מזהה מפלגה לא תקין' })
              return
            }

            const result = await runPythonScript(
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
              env,
              { stdin: text },
            )
            sendJson(res, result.ok ? 200 : 400, result)
          } catch {
            sendJson(res, 500, {
              ok: false,
              error: 'שגיאת שרת בעת תצוגה מקדימה',
            })
          }
          return
        }

        if (url === '/api/elections/pipeline/insert') {
          if (!checkEditSecret(req, res, editSecret)) {
            return
          }

          try {
            const body = (await readJsonBody(req)) as {
              partyId?: number
              text?: string
              format?: 'txt' | 'csv'
            }
            const partyId = Number(body?.partyId)
            const text = body?.text ?? ''
            const format = body?.format === 'csv' ? 'csv' : 'txt'

            if (!Number.isInteger(partyId) || partyId < 1) {
              sendJson(res, 400, { ok: false, error: 'מזהה מפלגה לא תקין' })
              return
            }

            const result = await runPythonScript(
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
              env,
              { stdin: text },
            )
            sendJson(res, result.ok ? 200 : 400, result)
          } catch {
            sendJson(res, 500, {
              ok: false,
              error: 'שגיאת שרת בעת הכנסת הרשימה',
            })
          }
          return
        }

        if (url === '/api/elections/pipeline/stage') {
          if (!checkEditSecret(req, res, editSecret)) {
            return
          }

          try {
            const body = (await readJsonBody(req)) as { stage?: number }
            const stage = Number(body?.stage)

            if (!Number.isInteger(stage) || stage < 1 || stage > 6) {
              sendJson(res, 400, { ok: false, error: 'מספר שלב לא תקין' })
              return
            }

            const result = await runPythonScript(
              [
                'run_party_pipeline_api.py',
                'stage',
                '--stage',
                String(stage),
                '--json',
              ],
              env,
              { timeoutMs: STAGE_TIMEOUT_MS[stage] ?? PIPELINE_DEFAULT_TIMEOUT_MS },
            )
            sendJson(res, result.ok ? 200 : 400, result)
          } catch {
            sendJson(res, 500, {
              ok: false,
              error: 'שגיאת שרת בעת הרצת שלב',
            })
          }
          return
        }

        if (url === '/api/elections/pipeline/resolve-review') {
          if (!checkEditSecret(req, res, editSecret)) {
            return
          }

          try {
            const body = (await readJsonBody(req)) as {
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
              sendJson(res, 400, { ok: false, error: 'מזהה מפלגה לא תקין' })
              return
            }

            if (!Array.isArray(actions) || actions.length === 0) {
              sendJson(res, 400, { ok: false, error: 'יש לספק פעולות לתור הבדיקה' })
              return
            }

            const result = await runPythonScript(
              [
                'run_party_pipeline_api.py',
                'resolve-review',
                '--party-id',
                String(partyId),
                '--actions',
                JSON.stringify(actions),
                '--json',
              ],
              env,
            )
            sendJson(res, result.ok ? 200 : 400, result)
          } catch {
            sendJson(res, 500, {
              ok: false,
              error: 'שגיאת שרת בעת אישור תור הבדיקה',
            })
          }
          return
        }

        if (url === '/api/elections/update-candidate') {
          if (!checkEditSecret(req, res, editSecret)) {
            return
          }

          try {
            const body = (await readJsonBody(req)) as ElectionCandidateEditInput
            const result = await updateWithClient(admin, body)
            sendJson(res, result.ok ? 200 : 400, result)
          } catch {
            sendJson(res, 500, { ok: false, error: 'שגיאת שרת בעת השמירה' })
          }
          return
        }

        if (url === '/api/elections/enrich-candidate') {
          if (!checkEditSecret(req, res, editSecret)) {
            return
          }

          try {
            const body = (await readJsonBody(req)) as EnrichCandidateInput
            const candidateId = Number(body?.candidateId)

            if (!Number.isInteger(candidateId) || candidateId < 1) {
              sendJson(res, 400, {
                ok: false,
                error: 'מזהה מועמד לא תקין',
              })
              return
            }

            const result = await runEnrichCandidate(candidateId, env)
            sendJson(res, result.ok ? 200 : 400, result)
          } catch {
            sendJson(res, 500, {
              ok: false,
              error: 'שגיאת שרת בעת הרצת pipeline',
            })
          }
          return
        }

        if (url === '/api/elections/geocode-map') {
          if (!checkEditSecret(req, res, editSecret)) {
            return
          }

          try {
            const body = (await readJsonBody(req)) as { partyId?: number }
            const partyId = Number(body?.partyId)

            if (!Number.isInteger(partyId) || partyId < 1) {
              sendJson(res, 400, { ok: false, error: 'מזהה מפלגה לא תקין' })
              return
            }

            const result = await runPythonScript(
              [
                'run_party_pipeline_api.py',
                'geocode-map',
                '--party-id',
                String(partyId),
                '--json',
              ],
              env,
              { timeoutMs: STAGE_TIMEOUT_MS[4] },
            )
            sendJson(res, result.ok ? 200 : 400, result)
          } catch {
            sendJson(res, 500, {
              ok: false,
              error: 'שגיאת שרת בעת עדכון המפה',
            })
          }
          return
        }

        next()
      })
    },
  }
}

import { spawn } from 'node:child_process'
import type { IncomingMessage, ServerResponse } from 'node:http'
import path from 'node:path'
import type { Plugin } from 'vite'

type PythonScriptResult =
  | { ok: true; [key: string]: unknown }
  | { ok: false; error: string }

const STATUS_TIMEOUT_MS = 120_000
const STAGE_TIMEOUT_MS = 600_000
const FULL_SYNC_TIMEOUT_MS = 1_800_000
const PIPELINE_DEFAULT_TIMEOUT_MS = 600_000

const POLLS_DIR = path.join(process.cwd(), 'Layer 1 - Gathering Data', 'Polls')

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
  options?: { timeoutMs?: number },
): Promise<PythonScriptResult> {
  return new Promise((resolve) => {
    const pythonCmd = process.platform === 'win32' ? 'python' : 'python3'
    const child = spawn(pythonCmd, args, {
      cwd: POLLS_DIR,
      env: {
        ...process.env,
        PYTHONIOENCODING: 'utf-8',
        SUPABASE_URL: (
          env.VITE_SUPABASE_URL ||
          env.SUPABASE_URL ||
          ''
        ).trim(),
        SUPABASE_SERVICE_KEY: (env.SUPABASE_SERVICE_KEY || '').trim(),
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
          error: stderr.trim() || trimmed || 'שגיאה בהרצת pipeline',
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

export function pollsEditApiPlugin(env: Record<string, string>): Plugin {
  const supabaseUrl = (env.VITE_SUPABASE_URL || env.SUPABASE_URL || '').trim()
  const serviceKey = (env.SUPABASE_SERVICE_KEY || '').trim()
  const editSecret = (env.VITE_ELECTIONS_EDIT_SECRET || '').trim()

  return {
    name: 'polls-edit-api',
    configureServer(server) {
      if (!supabaseUrl || !serviceKey) {
        return
      }

      server.middlewares.use(async (req, res, next) => {
        const url = req.url?.split('?')[0]

        if (url === '/api/polls/status' && req.method === 'GET') {
          if (!checkEditSecret(req, res, editSecret)) {
            return
          }

          try {
            const result = await runPythonScript(
              ['run_polls_pipeline_api.py', 'status', '--json'],
              env,
              { timeoutMs: STATUS_TIMEOUT_MS },
            )
            sendJson(res, result.ok ? 200 : 400, result)
          } catch {
            sendJson(res, 500, {
              ok: false,
              error: 'שגיאת שרת בעת קריאת סטטוס',
            })
          }
          return
        }

        if (req.method !== 'POST') {
          next()
          return
        }

        if (url === '/api/polls/pipeline/stage') {
          if (!checkEditSecret(req, res, editSecret)) {
            return
          }

          try {
            const body = (await readJsonBody(req)) as {
              stage?: number
              backfill?: boolean
              force?: boolean
            }
            const stage = Number(body?.stage)

            if (!Number.isInteger(stage) || stage < 1 || stage > 6) {
              sendJson(res, 400, { ok: false, error: 'מספר שלב לא תקין' })
              return
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

            const result = await runPythonScript(args, env, {
              timeoutMs: STAGE_TIMEOUT_MS,
            })
            sendJson(res, result.ok ? 200 : 400, result)
          } catch {
            sendJson(res, 500, {
              ok: false,
              error: 'שגיאת שרת בעת הרצת שלב',
            })
          }
          return
        }

        if (url === '/api/polls/pipeline/sync-full') {
          if (!checkEditSecret(req, res, editSecret)) {
            return
          }

          try {
            const body = (await readJsonBody(req)) as {
              backfill?: boolean
              force?: boolean
            }

            const args = [
              'run_polls_pipeline_api.py',
              'sync-full',
              '--json',
            ]
            if (body?.backfill) {
              args.push('--backfill')
            }
            if (body?.force) {
              args.push('--force')
            }

            const result = await runPythonScript(args, env, {
              timeoutMs: FULL_SYNC_TIMEOUT_MS,
            })
            sendJson(res, result.ok ? 200 : 400, result)
          } catch {
            sendJson(res, 500, {
              ok: false,
              error: 'שגיאת שרת בעת סנכרון סקרים',
            })
          }
          return
        }

        next()
      })
    },
  }
}

import { spawn } from 'node:child_process'
import { NextResponse } from 'next/server'
import {
  getElectionsEditSecret,
  getKnessetEditSecret,
  getSupabaseUrl,
  pipelineApisEnabled,
} from '@/lib/runtimeEnv'

export { getSupabaseUrl }

export type PythonScriptResult =
  | { ok: true; [key: string]: unknown }
  | { ok: false; error: string }

export function jsonOk(body: unknown, status = 200) {
  return NextResponse.json(body, { status })
}

export function jsonError(error: string, status: number) {
  return NextResponse.json({ ok: false, error }, { status })
}

export function assertPipelineEnabled() {
  if (!pipelineApisEnabled()) {
    return jsonError(
      'Pipeline API זמין רק ב־development או עם ENABLE_PIPELINE_API=1',
      403,
    )
  }
  return null
}

export function requireElectionsSecret(request: Request) {
  const editSecret = getElectionsEditSecret()?.trim() ?? ''
  if (!editSecret) {
    return {
      error: jsonError(
        'חסר ELECTIONS_EDIT_SECRET / NEXT_PUBLIC_ELECTIONS_EDIT_SECRET בקובץ .env',
        503,
      ),
    }
  }
  const provided = request.headers.get('x-elections-edit-secret')
  if (provided !== editSecret) {
    return { error: jsonError('אין הרשאה לערוך', 401) }
  }
  return { secret: editSecret }
}

export function requireKnessetSecret(request: Request) {
  const editSecret = getKnessetEditSecret()?.trim() ?? ''
  if (!editSecret) {
    return {
      error: jsonError(
        'חסר KNESSET_EDIT_SECRET / NEXT_PUBLIC_KNESSET_EDIT_SECRET בקובץ .env',
        503,
      ),
    }
  }
  const provided = request.headers.get('x-knesset-edit-secret')
  if (provided !== editSecret) {
    return { error: jsonError('אין הרשאה לערוך', 401) }
  }
  return { secret: editSecret }
}

export function getServiceEnv() {
  return {
    SUPABASE_URL: (
      getSupabaseUrl() ||
      process.env.SUPABASE_URL ||
      ''
    ).trim(),
    SUPABASE_SERVICE_KEY: (process.env.SUPABASE_SERVICE_KEY || '').trim(),
    OPENAI_API_KEY: (process.env.OPENAI_API_KEY || '').trim(),
  }
}

export function runPythonScript(
  cwd: string,
  args: string[],
  options?: { timeoutMs?: number; stdin?: string },
): Promise<PythonScriptResult> {
  const serviceEnv = getServiceEnv()

  return new Promise((resolve) => {
    const pythonCmd = process.platform === 'win32' ? 'python' : 'python3'
    const child = spawn(pythonCmd, args, {
      cwd,
      env: {
        ...process.env,
        PYTHONIOENCODING: 'utf-8',
        SUPABASE_URL: serviceEnv.SUPABASE_URL,
        SUPABASE_SERVICE_KEY: serviceEnv.SUPABASE_SERVICE_KEY,
        OPENAI_API_KEY: serviceEnv.OPENAI_API_KEY,
      },
    })

    let stdout = ''
    let stderr = ''
    const timeoutMs = options?.timeoutMs ?? 120_000

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
        // fall through
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

export function emptyToNull(value: string): string | null {
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

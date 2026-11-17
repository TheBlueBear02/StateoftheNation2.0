import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  authorizeKnessetEdit,
  knessetEditSecretsMatch,
  readServerKnessetEditSecret,
} from './knessetEditAuth.ts'

function requestWith(secret?: string): Request {
  return new Request('http://localhost/api/knesset/update-member', {
    method: 'POST',
    headers: secret === undefined ? {} : { 'x-knesset-edit-secret': secret },
  })
}

describe('knesset edit auth', () => {
  it('ignores NEXT_PUBLIC secrets and reads only server env names', () => {
    assert.equal(
      readServerKnessetEditSecret({
        NEXT_PUBLIC_KNESSET_EDIT_SECRET: 'from-public',
        NEXT_PUBLIC_PIPELINE_EDIT_SECRET: 'from-pipeline-public',
      } as NodeJS.ProcessEnv),
      '',
    )
    assert.equal(
      readServerKnessetEditSecret({
        PIPELINE_EDIT_SECRET: 'pipe',
        ELECTIONS_EDIT_SECRET: 'elec',
      } as NodeJS.ProcessEnv),
      'pipe',
    )
    assert.equal(
      readServerKnessetEditSecret({
        KNESSET_EDIT_SECRET: ' knes ',
        PIPELINE_EDIT_SECRET: 'pipe',
      } as NodeJS.ProcessEnv),
      'knes',
    )
    assert.equal(
      readServerKnessetEditSecret({
        VITE_KNESSET_EDIT_SECRET: 'legacy',
      } as NodeJS.ProcessEnv),
      'legacy',
    )
  })

  it('compares unequal lengths without throwing', () => {
    assert.equal(knessetEditSecretsMatch('a', 'ab'), false)
    assert.equal(knessetEditSecretsMatch('same', 'same'), true)
    assert.equal(knessetEditSecretsMatch('', 'same'), false)
    assert.equal(knessetEditSecretsMatch('x'.repeat(513), 'x'.repeat(513)), false)
  })

  it('rejects when the server secret is unset', async () => {
    const result = await authorizeKnessetEdit(requestWith('guess'), {
      env: {} as NodeJS.ProcessEnv,
      delayMs: 0,
    })
    assert.deepEqual(result, {
      ok: false,
      status: 503,
      error: 'חסר KNESSET_EDIT_SECRET בשרת',
    })
  })

  it('rejects a missing or wrong password and accepts the server secret', async () => {
    const env = { KNESSET_EDIT_SECRET: 'page-password' } as NodeJS.ProcessEnv

    const missing = await authorizeKnessetEdit(requestWith(), {
      env,
      delayMs: 0,
    })
    assert.equal(missing.ok, false)
    if (!missing.ok) {
      assert.equal(missing.status, 401)
    }

    const wrong = await authorizeKnessetEdit(requestWith('nope'), {
      env,
      delayMs: 0,
    })
    assert.equal(wrong.ok, false)

    const right = await authorizeKnessetEdit(requestWith('page-password'), {
      env,
      delayMs: 0,
    })
    assert.deepEqual(right, { ok: true })
  })

  it('waits before answering a wrong password', async () => {
    const started = Date.now()
    const result = await authorizeKnessetEdit(requestWith('nope'), {
      env: { KNESSET_EDIT_SECRET: 'page-password' } as NodeJS.ProcessEnv,
      delayMs: 80,
    })
    assert.equal(result.ok, false)
    assert.ok(Date.now() - started >= 70)
  })
})

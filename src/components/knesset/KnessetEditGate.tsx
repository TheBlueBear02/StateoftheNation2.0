'use client'

import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import {
  clearKnessetEditSecret,
  readKnessetEditSecret,
  storeKnessetEditSecret,
  verifyKnessetEditSecret,
} from '../../lib/knessetEditSession'

type KnessetEditGateProps = {
  children: ReactNode
}

export function KnessetEditGate({ children }: KnessetEditGateProps) {
  const [phase, setPhase] = useState<'checking' | 'locked' | 'unlocked'>(
    'checking',
  )
  const [password, setPassword] = useState('')
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  useEffect(() => {
    const existing = readKnessetEditSecret()
    if (!existing) {
      setPhase('locked')
      return
    }

    let cancelled = false
    void verifyKnessetEditSecret(existing).then((result) => {
      if (cancelled) {
        return
      }
      if (result.ok) {
        setPhase('unlocked')
        return
      }
      clearKnessetEditSecret()
      setPhase('locked')
      if (result.status === 503) {
        setPasswordError(result.error)
      }
    })

    return () => {
      cancelled = true
    }
  }, [])

  async function handleUnlock(event: FormEvent) {
    event.preventDefault()
    if (pending) {
      return
    }
    setPending(true)
    const result = await verifyKnessetEditSecret(password)
    setPending(false)
    if (!result.ok) {
      setPasswordError(result.status === 401 ? 'סיסמה שגויה' : result.error)
      return
    }
    storeKnessetEditSecret(password)
    setPassword('')
    setPasswordError(null)
    setPhase('unlocked')
  }

  if (phase === 'checking') {
    return <p className="election-edit-page__muted">בודק גישה…</p>
  }

  if (phase === 'locked') {
    return (
      <form className="election-edit-page__gate party-detail-card" onSubmit={handleUnlock}>
        <div className="party-detail-card__header">
          <p className="party-detail-card__eyebrow">גישה</p>
          <h2 className="party-detail-card__title">הזינו סיסמה</h2>
        </div>
        <label className="candidate-edit-card__field">
          <span>סיסמה</span>
          <input
            type="password"
            value={password}
            onChange={(event) => {
              setPassword(event.target.value)
              setPasswordError(null)
            }}
            autoComplete="current-password"
            required
          />
        </label>
        {passwordError ? (
          <p
            className="candidate-edit-card__status candidate-edit-card__status--error"
            role="alert"
          >
            {passwordError}
          </p>
        ) : null}
        <button
          type="submit"
          className="candidate-edit-card__save"
          disabled={pending}
        >
          {pending ? 'בודק…' : 'כניסה'}
        </button>
      </form>
    )
  }

  return <>{children}</>
}

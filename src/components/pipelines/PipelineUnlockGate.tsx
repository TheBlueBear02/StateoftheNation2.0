'use client'

import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import {
  getPipelineSecretConfigured,
  isPipelineUnlockedInSession,
  PIPELINE_SECRET_MISSING_MESSAGE,
  setPipelineUnlockedInSession,
  verifyPipelinePassword,
} from '../../lib/pipelineAuth'

type PipelineUnlockGateProps = {
  children: ReactNode
  /** Optional class on the missing-secret alert panel */
  panelClassName?: string
  /** Optional class on the password form card */
  gateClassName?: string
  onUnlock?: () => void
}

export function PipelineUnlockGate({
  children,
  panelClassName = 'election-edit-page__panel',
  gateClassName = 'election-edit-page__gate party-detail-card',
  onUnlock,
}: PipelineUnlockGateProps) {
  const secretConfigured = getPipelineSecretConfigured()
  const [unlocked, setUnlocked] = useState(false)
  const [sessionChecked, setSessionChecked] = useState(false)
  const [password, setPassword] = useState('')
  const [passwordError, setPasswordError] = useState<string | null>(null)

  useEffect(() => {
    setUnlocked(isPipelineUnlockedInSession())
    setSessionChecked(true)
  }, [])

  function handleUnlock(event: FormEvent) {
    event.preventDefault()
    if (!secretConfigured) {
      setPasswordError(PIPELINE_SECRET_MISSING_MESSAGE)
      return
    }
    if (!verifyPipelinePassword(password)) {
      setPasswordError('סיסמה שגויה')
      return
    }
    setPipelineUnlockedInSession()
    setUnlocked(true)
    setSessionChecked(true)
    setPasswordError(null)
    setPassword('')
    onUnlock?.()
  }

  if (!secretConfigured) {
    return (
      <p className={panelClassName} role="alert">
        {PIPELINE_SECRET_MISSING_MESSAGE} — הוסיפו את המשתנה והפעילו מחדש את
        שרת הפיתוח.
      </p>
    )
  }

  if (!sessionChecked || !unlocked) {
    return (
      <form className={gateClassName} onSubmit={handleUnlock}>
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
        <button type="submit" className="candidate-edit-card__save">
          כניסה
        </button>
      </form>
    )
  }

  return <>{children}</>
}

/** Hook-style unlock state for pages that need unlocked in effects. */
export function usePipelineUnlock() {
  const secretConfigured = getPipelineSecretConfigured()
  const [unlocked, setUnlocked] = useState(false)
  const [sessionChecked, setSessionChecked] = useState(false)

  useEffect(() => {
    setUnlocked(isPipelineUnlockedInSession())
    setSessionChecked(true)
  }, [])

  return {
    secretConfigured,
    unlocked: sessionChecked && unlocked,
    markUnlocked: () => {
      setPipelineUnlockedInSession()
      setUnlocked(true)
      setSessionChecked(true)
    },
  }
}

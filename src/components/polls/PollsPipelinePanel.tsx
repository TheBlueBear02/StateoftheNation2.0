'use client'

import { useEffect, useState } from 'react'
import { KnessetRunSummary } from '../knesset/KnessetRunSummary'
import {
  POLLS_STAGE_LABELS,
  runPollsFullSync,
  runPollsStage,
  type PipelineRunSummary,
} from '../../lib/runPollsPipeline'

type PanelPhase = 'idle' | 'running' | 'success' | 'error'

function formatElapsed(seconds: number): string {
  if (seconds <= 0) {
    return 'מתחיל…'
  }
  return `${seconds} שנ'`
}

export function PollsPipelinePanel({
  onComplete,
}: {
  onComplete: () => Promise<void>
}) {
  const [phase, setPhase] = useState<PanelPhase>('idle')
  const [message, setMessage] = useState<string | null>(null)
  const [currentStage, setCurrentStage] = useState<number | null>(null)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [runSummary, setRunSummary] = useState<PipelineRunSummary | null>(null)
  const [force, setForce] = useState(false)
  const [backfill, setBackfill] = useState(false)

  useEffect(() => {
    if (phase !== 'running') {
      return
    }

    const timer = window.setInterval(() => {
      setElapsedSeconds((current) => current + 1)
    }, 1000)

    return () => {
      window.clearInterval(timer)
    }
  }, [phase])

  async function handleFullSync() {
    setPhase('running')
    setMessage(null)
    setElapsedSeconds(0)
    setCurrentStage(null)
    setRunSummary(null)

    const result = await runPollsFullSync({ force, backfill })
    if (!result.ok) {
      setPhase('error')
      setMessage(result.error)
      return
    }

    setRunSummary(result.summary)
    setPhase('success')
    setCurrentStage(null)
    setMessage(result.message)
    await onComplete()
  }

  async function handleRunStage(stage: number) {
    setPhase('running')
    setMessage(null)
    setElapsedSeconds(0)
    setCurrentStage(stage)
    setRunSummary(null)

    const result = await runPollsStage(stage, { force, backfill })
    if (!result.ok) {
      setPhase('error')
      setMessage(result.error)
      setCurrentStage(null)
      return
    }

    setRunSummary(result.summary)
    setPhase('success')
    setCurrentStage(null)
    setMessage(result.message)
    await onComplete()
  }

  const running = phase === 'running'

  return (
    <section
      className="party-detail-card party-pipeline-panel"
      aria-labelledby="polls-pipeline-title"
    >
      <div className="party-detail-card__header">
        <p className="party-detail-card__eyebrow">צינור נתונים</p>
        <h2 id="polls-pipeline-title" className="party-detail-card__title">
          סנכרון ויקיפדיה → מסד הנתונים
        </h2>
        <p className="party-pipeline-panel__intro">
          הרצה רגילה מושכת את דף הסקרים הראשי ומפרסרת רק את טבלת המנדטים
          העדכנית ביותר (Seat projections) — בלי טבלאות ארכיון ותרחישים.
          שורות שכבר קיימות במסד לא נכנסות מחדש לתור. סמנו &quot;כפייה&quot;
          כדי למשוך מחדש גם כש־revid לא השתנה, או &quot;backfill&quot; לכל
          הטבלאות וכל ארבעת דפי הויקיפדיה.
        </p>
      </div>

      <div className="polls-pipeline-panel__options">
        <label className="polls-pipeline-panel__checkbox">
          <input
            type="checkbox"
            checked={force}
            disabled={running}
            onChange={(event) => setForce(event.target.checked)}
          />
          <span>כפייה (force) — משיכה מחדש גם בלי שינוי revid</span>
        </label>
        <label className="polls-pipeline-panel__checkbox">
          <input
            type="checkbox"
            checked={backfill}
            disabled={running}
            onChange={(event) => setBackfill(event.target.checked)}
          />
          <span>backfill — כל הטבלאות + כל ארבעת דפי הויקיפדיה</span>
        </label>
      </div>

      <div className="knesset-pipeline-panel__stages">
        {Object.entries(POLLS_STAGE_LABELS).map(([stageKey, label]) => {
          const stage = Number(stageKey)
          return (
            <div key={stage} className="knesset-pipeline-panel__stage-row">
              <span className="knesset-pipeline-panel__stage-label">
                {stage}. {label}
              </span>
              <button
                type="button"
                className="candidate-edit-card__collapse"
                disabled={running}
                onClick={() => void handleRunStage(stage)}
              >
                הרץ
              </button>
            </div>
          )
        })}
      </div>

      <div className="party-pipeline-panel__actions">
        <button
          type="button"
          className="candidate-edit-card__save"
          disabled={running}
          onClick={() => void handleFullSync()}
        >
          {running && currentStage === null
            ? 'מריץ סנכרון…'
            : 'טען סקרים חדשים'}
        </button>
      </div>

      {running ? (
        <p
          className="candidate-edit-card__pipeline-running"
          role="status"
          aria-live="polite"
        >
          <span
            className="candidate-edit-card__pipeline-spinner"
            aria-hidden="true"
          />
          {currentStage
            ? `שלב ${currentStage} מתוך 6 — ${POLLS_STAGE_LABELS[currentStage]} (${formatElapsed(elapsedSeconds)})`
            : `מריץ… (${formatElapsed(elapsedSeconds)})`}
        </p>
      ) : null}

      <KnessetRunSummary summary={runSummary} title="סיכום הרצה נוכחית" />

      {message ? (
        <p
          className={
            phase === 'error'
              ? 'candidate-edit-card__status candidate-edit-card__status--error'
              : 'candidate-edit-card__status candidate-edit-card__status--success'
          }
          role={phase === 'error' ? 'alert' : 'status'}
        >
          {message}
        </p>
      ) : null}
    </section>
  )
}

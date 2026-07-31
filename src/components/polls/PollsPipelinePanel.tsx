'use client'

import { useEffect, useState } from 'react'
import { KnessetRunSummary } from '../knesset/KnessetRunSummary'
import {
  formatPipelineElapsed,
  usePipelineRunProgress,
} from '../../hooks/usePipelineRunProgress'
import {
  POLLS_STAGE_LABELS,
  runPollsStage,
  savePollsSiteUpdate,
  type PollsDiagnostics,
  type PollsSiteUpdate,
  type PipelineRunSummary,
} from '../../lib/runPollsPipeline'

type PanelPhase = 'idle' | 'running' | 'success' | 'error'

const STAGE_NUMBERS = [1, 2, 3, 4, 5, 6, 7] as const
const TOTAL_STAGES = STAGE_NUMBERS.length

function mergeSummaries(parts: PipelineRunSummary[]): PipelineRunSummary {
  const stages = parts.flatMap((part) => part.stages)
  return {
    stages,
    totals: {
      upserted: stages.reduce((sum, stage) => sum + stage.upserted, 0),
      inserted: stages.reduce((sum, stage) => sum + stage.inserted, 0),
      updated: stages.reduce((sum, stage) => sum + stage.updated, 0),
    },
  }
}

function mergeDiagnostics(parts: PollsDiagnostics[]): PollsDiagnostics {
  const lines: string[] = []
  const seen = new Set<string>()
  const rejected = parts.flatMap((part) => part.rejected ?? [])
  for (const part of parts) {
    for (const line of part.lines ?? []) {
      if (!line || seen.has(line)) continue
      seen.add(line)
      lines.push(line)
    }
  }
  return { lines, rejected }
}

function lineTone(line: string): 'error' | 'warning' | 'info' {
  const upper = line.toUpperCase()
  if (
    upper.startsWith('ERROR') ||
    upper.startsWith('REJECTED') ||
    upper.includes(' FAILED')
  ) {
    return 'error'
  }
  if (upper.startsWith('WARNING') || upper.includes('WARNING')) {
    return 'warning'
  }
  return 'info'
}

function wordCount(text: string): number {
  return text
    .trim()
    .split(/\s+/)
    .filter(Boolean).length
}

export function PollsPipelinePanel({
  onComplete,
  initialDiagnostics = null,
}: {
  onComplete: () => Promise<void>
  initialDiagnostics?: PollsDiagnostics | null
}) {
  const [phase, setPhase] = useState<PanelPhase>('idle')
  const [message, setMessage] = useState<string | null>(null)
  const [runSummary, setRunSummary] = useState<PipelineRunSummary | null>(null)
  const [diagnostics, setDiagnostics] = useState<PollsDiagnostics | null>(
    initialDiagnostics,
  )
  const [force, setForce] = useState(false)
  const [backfill, setBackfill] = useState(false)
  const [siteUpdate, setSiteUpdate] = useState<PollsSiteUpdate | null>(null)
  const [headlineDraft, setHeadlineDraft] = useState('')
  const [savingHeadline, setSavingHeadline] = useState(false)
  const [headlineSaveMessage, setHeadlineSaveMessage] = useState<string | null>(
    null,
  )
  const progress = usePipelineRunProgress(phase === 'running')

  useEffect(() => {
    if (phase === 'running') {
      return
    }
    setDiagnostics(initialDiagnostics)
  }, [initialDiagnostics, phase])

  function applySiteUpdate(next: PollsSiteUpdate | null | undefined) {
    if (!next?.headline) {
      return
    }
    setSiteUpdate(next)
    setHeadlineDraft(next.headline)
    setHeadlineSaveMessage(null)
  }

  async function handleFullSync() {
    setPhase('running')
    setMessage(null)
    setRunSummary(null)
    setDiagnostics(null)
    setSiteUpdate(null)
    setHeadlineDraft('')
    setHeadlineSaveMessage(null)
    progress.resetRun()

    const syncStartedAt = new Date().toISOString()
    const parts: PipelineRunSummary[] = []
    const diagParts: PollsDiagnostics[] = []

    for (const stage of STAGE_NUMBERS) {
      progress.beginStep(stage)
      const result = await runPollsStage(stage, {
        force,
        backfill,
        ...(stage === 7 ? { since: syncStartedAt } : {}),
      })
      if (!result.ok) {
        progress.finishStep(stage)
        setPhase('error')
        setMessage(result.error)
        setDiagnostics({
          lines: [`ERROR  stage ${stage}  ${result.error}`],
          rejected: [],
        })
        return
      }
      progress.finishStep(stage)
      parts.push(result.summary)
      if (result.diagnostics) {
        diagParts.push(result.diagnostics)
      }
      if (result.siteUpdate) {
        applySiteUpdate(result.siteUpdate)
      }
    }

    setRunSummary(mergeSummaries(parts))
    setDiagnostics(mergeDiagnostics(diagParts))
    setPhase('success')
    progress.clearCurrent()
    setMessage('סנכרון סקרים הושלם')
    await onComplete()
  }

  async function handleRunStage(stage: number) {
    setPhase('running')
    setMessage(null)
    setRunSummary(null)
    setDiagnostics(null)
    if (stage === 7) {
      setHeadlineSaveMessage(null)
    }
    progress.resetRun()
    progress.beginStep(stage)

    const result = await runPollsStage(stage, { force, backfill })
    if (!result.ok) {
      progress.finishStep(stage)
      setPhase('error')
      setMessage(result.error)
      setDiagnostics({
        lines: [`ERROR  stage ${stage}  ${result.error}`],
        rejected: [],
      })
      return
    }

    progress.finishStep(stage)
    setRunSummary(result.summary)
    setDiagnostics(result.diagnostics ?? null)
    if (result.siteUpdate) {
      applySiteUpdate(result.siteUpdate)
    } else if (stage === 7) {
      setSiteUpdate(null)
      setHeadlineDraft('')
    }
    setPhase('success')
    progress.clearCurrent()
    setMessage(result.message)
    await onComplete()
  }

  async function handleSaveHeadline() {
    if (!siteUpdate?.id) {
      setHeadlineSaveMessage('אין עדכון לשמירה')
      return
    }
    const nextHeadline = headlineDraft.trim()
    if (!nextHeadline) {
      setHeadlineSaveMessage('חסרה כותרת')
      return
    }

    setSavingHeadline(true)
    setHeadlineSaveMessage(null)
    const result = await savePollsSiteUpdate(siteUpdate.id, nextHeadline)
    setSavingHeadline(false)

    if (!result.ok) {
      setHeadlineSaveMessage(result.error)
      return
    }

    setSiteUpdate(result.siteUpdate)
    setHeadlineDraft(result.siteUpdate.headline)
    setHeadlineSaveMessage('הכותרת נשמרה')
  }

  const running = phase === 'running'
  const { currentStage, totalElapsedSeconds, stepElapsedSeconds, stepDurations } =
    progress
  const consoleLines = diagnostics?.lines ?? []
  const headlineDirty =
    Boolean(siteUpdate) && headlineDraft.trim() !== (siteUpdate?.headline ?? '')
  const draftWordCount = wordCount(headlineDraft)

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
          הטבלאות וכל ארבעת דפי הויקיפדיה. שלב 7 יוצר כותרת לפס החדשות בדף
          הבית כשיש סקרים חדשים.
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

      <div className="knesset-pipeline-panel__stages" aria-label="שלבי הצינור">
        {STAGE_NUMBERS.map((stage) => {
          const label = POLLS_STAGE_LABELS[stage]
          const isCurrent = running && currentStage === stage
          const isDone = stepDurations[stage] !== undefined && !isCurrent
          const duration = isCurrent
            ? stepElapsedSeconds
            : stepDurations[stage]

          return (
            <div
              key={stage}
              className={`knesset-pipeline-panel__stage-row${
                isCurrent ? ' knesset-pipeline-panel__stage-row--running' : ''
              }${isDone ? ' knesset-pipeline-panel__stage-row--done' : ''}`}
            >
              <span className="knesset-pipeline-panel__stage-label">
                {isCurrent ? (
                  <span
                    className="candidate-edit-card__pipeline-spinner knesset-pipeline-panel__stage-spinner"
                    aria-hidden="true"
                  />
                ) : null}
                {stage}. {label}
                {duration !== undefined ? (
                  <span className="knesset-pipeline-panel__stage-time">
                    {formatPipelineElapsed(duration)}
                  </span>
                ) : null}
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
          {running && currentStage !== null
            ? `מריץ שלב ${currentStage}…`
            : running
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
            ? `שלב ${currentStage} מתוך ${TOTAL_STAGES} — ${POLLS_STAGE_LABELS[currentStage]} (${formatPipelineElapsed(stepElapsedSeconds)}) · סה״כ ${formatPipelineElapsed(totalElapsedSeconds)}`
            : `מריץ… (${formatPipelineElapsed(totalElapsedSeconds)})`}
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

      {siteUpdate ? (
        <div
          className="polls-site-update"
          aria-labelledby="polls-site-update-title"
        >
          <div className="polls-site-update__header">
            <h3 id="polls-site-update-title" className="polls-site-update__title">
              עדכון לפס החדשות בדף הבית
            </h3>
            <p className="polls-site-update__hint">
              הכותרת נשמרה אוטומטית אחרי יצירה. אפשר לערוך ולשמור מחדש. מומלץ עד
              8 מילים. קישור: {siteUpdate.href}
            </p>
          </div>
          <label className="polls-site-update__label" htmlFor="polls-site-update-headline">
            כותרת
          </label>
          <textarea
            id="polls-site-update-headline"
            className="polls-site-update__textarea"
            rows={2}
            value={headlineDraft}
            disabled={running || savingHeadline || !siteUpdate.id}
            onChange={(event) => {
              setHeadlineDraft(event.target.value)
              setHeadlineSaveMessage(null)
            }}
          />
          <div className="polls-site-update__meta">
            <span
              className={
                draftWordCount > 8
                  ? 'polls-site-update__words polls-site-update__words--warn'
                  : 'polls-site-update__words'
              }
            >
              {draftWordCount} מילים
            </span>
            <button
              type="button"
              className="candidate-edit-card__save"
              disabled={
                running ||
                savingHeadline ||
                !siteUpdate.id ||
                !headlineDraft.trim() ||
                !headlineDirty
              }
              onClick={() => void handleSaveHeadline()}
            >
              {savingHeadline ? 'שומר…' : 'שמור כותרת'}
            </button>
          </div>
          {headlineSaveMessage ? (
            <p
              className={
                headlineSaveMessage === 'הכותרת נשמרה'
                  ? 'candidate-edit-card__status candidate-edit-card__status--success'
                  : 'candidate-edit-card__status candidate-edit-card__status--error'
              }
              role="status"
            >
              {headlineSaveMessage}
            </p>
          ) : null}
        </div>
      ) : null}

      <div
        className="polls-pipeline-console"
        aria-labelledby="polls-pipeline-console-title"
      >
        <div className="polls-pipeline-console__header">
          <h3
            id="polls-pipeline-console-title"
            className="polls-pipeline-console__title"
          >
            קונסולת שגיאות / אזהרות
          </h3>
          <p className="polls-pipeline-console__hint">
            דחיות נרמול, תוויות מפלגה לא ממופות, כשלי תאריך וולידציה מופיעים
            כאן אחרי הרצה.
          </p>
        </div>
        {consoleLines.length === 0 ? (
          <p className="polls-pipeline-console__empty">
            אין הודעות עדיין — הריצו סנכרון או שלב בודד.
          </p>
        ) : (
          <pre
            className="polls-pipeline-console__body"
            role="log"
            aria-live="polite"
          >
            {consoleLines.map((line, index) => (
              <span
                key={`${index}-${line.slice(0, 40)}`}
                className={`polls-pipeline-console__line polls-pipeline-console__line--${lineTone(line)}`}
              >
                {line}
                {'\n'}
              </span>
            ))}
          </pre>
        )}
      </div>
    </section>
  )
}

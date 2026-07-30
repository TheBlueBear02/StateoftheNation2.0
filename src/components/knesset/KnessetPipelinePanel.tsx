'use client'

import { useState } from 'react'
import {
  formatPipelineElapsed,
  usePipelineRunProgress,
} from '../../hooks/usePipelineRunProgress'
import {
  applyFactionLinks,
  KNESSET_STAGE_LABELS,
  previewFactionLinks,
  runKmImages,
  runKnessetStage,
  type FactionLinkPreviewItem,
  type PipelineRunSummary,
} from '../../lib/runKnessetPipeline'
import { KnessetRunSummary } from './KnessetRunSummary'

type PanelPhase =
  | 'idle'
  | 'running'
  | 'preview'
  | 'success'
  | 'error'

const STAGE_NUMBERS = [1, 2, 3, 4, 5, 6] as const

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

export function KnessetPipelinePanel({
  onComplete,
}: {
  onComplete: () => Promise<void>
}) {
  const [phase, setPhase] = useState<PanelPhase>('idle')
  const [message, setMessage] = useState<string | null>(null)
  const [previewItems, setPreviewItems] = useState<FactionLinkPreviewItem[]>([])
  const [previewCount, setPreviewCount] = useState(0)
  const [hasPreview, setHasPreview] = useState(false)
  const [runSummary, setRunSummary] = useState<PipelineRunSummary | null>(null)
  const progress = usePipelineRunProgress(phase === 'running')

  async function handleFullSync() {
    setPhase('running')
    setMessage(null)
    setRunSummary(null)
    progress.resetRun()

    const parts: PipelineRunSummary[] = []

    for (const stage of STAGE_NUMBERS) {
      progress.beginStep(stage)
      const result = await runKnessetStage(stage)
      if (!result.ok) {
        progress.finishStep(stage)
        setPhase('error')
        setMessage(result.error)
        return
      }
      progress.finishStep(stage)
      parts.push(result.summary)
    }

    setRunSummary(mergeSummaries(parts))
    setPhase('success')
    progress.clearCurrent()
    setMessage('סנכרון מלא הושלם')
    await onComplete()
  }

  async function handleRunStage(stage: number) {
    setPhase('running')
    setMessage(null)
    setRunSummary(null)
    progress.resetRun()
    progress.beginStep(stage)

    const result = await runKnessetStage(stage)
    if (!result.ok) {
      progress.finishStep(stage)
      setPhase('error')
      setMessage(result.error)
      return
    }

    progress.finishStep(stage)
    setRunSummary(result.summary)
    setPhase('success')
    progress.clearCurrent()
    setMessage(result.message)
    await onComplete()
  }

  async function handleFactionPreview() {
    setPhase('running')
    setMessage(null)
    progress.resetRun()

    const result = await previewFactionLinks()
    if (!result.ok) {
      setPhase('error')
      setMessage(result.error)
      return
    }

    setPreviewItems(result.items)
    setPreviewCount(result.count)
    setHasPreview(true)
    setPhase('preview')
    setMessage(`נמצאו ${result.count} עדכונים מתוכננים`)
  }

  async function handleFactionApply() {
    setPhase('running')
    setMessage(null)
    setRunSummary(null)
    progress.resetRun()

    const result = await applyFactionLinks()
    if (!result.ok) {
      setPhase('error')
      setMessage(result.error)
      return
    }

    setHasPreview(false)
    setPreviewItems([])
    setPreviewCount(0)
    setRunSummary(result.summary)
    setPhase('success')
    setMessage(`הוחלו ${result.applied} עדכונים`)
    await onComplete()
  }

  async function handleKmImages() {
    setPhase('running')
    setMessage(null)
    setRunSummary(null)
    progress.resetRun()

    const result = await runKmImages()
    if (!result.ok) {
      setPhase('error')
      setMessage(result.error)
      return
    }

    setPhase('success')
    setMessage(
      `עודכנו ${result.matchedCount} תמונות, ${result.unmatchedCount} ללא התאמה`,
    )
    setRunSummary(result.summary)
    await onComplete()
  }

  const running = phase === 'running'
  const { currentStage, totalElapsedSeconds, stepElapsedSeconds, stepDurations } =
    progress

  return (
    <section
      className="party-detail-card party-pipeline-panel"
      aria-labelledby="knesset-pipeline-title"
    >
      <div className="party-detail-card__header">
        <p className="party-detail-card__eyebrow">צינור נתונים</p>
        <h2 id="knesset-pipeline-title" className="party-detail-card__title">
          סנכרון OData → מסד הנתונים
        </h2>
        <p className="party-pipeline-panel__intro">
          הריצו סנכרון מלא או שלב בודד. שלב 5 טוען ממשלות מהמסד בלבד (ללא OData).
          לאחר הסנכרון, בדקו והחילו קישורי סיעות חסרים.
        </p>
      </div>

      <div className="knesset-pipeline-panel__stages" aria-label="שלבי הצינור">
        {STAGE_NUMBERS.map((stage) => {
          const label = KNESSET_STAGE_LABELS[stage]
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
              ? 'מריץ סנכרון מלא…'
              : 'התחל סנכרון מלא'}
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
            ? `שלב ${currentStage} מתוך 6 — ${KNESSET_STAGE_LABELS[currentStage]} (${formatPipelineElapsed(stepElapsedSeconds)}) · סה״כ ${formatPipelineElapsed(totalElapsedSeconds)}`
            : `מריץ… (${formatPipelineElapsed(totalElapsedSeconds)})`}
        </p>
      ) : null}

      <div className="knesset-pipeline-panel__post-sync">
        <h3 className="knesset-pipeline-panel__subheading">אחרי הסנכרון</h3>
        <p className="party-pipeline-panel__intro">
          קישורי סיעות: ממלא <code>faction_id</code> חסרים מ-Open Knesset.
          תמונות: מקשר JPEG מקומיים (הכנסת ה-25) לשדה <code>image_url</code>.
        </p>
        <div className="party-pipeline-panel__actions">
          <button
            type="button"
            className="candidate-edit-card__collapse"
            disabled={running}
            onClick={() => void handleFactionPreview()}
          >
            בדוק קישורי סיעות
          </button>
          <button
            type="button"
            className="candidate-edit-card__save"
            disabled={running || !hasPreview}
            onClick={() => void handleFactionApply()}
          >
            החל קישורי סיעות
          </button>
          <button
            type="button"
            className="candidate-edit-card__collapse"
            disabled={running}
            onClick={() => void handleKmImages()}
          >
            עדכן תמונות
          </button>
        </div>
      </div>

      {previewItems.length > 0 ? (
        <div className="party-pipeline-panel__preview">
          <p className="party-pipeline-panel__preview-title">
            תצוגה מקדימה ({previewCount} עדכונים, מוצגים{' '}
            {previewItems.length})
          </p>
          <table className="party-pipeline-panel__table">
            <thead>
              <tr>
                <th>כנסת</th>
                <th>ח״כ</th>
                <th>סיעה</th>
                <th>תאריך ייחוס</th>
              </tr>
            </thead>
            <tbody>
              {previewItems.map((item) => (
                <tr key={item.membershipId}>
                  <td>{item.knessetNumber}</td>
                  <td>{item.personName}</td>
                  <td>{item.factionName}</td>
                  <td>{item.referenceDate}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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

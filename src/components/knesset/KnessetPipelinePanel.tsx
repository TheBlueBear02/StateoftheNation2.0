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
  saveKnessetSiteUpdate,
  type FactionLinkPreviewItem,
  type KnessetSiteUpdate,
  type PipelineRunSummary,
} from '../../lib/runKnessetPipeline'
import { KnessetRunSummary } from './KnessetRunSummary'

type PanelPhase =
  | 'idle'
  | 'running'
  | 'preview'
  | 'success'
  | 'error'

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

function wordCount(text: string): number {
  return text
    .trim()
    .split(/\s+/)
    .filter(Boolean).length
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
  const [siteUpdate, setSiteUpdate] = useState<KnessetSiteUpdate | null>(null)
  const [headlineDraft, setHeadlineDraft] = useState('')
  const [savingHeadline, setSavingHeadline] = useState(false)
  const [headlineSaveMessage, setHeadlineSaveMessage] = useState<string | null>(
    null,
  )
  const progress = usePipelineRunProgress(phase === 'running')

  function applySiteUpdate(next: KnessetSiteUpdate | null | undefined) {
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
    setSiteUpdate(null)
    setHeadlineDraft('')
    setHeadlineSaveMessage(null)
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
      if (result.siteUpdate) {
        applySiteUpdate(result.siteUpdate)
      }
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
    if (stage === 7) {
      setHeadlineSaveMessage(null)
    }
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
    const result = await saveKnessetSiteUpdate(siteUpdate.id, nextHeadline)
    setSavingHeadline(false)

    if (!result.ok) {
      setHeadlineSaveMessage(result.error)
      return
    }

    setSiteUpdate(result.siteUpdate)
    setHeadlineDraft(result.siteUpdate.headline)
    setHeadlineSaveMessage('הכותרת נשמרה')
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
  const headlineDirty =
    Boolean(siteUpdate) && headlineDraft.trim() !== (siteUpdate?.headline ?? '')
  const draftWordCount = wordCount(headlineDraft)

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
          שלב 6 שומר שינויי חברויות/מינויים; שלב 7 יוצר כותרת לפס החדשות בדף
          הבית. לאחר הסנכרון, בדקו והחילו קישורי סיעות חסרים.
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
            ? `שלב ${currentStage} מתוך ${TOTAL_STAGES} — ${KNESSET_STAGE_LABELS[currentStage]} (${formatPipelineElapsed(stepElapsedSeconds)}) · סה״כ ${formatPipelineElapsed(totalElapsedSeconds)}`
            : `מריץ… (${formatPipelineElapsed(totalElapsedSeconds)})`}
        </p>
      ) : null}

      {siteUpdate ? (
        <div
          className="knesset-site-update"
          aria-labelledby="knesset-site-update-title"
        >
          <div className="knesset-site-update__header">
            <h3
              id="knesset-site-update-title"
              className="knesset-site-update__title"
            >
              עדכון לפס החדשות בדף הבית
            </h3>
            <p className="knesset-site-update__hint">
              הכותרת נשמרה אוטומטית אחרי יצירה. אפשר לערוך ולשמור מחדש. מומלץ עד
              8 מילים. קישור: {siteUpdate.href}
            </p>
          </div>
          <label
            className="knesset-site-update__label"
            htmlFor="knesset-site-update-headline"
          >
            כותרת
          </label>
          <textarea
            id="knesset-site-update-headline"
            className="knesset-site-update__textarea"
            rows={2}
            value={headlineDraft}
            disabled={running || savingHeadline || !siteUpdate.id}
            onChange={(event) => {
              setHeadlineDraft(event.target.value)
              setHeadlineSaveMessage(null)
            }}
          />
          <div className="knesset-site-update__meta">
            <span
              className={
                draftWordCount > 8
                  ? 'knesset-site-update__words knesset-site-update__words--warn'
                  : 'knesset-site-update__words'
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

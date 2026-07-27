import { useEffect, useState } from 'react'
import {
  applyFactionLinks,
  KNESSET_STAGE_LABELS,
  previewFactionLinks,
  runKmImages,
  runKnessetFullSync,
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

function formatElapsed(seconds: number): string {
  if (seconds <= 0) {
    return 'מתחיל…'
  }
  return `${seconds} שנ'`
}

export function KnessetPipelinePanel({
  onComplete,
}: {
  onComplete: () => Promise<void>
}) {
  const [phase, setPhase] = useState<PanelPhase>('idle')
  const [message, setMessage] = useState<string | null>(null)
  const [currentStage, setCurrentStage] = useState<number | null>(null)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [previewItems, setPreviewItems] = useState<FactionLinkPreviewItem[]>([])
  const [previewCount, setPreviewCount] = useState(0)
  const [hasPreview, setHasPreview] = useState(false)
  const [runSummary, setRunSummary] = useState<PipelineRunSummary | null>(null)

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

    const result = await runKnessetFullSync()
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

    const result = await runKnessetStage(stage)
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

  async function handleFactionPreview() {
    setPhase('running')
    setMessage(null)
    setElapsedSeconds(0)
    setCurrentStage(null)

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
    setElapsedSeconds(0)
    setRunSummary(null)

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
    setElapsedSeconds(0)
    setCurrentStage(null)
    setRunSummary(null)

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

      <div className="knesset-pipeline-panel__stages">
        {Object.entries(KNESSET_STAGE_LABELS).map(([stageKey, label]) => {
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
                onClick={() => handleRunStage(stage)}
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
          onClick={handleFullSync}
        >
          {running && currentStage === null
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
            ? `שלב ${currentStage} מתוך 6 — ${KNESSET_STAGE_LABELS[currentStage]} (${formatElapsed(elapsedSeconds)})`
            : `מריץ… (${formatElapsed(elapsedSeconds)})`}
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
            onClick={handleFactionPreview}
          >
            בדוק קישורי סיעות
          </button>
          <button
            type="button"
            className="candidate-edit-card__save"
            disabled={running || !hasPreview}
            onClick={handleFactionApply}
          >
            החל קישורי סיעות
          </button>
          <button
            type="button"
            className="candidate-edit-card__collapse"
            disabled={running}
            onClick={handleKmImages}
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

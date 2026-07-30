'use client'

import { useEffect, useState, type ChangeEvent } from 'react'
import {
  formatPipelineElapsed,
  usePipelineRunProgress,
} from '../../hooks/usePipelineRunProgress'
import type { ElectionParty } from '../../lib/supabase'
import {
  fetchPartyReviewQueue,
  insertPartyPipelineList,
  previewPartyPipelineList,
  resolvePartyReviewQueue,
  runPartyPipelineStage,
  type PipelineListFormat,
  type PipelinePreviewCandidate,
  type PipelineReviewItem,
} from '../../lib/runElectionPartyPipeline'

const STAGE_LABELS: Record<number, string> = {
  1: 'זיהוי מועמדים',
  2: 'העשרת Wikidata',
  3: 'יצירת תיאורים',
  4: 'גיאוקוד ערים',
  5: 'תאריכי לידה',
  6: 'קישורי ויקיפדיה',
}

const STAGE_NUMBERS = [1, 2, 3, 4, 5, 6] as const

type PanelPhase =
  | 'idle'
  | 'previewing'
  | 'running'
  | 'review'
  | 'success'
  | 'error'

type ReviewAction = 'approve' | 'new'

export function PartyPipelinePanel({
  party,
  onComplete,
}: {
  party: ElectionParty
  onComplete: () => Promise<void>
}) {
  const [listText, setListText] = useState('')
  const [format, setFormat] = useState<PipelineListFormat>('txt')
  const [preview, setPreview] = useState<PipelinePreviewCandidate[] | null>(null)
  const [reviewItems, setReviewItems] = useState<PipelineReviewItem[]>([])
  const [reviewActions, setReviewActions] = useState<
    Record<number, ReviewAction>
  >({})
  const [phase, setPhase] = useState<PanelPhase>('idle')
  const [message, setMessage] = useState<string | null>(null)
  const progress = usePipelineRunProgress(
    phase === 'running' || phase === 'previewing',
  )

  useEffect(() => {
    setListText('')
    setFormat('txt')
    setPreview(null)
    setReviewItems([])
    setReviewActions({})
    setPhase('idle')
    setMessage(null)
    progress.resetRun()
    // Only reset when switching parties.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [party.id])

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) {
      return
    }

    const text = await file.text()
    setListText(text)
    setPreview(null)
    setMessage(null)
    setFormat(file.name.toLowerCase().endsWith('.csv') ? 'csv' : 'txt')
    event.target.value = ''
  }

  async function handlePreview() {
    if (!listText.trim()) {
      setMessage('יש להדביק רשימת מועמדים')
      setPhase('error')
      return
    }

    setPhase('previewing')
    setMessage(null)
    progress.resetRun()

    const result = await previewPartyPipelineList({
      partyId: party.id,
      text: listText,
      format,
    })

    if (!result.ok) {
      setPhase('error')
      setMessage(result.error)
      return
    }

    setPreview(result.candidates)
    setPhase('idle')
    setMessage(`נמצאו ${result.count} מועמדים`)
  }

  async function runStages(fromStage: number) {
    for (let stage = fromStage; stage <= 6; stage += 1) {
      progress.beginStep(stage)

      const result = await runPartyPipelineStage(stage)
      if (!result.ok) {
        progress.finishStep(stage)
        setPhase('error')
        setMessage(result.error)
        return false
      }

      progress.finishStep(stage)

      if (stage === 1) {
        const queueResult = await fetchPartyReviewQueue(party.id)
        if (queueResult.ok && queueResult.items.length > 0) {
          setReviewItems(queueResult.items)
          const initialActions: Record<number, ReviewAction> = {}
          for (const item of queueResult.items) {
            initialActions[item.rawId] = 'approve'
          }
          setReviewActions(initialActions)
          setPhase('review')
          progress.clearCurrent()
          setMessage(
            `${queueResult.items.length} שמות דורשים אישור לפני המשך העיבוד`,
          )
          return false
        }
      }
    }

    return true
  }

  async function handleRunPipeline() {
    if (!listText.trim()) {
      setMessage('יש להדביק רשימת מועמדים')
      setPhase('error')
      return
    }

    setPhase('running')
    setMessage(null)
    progress.resetRun()

    const insertResult = await insertPartyPipelineList({
      partyId: party.id,
      text: listText,
      format,
    })

    if (!insertResult.ok) {
      setPhase('error')
      setMessage(insertResult.error)
      return
    }

    const completed = await runStages(1)
    if (!completed) {
      return
    }

    setPhase('success')
    progress.clearCurrent()
    setMessage('הצינור הושלם — המועמדים נטענו לרשימה')
    await onComplete()
  }

  async function handleResolveReview() {
    if (reviewItems.length === 0) {
      return
    }

    setPhase('running')
    setMessage(null)
    progress.resetRun()

    const actions = reviewItems.map((item) => ({
      rawId: item.rawId,
      action: reviewActions[item.rawId] ?? 'approve',
    }))

    const result = await resolvePartyReviewQueue({
      partyId: party.id,
      actions,
    })

    if (!result.ok) {
      setPhase('error')
      setMessage(result.error)
      return
    }

    if (result.remaining > 0) {
      const queueResult = await fetchPartyReviewQueue(party.id)
      if (queueResult.ok) {
        setReviewItems(queueResult.items)
      }
      setPhase('review')
      setMessage(`נותרו ${result.remaining} פריטים בתור הבדיקה`)
      return
    }

    setReviewItems([])
    const completed = await runStages(2)
    if (!completed) {
      return
    }

    setPhase('success')
    progress.clearCurrent()
    setMessage('הצינור הושלם — המועמדים נטענו לרשימה')
    await onComplete()
  }

  const running = phase === 'running' || phase === 'previewing'
  const partyLabel = party.shortName ?? party.name
  const {
    currentStage,
    totalElapsedSeconds,
    stepElapsedSeconds,
    stepDurations,
  } = progress

  return (
    <section
      className="party-detail-card party-pipeline-panel"
      aria-labelledby="party-pipeline-title"
    >
      <div className="party-detail-card__header">
        <p className="party-detail-card__eyebrow">צינור נתונים</p>
        <h2 id="party-pipeline-title" className="party-detail-card__title">
          הוספת רשימת מועמדים — {partyLabel}
        </h2>
        <p className="party-pipeline-panel__intro">
          הדביקו את רשימת המועמדים כפי שפורסמה (שם בכל שורה, או רשימה ממוספרת).
          לאחר הרצת הצינור תוכלו לערוך ולשמור כל מועמד בנפרד.
        </p>
      </div>

      <div className="party-pipeline-panel__controls">
        <label className="party-pipeline-panel__field">
          <span>פורמט</span>
          <select
            value={format}
            disabled={running}
            onChange={(event) => {
              setFormat(event.target.value as PipelineListFormat)
              setPreview(null)
            }}
          >
            <option value="txt">טקסט (שם בכל שורה)</option>
            <option value="csv">CSV (שם, עיר)</option>
          </select>
        </label>

        <label className="party-pipeline-panel__file">
          <span className="candidate-edit-card__enrich">העלאת קובץ</span>
          <input
            type="file"
            accept=".txt,.csv,text/plain,text/csv"
            disabled={running}
            onChange={handleFileChange}
          />
        </label>
      </div>

      <label className="party-pipeline-panel__field party-pipeline-panel__field--wide">
        <span>רשימת מועמדים</span>
        <textarea
          className="party-pipeline-panel__textarea"
          rows={10}
          value={listText}
          disabled={running}
          placeholder={'יאיר גולן\nנעמה לזימי\nגלעד קריב\n…'}
          onChange={(event) => {
            setListText(event.target.value)
            setPreview(null)
            if (phase === 'error') {
              setPhase('idle')
              setMessage(null)
            }
          }}
        />
      </label>

      <div className="party-pipeline-panel__actions">
        <button
          type="button"
          className="candidate-edit-card__collapse"
          disabled={running || !listText.trim()}
          onClick={() => void handlePreview()}
        >
          {phase === 'previewing' ? 'בודק…' : 'בדוק רשימה'}
        </button>

        {phase !== 'review' ? (
          <button
            type="button"
            className="candidate-edit-card__save"
            disabled={running || !listText.trim()}
            onClick={() => void handleRunPipeline()}
          >
            {phase === 'running' && currentStage !== null
              ? `מריץ שלב ${currentStage}…`
              : phase === 'running'
                ? 'מריץ צינור…'
                : 'התחל עיבוד'}
          </button>
        ) : (
          <button
            type="button"
            className="candidate-edit-card__save"
            disabled={running || reviewItems.length === 0}
            onClick={() => void handleResolveReview()}
          >
            {running ? 'מעבד…' : 'אשר והמשך'}
          </button>
        )}
      </div>

      {(phase === 'running' ||
        Object.keys(stepDurations).length > 0 ||
        currentStage !== null) && (
        <div className="knesset-pipeline-panel__stages" aria-label="שלבי הצינור">
          {STAGE_NUMBERS.map((stage) => {
            const isCurrent = phase === 'running' && currentStage === stage
            const isDone = stepDurations[stage] !== undefined && !isCurrent
            const duration = isCurrent
              ? stepElapsedSeconds
              : stepDurations[stage]

            return (
              <div
                key={stage}
                className={`knesset-pipeline-panel__stage-row knesset-pipeline-panel__stage-row--readonly${
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
                  {stage}. {STAGE_LABELS[stage]}
                  {duration !== undefined ? (
                    <span className="knesset-pipeline-panel__stage-time">
                      {formatPipelineElapsed(duration)}
                    </span>
                  ) : null}
                </span>
              </div>
            )
          })}
        </div>
      )}

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
            ? `שלב ${currentStage} מתוך 6 — ${STAGE_LABELS[currentStage]} (${formatPipelineElapsed(stepElapsedSeconds)}) · סה״כ ${formatPipelineElapsed(totalElapsedSeconds)}`
            : phase === 'previewing'
              ? `בודק רשימה… (${formatPipelineElapsed(totalElapsedSeconds)})`
              : `מעבד… (${formatPipelineElapsed(totalElapsedSeconds)})`}
        </p>
      ) : null}

      {message ? (
        <p
          className={
            phase === 'error'
              ? 'candidate-edit-card__status candidate-edit-card__status--error'
              : phase === 'success'
                ? 'candidate-edit-card__status'
                : 'party-pipeline-panel__hint'
          }
          role={phase === 'error' ? 'alert' : undefined}
        >
          {message}
        </p>
      ) : null}

      {preview && preview.length > 0 ? (
        <div className="party-pipeline-panel__preview">
          <h3 className="party-pipeline-panel__preview-title">תצוגה מקדימה</h3>
          <div className="party-pipeline-panel__table-wrap">
            <table className="party-pipeline-panel__table">
              <thead>
                <tr>
                  <th scope="col">מיקום</th>
                  <th scope="col">שם</th>
                  {format === 'csv' ? <th scope="col">עיר</th> : null}
                </tr>
              </thead>
              <tbody>
                {preview.map((candidate) => (
                  <tr key={`${candidate.listPosition}-${candidate.name}`}>
                    <td>{candidate.listPosition}</td>
                    <td>{candidate.name}</td>
                    {format === 'csv' ? (
                      <td>{candidate.city ?? '—'}</td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {phase === 'review' && reviewItems.length > 0 ? (
        <div className="party-pipeline-panel__review">
          <h3 className="party-pipeline-panel__preview-title">תור בדיקה — התאמות לא ודאיות</h3>
          <ul className="party-pipeline-panel__review-list">
            {reviewItems.map((item) => (
              <li key={item.rawId} className="party-pipeline-panel__review-item">
                <div className="party-pipeline-panel__review-copy">
                  <strong>{item.rawName}</strong>
                  <span>
                    התאמה: {item.bestMatch ?? '—'}
                    {item.score !== null ? ` (${Math.round(item.score * 100)}%)` : ''}
                  </span>
                </div>
                <div className="party-pipeline-panel__review-actions">
                  <button
                    type="button"
                    className={
                      reviewActions[item.rawId] === 'approve'
                        ? 'candidate-edit-card__save party-pipeline-panel__review-btn'
                        : 'candidate-edit-card__collapse party-pipeline-panel__review-btn'
                    }
                    disabled={running}
                    onClick={() => {
                      setReviewActions((current) => ({
                        ...current,
                        [item.rawId]: 'approve',
                      }))
                    }}
                  >
                    אשר התאמה
                  </button>
                  <button
                    type="button"
                    className={
                      reviewActions[item.rawId] === 'new'
                        ? 'candidate-edit-card__save party-pipeline-panel__review-btn'
                        : 'candidate-edit-card__collapse party-pipeline-panel__review-btn'
                    }
                    disabled={running}
                    onClick={() => {
                      setReviewActions((current) => ({
                        ...current,
                        [item.rawId]: 'new',
                      }))
                    }}
                  >
                    אדם חדש
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  )
}

'use client'

import { isDev } from '../lib/runtimeEnv'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { SiteLayout } from '../components/SiteLayout'
import { KnessetRunSummary } from '../components/knesset/KnessetRunSummary'
import { PollsPipelinePanel } from '../components/polls/PollsPipelinePanel'
import { PipelineUnlockGate } from '../components/pipelines/PipelineUnlockGate'
import {
  fetchPollsStatus,
  POLLS_STAGE_LABELS,
  type PipelineRunSummary,
  type PollsDiagnostics,
  type PollsSyncResource,
  type PollsTableCounts,
} from '../lib/runPollsPipeline'
import './ElectionPartyPage.css'
import './ElectionCandidatesEditPage.css'
import './KnessetPipelineEditPage.css'
import './ElectionsPollsEditPage.css'

const TABLE_LABELS: Record<keyof PollsTableCounts, string> = {
  polls: 'סקרים',
  poll_results: 'תוצאות',
  raw_poll_rows: 'שורות גולמיות',
  poll_aggregates: 'ממוצעים',
}

function formatDateTime(value: string | null): string {
  if (!value) {
    return 'טרם הורץ'
  }

  return new Intl.DateTimeFormat('he-IL', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

function formatLastPipelineRun(
  lastRunAt: string | null,
  action: string | null,
  stage: number | null,
): string {
  if (!lastRunAt) {
    return 'טרם הורץ'
  }

  const formatted = formatDateTime(lastRunAt)

  if (action === 'stage' && stage !== null) {
    return `${formatted} (שלב ${stage}: ${POLLS_STAGE_LABELS[stage] ?? stage})`
  }

  if (action === 'sync-full') {
    return `${formatted} (סנכרון מלא)`
  }

  return formatted
}

function shortResourceName(resource: string): string {
  return resource
    .replace('_opinion_polling_for_the_2026_Israeli_legislative_election', '')
    .replace('Opinion_polling_for_the_2026_Israeli_legislative_election', 'ראשי')
}

function ElectionsPollsEditContent() {
  const [statusLoading, setStatusLoading] = useState(false)
  const [statusError, setStatusError] = useState<string | null>(null)
  const [tableCounts, setTableCounts] = useState<PollsTableCounts | null>(null)
  const [pendingRawRows, setPendingRawRows] = useState<number | null>(null)
  const [reviewQueueCount, setReviewQueueCount] = useState<number | null>(null)
  const [syncResources, setSyncResources] = useState<PollsSyncResource[]>([])
  const [dbLastSuccessAt, setDbLastSuccessAt] = useState<string | null>(null)
  const [lastPipelineRunAt, setLastPipelineRunAt] = useState<string | null>(
    null,
  )
  const [lastPipelineAction, setLastPipelineAction] = useState<string | null>(
    null,
  )
  const [lastPipelineStage, setLastPipelineStage] = useState<number | null>(
    null,
  )
  const [lastRunSummary, setLastRunSummary] =
    useState<PipelineRunSummary | null>(null)
  const [diagnostics, setDiagnostics] = useState<PollsDiagnostics | null>(null)

  async function loadStatus() {
    if (!isDev) {
      return
    }

    setStatusLoading(true)
    setStatusError(null)

    const result = await fetchPollsStatus()
    if (!result.ok) {
      setStatusError(result.error)
      setTableCounts(null)
      setPendingRawRows(null)
      setReviewQueueCount(null)
      setSyncResources([])
      setDbLastSuccessAt(null)
      setLastPipelineRunAt(null)
      setLastPipelineAction(null)
      setLastPipelineStage(null)
      setLastRunSummary(null)
      setDiagnostics(null)
      setStatusLoading(false)
      return
    }

    setTableCounts(result.tables)
    setPendingRawRows(result.pendingRawRows)
    setReviewQueueCount(result.reviewQueueCount)
    setSyncResources(result.syncResources)
    setDbLastSuccessAt(result.dbLastSuccessAt)
    setLastPipelineRunAt(result.lastPipelineRunAt)
    setLastPipelineAction(result.lastPipelineAction)
    setLastPipelineStage(result.lastPipelineStage ?? null)
    setLastRunSummary(result.lastRunSummary ?? null)
    setDiagnostics(
      result.diagnostics ??
        (result.recentRejected?.length
          ? { lines: [], rejected: result.recentRejected }
          : null),
    )
    setStatusLoading(false)
  }

  useEffect(() => {
    void loadStatus()
  }, [])

  async function handlePipelineComplete() {
    await loadStatus()
  }

  return (
    <>
                <section
                  className="party-detail-card knesset-status-panel"
                  aria-labelledby="polls-status-title"
                >
                  <div className="party-detail-card__header">
                    <p className="party-detail-card__eyebrow">סטטוס</p>
                    <h2
                      id="polls-status-title"
                      className="party-detail-card__title"
                    >
                      מצב מסד הסקרים
                    </h2>
                    <p className="knesset-status-panel__last-run">
                      הרצה אחרונה מהממשק:{' '}
                      {formatLastPipelineRun(
                        lastPipelineRunAt,
                        lastPipelineAction,
                        lastPipelineStage,
                      )}
                    </p>
                    <p className="knesset-status-panel__last-run">
                      סנכרון אחרון מוצלח במסד: {formatDateTime(dbLastSuccessAt)}
                    </p>
                    <KnessetRunSummary
                      summary={lastRunSummary}
                      title="סיכום הרצה אחרונה"
                    />
                  </div>

                  {statusLoading ? (
                    <p className="election-edit-page__muted">טוען סטטוס…</p>
                  ) : null}

                  {statusError ? (
                    <p
                      className="candidate-edit-card__status candidate-edit-card__status--error"
                      role="alert"
                    >
                      {statusError}
                    </p>
                  ) : null}

                  {tableCounts ? (
                    <div className="knesset-status-panel__grid">
                      {(
                        Object.keys(TABLE_LABELS) as Array<
                          keyof PollsTableCounts
                        >
                      ).map((key) => (
                        <div key={key} className="knesset-status-panel__item">
                          <span className="knesset-status-panel__label">
                            {TABLE_LABELS[key]}
                          </span>
                          <span className="knesset-status-panel__value">
                            {tableCounts[key]}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : null}

                  {pendingRawRows !== null && pendingRawRows > 0 ? (
                    <p className="knesset-status-panel__alert">
                      {pendingRawRows} שורות גולמיות ממתינות לעיבוד
                    </p>
                  ) : null}

                  {reviewQueueCount !== null && reviewQueueCount > 0 ? (
                    <p className="knesset-status-panel__alert">
                      {reviewQueueCount} תוויות מפלגה בתור בדיקה
                      (review_queue.json)
                    </p>
                  ) : null}

                  {syncResources.length > 0 ? (
                    <div className="polls-sync-resources">
                      <h3 className="polls-sync-resources__title">
                        מצב דפי ויקיפדיה
                      </h3>
                      <table className="party-pipeline-panel__table">
                        <thead>
                          <tr>
                            <th>דף</th>
                            <th>revid</th>
                            <th>הצלחה אחרונה</th>
                          </tr>
                        </thead>
                        <tbody>
                          {syncResources.map((resource) => (
                            <tr key={resource.resource}>
                              <td title={resource.resource}>
                                {shortResourceName(resource.resource)}
                              </td>
                              <td>{resource.lastRevid ?? '—'}</td>
                              <td>
                                {formatDateTime(
                                  resource.lastSuccessAt ??
                                    resource.lastRunAt,
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : null}

                  {isDev ? (
                    <button
                      type="button"
                      className="candidate-edit-card__collapse"
                      disabled={statusLoading}
                      onClick={() => void loadStatus()}
                    >
                      רענן סטטוס
                    </button>
                  ) : null}
                </section>

                {isDev ? (
                  <PollsPipelinePanel
                    onComplete={handlePipelineComplete}
                    initialDiagnostics={diagnostics}
                  />
                ) : (
                  <p className="election-edit-page__panel" role="status">
                    הרצת הצינור זמינה רק בסביבת פיתוח (npm run dev).
                  </p>
                )}
    </>
  )
}

export function ElectionsPollsEditPage() {
  return (
    <SiteLayout className="election-edit-page">
      <main className="election-edit-page__main">
        <header className="election-edit-page__hero">
          <div className="election-edit-page__inner container">
            <Link href="/elections/polls" className="election-edit-page__back">
              חזרה לסקרי מנדטים
            </Link>
            <p className="election-edit-page__eyebrow">עדכון נתונים</p>
            <h1 className="election-edit-page__title">עדכון סקרי מנדטים</h1>
            <p className="election-edit-page__subtitle">
              הרצת צינור ויקיפדיה לטעינת סקרים חדשים שלא קיימים במסד הנתונים.
            </p>
          </div>
        </header>

        <section className="election-edit-page__content">
          <div className="election-edit-page__inner container">
            <PipelineUnlockGate>
              <ElectionsPollsEditContent />
            </PipelineUnlockGate>
          </div>
        </section>
      </main>
    </SiteLayout>
  )
}

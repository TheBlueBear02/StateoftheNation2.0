import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { SiteLayout } from '../components/SiteLayout'
import { KnessetRunSummary } from '../components/knesset/KnessetRunSummary'
import { PollsPipelinePanel } from '../components/polls/PollsPipelinePanel'
import {
  fetchPollsStatus,
  POLLS_STAGE_LABELS,
  type PipelineRunSummary,
  type PollsSyncResource,
  type PollsTableCounts,
} from '../lib/runPollsPipeline'
import './ElectionPartyPage.css'
import './ElectionCandidatesEditPage.css'
import './KnessetPipelineEditPage.css'
import './ElectionsPollsEditPage.css'

const UNLOCK_STORAGE_KEY = 'polls-edit-unlocked'
const EDIT_SECRET = import.meta.env.VITE_ELECTIONS_EDIT_SECRET as
  | string
  | undefined

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

function getUnlockedFromSession(): boolean {
  try {
    return sessionStorage.getItem(UNLOCK_STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

function setUnlockedInSession(): void {
  try {
    sessionStorage.setItem(UNLOCK_STORAGE_KEY, '1')
  } catch {
    // ignore
  }
}

export function ElectionsPollsEditPage() {
  const secretConfigured = Boolean(EDIT_SECRET)
  const [unlocked, setUnlocked] = useState(() => getUnlockedFromSession())
  const [password, setPassword] = useState('')
  const [passwordError, setPasswordError] = useState<string | null>(null)

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

  async function loadStatus() {
    if (!import.meta.env.DEV) {
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
    setStatusLoading(false)
  }

  useEffect(() => {
    if (secretConfigured && unlocked) {
      void loadStatus()
    }
  }, [secretConfigured, unlocked])

  async function handlePipelineComplete() {
    await loadStatus()
  }

  function handleUnlock(event: FormEvent) {
    event.preventDefault()
    if (!secretConfigured) {
      setPasswordError('חסר VITE_ELECTIONS_EDIT_SECRET בקובץ .env')
      return
    }
    if (password !== EDIT_SECRET) {
      setPasswordError('סיסמה שגויה')
      return
    }
    setUnlockedInSession()
    setUnlocked(true)
    setPasswordError(null)
    setPassword('')
  }

  return (
    <SiteLayout className="election-edit-page">
      <main className="election-edit-page__main">
        <header className="election-edit-page__hero">
          <div className="election-edit-page__inner container">
            <Link to="/elections/polls" className="election-edit-page__back">
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
            {!secretConfigured ? (
              <p className="election-edit-page__panel" role="alert">
                חסר VITE_ELECTIONS_EDIT_SECRET בקובץ .env — הוסיפו את המשתנה
                והפעילו מחדש את שרת הפיתוח.
              </p>
            ) : null}

            {secretConfigured && !unlocked ? (
              <form
                className="election-edit-page__gate party-detail-card"
                onSubmit={handleUnlock}
              >
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
            ) : null}

            {secretConfigured && unlocked ? (
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

                  {import.meta.env.DEV ? (
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

                {import.meta.env.DEV ? (
                  <PollsPipelinePanel onComplete={handlePipelineComplete} />
                ) : (
                  <p className="election-edit-page__panel" role="status">
                    הרצת הצינור זמינה רק בסביבת פיתוח (npm run dev).
                  </p>
                )}
              </>
            ) : null}
          </div>
        </section>
      </main>
    </SiteLayout>
  )
}

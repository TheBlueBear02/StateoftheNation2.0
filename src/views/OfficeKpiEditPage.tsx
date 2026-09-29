'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { SiteLayout } from '../components/SiteLayout'
import { PageBreadcrumb } from '../components/PageBreadcrumb'
import { PipelineUnlockGate } from '../components/pipelines/PipelineUnlockGate'
import {
  CANDIDATE_KIND_HE,
  CANDIDATE_STATUS_HE,
  CHECK_STATUS_HE,
  METHOD_HE,
  fetchOfficeKpiCandidates,
  fetchOfficeKpiFreshness,
  fetchOfficeKpiStatus,
  reviewOfficeKpiCandidate,
  saveOfficeKpiSiteUpdate,
  type OfficeKpiCandidate,
  type OfficeKpiFreshnessItem,
  type OfficeKpiPipelineRun,
  type OfficeKpiSiteUpdate,
  type OfficeKpiStatusCounts,
} from '../lib/officeKpiPipeline'
import './ElectionCandidatesEditPage.css'
import './OfficeKpiEditPage.css'

type StatusFilter = 'pending' | 'all' | 'published' | 'rejected'

function formatTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Intl.DateTimeFormat('he-IL', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(iso))
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('he-IL', {
    maximumFractionDigits: 4,
  }).format(value)
}

function runStatusLabel(status: OfficeKpiPipelineRun['status']): string {
  if (status === 'success') return 'הצלחה'
  if (status === 'warning') return 'אזהרה'
  return 'שגיאה'
}

function wordCount(text: string): number {
  return text
    .trim()
    .split(/\s+/)
    .filter(Boolean).length
}

function updatedIndexesFromPayload(
  payload: Record<string, unknown> | null,
): string[] {
  if (!payload) return []
  const raw = payload.updated_indexes
  if (!Array.isArray(raw)) return []
  return raw.filter((v): v is string => typeof v === 'string')
}

function CandidateCard({
  candidate,
  busy,
  onReview,
}: {
  candidate: OfficeKpiCandidate
  busy: boolean
  onReview: (
    id: number,
    action: 'approve' | 'reject',
    value?: number,
  ) => Promise<void>
}) {
  const [editValue, setEditValue] = useState(String(candidate.value))
  const canAct = candidate.needsApproval

  return (
    <article
      className={`office-kpi-edit__candidate office-kpi-edit__candidate--${candidate.status}`}
    >
      <header className="office-kpi-edit__candidate-head">
        <div>
          <p className="office-kpi-edit__eyebrow">{candidate.officeName}</p>
          <h3 className="office-kpi-edit__candidate-title">
            {candidate.indexName}
          </h3>
        </div>
        <span
          className={`office-kpi-edit__pill office-kpi-edit__pill--${candidate.status}`}
        >
          {CANDIDATE_STATUS_HE[candidate.status] ?? candidate.status}
        </span>
      </header>

      <dl className="office-kpi-edit__meta">
        <div>
          <dt>תקופה</dt>
          <dd>{candidate.label}</dd>
        </div>
        <div>
          <dt>סוג</dt>
          <dd>{CANDIDATE_KIND_HE[candidate.kind] ?? candidate.kind}</dd>
        </div>
        <div>
          <dt>שיטה</dt>
          <dd>{METHOD_HE[candidate.method] ?? candidate.method}</dd>
        </div>
        <div>
          <dt>נמצא</dt>
          <dd>{formatTime(candidate.createdAt)}</dd>
        </div>
      </dl>

      <div className="office-kpi-edit__values">
        <div>
          <span className="office-kpi-edit__value-label">ערך חדש</span>
          {canAct ? (
            <input
              className="office-kpi-edit__value-input"
              type="number"
              step="any"
              value={editValue}
              disabled={busy}
              onChange={(e) => setEditValue(e.target.value)}
            />
          ) : (
            <strong>{formatNumber(candidate.value)}</strong>
          )}
        </div>
        {candidate.previousValue !== null ? (
          <div>
            <span className="office-kpi-edit__value-label">היה</span>
            <strong>{formatNumber(candidate.previousValue)}</strong>
          </div>
        ) : null}
      </div>

      {candidate.flags.length > 0 ? (
        <p className="office-kpi-edit__flags">
          דגלים: {candidate.flags.join(' · ')}
        </p>
      ) : null}

      {candidate.sourceUrl ? (
        <p className="office-kpi-edit__source">
          <a href={candidate.sourceUrl} target="_blank" rel="noreferrer">
            מקור
          </a>
        </p>
      ) : null}

      {canAct ? (
        <div className="office-kpi-edit__actions">
          <button
            type="button"
            className="office-kpi-edit__btn office-kpi-edit__btn--approve"
            disabled={busy}
            onClick={() => {
              const parsed = Number(editValue)
              void onReview(
                candidate.id,
                'approve',
                Number.isFinite(parsed) ? parsed : undefined,
              )
            }}
          >
            אישור ופרסום
          </button>
          <button
            type="button"
            className="office-kpi-edit__btn office-kpi-edit__btn--reject"
            disabled={busy}
            onClick={() => void onReview(candidate.id, 'reject')}
          >
            דחייה
          </button>
        </div>
      ) : null}
    </article>
  )
}

function OfficeKpiEditContent() {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('pending')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<number | null>(null)
  const [lastRun, setLastRun] = useState<OfficeKpiPipelineRun | null>(null)
  const [recentRuns, setRecentRuns] = useState<OfficeKpiPipelineRun[]>([])
  const [counts, setCounts] = useState<OfficeKpiStatusCounts | null>(null)
  const [overdueChecks, setOverdueChecks] = useState(0)
  const [candidates, setCandidates] = useState<OfficeKpiCandidate[]>([])
  const [freshness, setFreshness] = useState<OfficeKpiFreshnessItem[]>([])
  const [siteUpdate, setSiteUpdate] = useState<OfficeKpiSiteUpdate | null>(null)
  const [headlineDraft, setHeadlineDraft] = useState('')
  const [savingHeadline, setSavingHeadline] = useState(false)
  const [headlineSaveMessage, setHeadlineSaveMessage] = useState<string | null>(
    null,
  )

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    const [statusRes, candRes, freshRes] = await Promise.all([
      fetchOfficeKpiStatus(),
      fetchOfficeKpiCandidates(statusFilter),
      fetchOfficeKpiFreshness(),
    ])

    if (!statusRes.ok) {
      setError(statusRes.error)
      setLoading(false)
      return
    }
    if (!candRes.ok) {
      setError(candRes.error)
      setLoading(false)
      return
    }

    setLastRun(statusRes.lastRun)
    setRecentRuns(statusRes.recentRuns)
    setCounts(statusRes.statusCounts)
    setOverdueChecks(statusRes.overdueChecks)
    setCandidates(candRes.candidates)
    setFreshness(freshRes.ok ? freshRes.items : [])
    const nextUpdate = statusRes.lastSiteUpdate ?? null
    setSiteUpdate(nextUpdate)
    setHeadlineDraft(nextUpdate?.headline ?? '')
    setHeadlineSaveMessage(null)
    setLoading(false)
  }, [statusFilter])

  useEffect(() => {
    void reload()
  }, [reload])

  const summary = useMemo(() => lastRun?.summary ?? null, [lastRun])
  const draftWordCount = wordCount(headlineDraft)
  const headlineDirty =
    Boolean(siteUpdate) &&
    headlineDraft.trim() !== (siteUpdate?.headline ?? '')
  const updatedIndexes = useMemo(
    () => updatedIndexesFromPayload(siteUpdate?.payload ?? null),
    [siteUpdate],
  )

  const onReview = useCallback(
    async (id: number, action: 'approve' | 'reject', value?: number) => {
      setBusyId(id)
      setActionError(null)
      const result = await reviewOfficeKpiCandidate({
        candidateId: id,
        action,
        value,
      })
      setBusyId(null)
      if (!result.ok) {
        setActionError(result.error)
        return
      }
      await reload()
    },
    [reload],
  )

  const onSaveHeadline = useCallback(async () => {
    if (!siteUpdate?.id) return
    const next = headlineDraft.trim()
    if (!next) {
      setHeadlineSaveMessage('חסרה כותרת')
      return
    }
    setSavingHeadline(true)
    setHeadlineSaveMessage(null)
    const result = await saveOfficeKpiSiteUpdate(siteUpdate.id, next)
    setSavingHeadline(false)
    if (!result.ok) {
      setHeadlineSaveMessage(result.error)
      return
    }
    setSiteUpdate(result.siteUpdate)
    setHeadlineDraft(result.siteUpdate.headline)
    setHeadlineSaveMessage('הכותרת נשמרה')
  }, [headlineDraft, siteUpdate])

  return (
    <div className="office-kpi-edit">
      <div className="office-kpi-edit__toolbar">
        <button
          type="button"
          className="office-kpi-edit__btn"
          onClick={() => void reload()}
          disabled={loading}
        >
          רענון
        </button>
        <Link href="/government/dashboard" className="office-kpi-edit__link">
          לדשבורד הציבורי
        </Link>
        <Link href="/piplines" className="office-kpi-edit__link">
          ללוח הצינורות
        </Link>
      </div>

      {error ? (
        <p className="office-kpi-edit__error" role="alert">
          {error}
        </p>
      ) : null}
      {actionError ? (
        <p className="office-kpi-edit__error" role="alert">
          {actionError}
        </p>
      ) : null}

      <section className="office-kpi-edit__section" aria-labelledby="kpi-run-title">
        <h2 id="kpi-run-title" className="office-kpi-edit__h2">
          תוצאות הרצה אחרונה
        </h2>
        {loading && !lastRun ? (
          <p className="office-kpi-edit__muted">טוען…</p>
        ) : lastRun ? (
          <div
            className={`office-kpi-edit__run office-kpi-edit__run--${lastRun.status}`}
          >
            <div className="office-kpi-edit__run-top">
              <span className="office-kpi-edit__pill">
                {runStatusLabel(lastRun.status)}
              </span>
              <time dateTime={lastRun.finished_at}>
                {formatTime(lastRun.finished_at)}
              </time>
              <span>{lastRun.source}</span>
            </div>
            {lastRun.message ? (
              <p className="office-kpi-edit__run-msg">{lastRun.message}</p>
            ) : null}
            {lastRun.error ? (
              <p className="office-kpi-edit__error-detail">{lastRun.error}</p>
            ) : null}
            {summary ? (
              <ul className="office-kpi-edit__stats">
                <li>
                  נבדקו <strong>{summary.due ?? 0}</strong>
                </li>
                <li>
                  פורסמו <strong>{summary.published ?? 0}</strong>
                </li>
                <li>
                  ממתינים <strong>{summary.pending ?? 0}</strong>
                </li>
                <li>
                  חדשים <strong>{summary.new ?? 0}</strong>
                </li>
                <li>
                  תיקונים <strong>{summary.revisions ?? 0}</strong>
                </li>
                <li>
                  נדחו <strong>{summary.rejected ?? 0}</strong>
                </li>
                <li>
                  באיחור <strong>{summary.overdue ?? overdueChecks}</strong>
                </li>
              </ul>
            ) : null}
            {summary?.errors && Object.keys(summary.errors).length > 0 ? (
              <div className="office-kpi-edit__error-box">
                <p className="office-kpi-edit__value-label">מקורות שנכשלו</p>
                <ul>
                  {Object.entries(summary.errors).map(([family, msg]) => (
                    <li key={family}>
                      <code>{family}</code>: {msg}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : (
          <p className="office-kpi-edit__muted">
            עדיין אין הרצות ביומן. אחרי הרצה ללא dry-run יופיעו כאן הסיכומים.
          </p>
        )}

        {recentRuns.length > 1 ? (
          <details className="office-kpi-edit__details">
            <summary>הרצות קודמות ({recentRuns.length - 1})</summary>
            <ol className="office-kpi-edit__run-list">
              {recentRuns.slice(1).map((run) => (
                <li key={run.id}>
                  <span>{runStatusLabel(run.status)}</span>
                  <time dateTime={run.finished_at}>
                    {formatTime(run.finished_at)}
                  </time>
                  <span>{run.message ?? '—'}</span>
                </li>
              ))}
            </ol>
          </details>
        ) : null}
      </section>

      <section
        className="office-kpi-edit__section"
        aria-labelledby="kpi-news-title"
      >
        <h2 id="kpi-news-title" className="office-kpi-edit__h2">
          עדכון לפס החדשות בדף הבית
        </h2>
        {siteUpdate ? (
          <>
            <p className="office-kpi-edit__muted">
              נוצר ב־{formatTime(siteUpdate.occurred_at)} · קישור:{' '}
              <Link href={siteUpdate.href}>{siteUpdate.href}</Link>
              {updatedIndexes.length > 0
                ? ` · מדדים: ${updatedIndexes.join(' · ')}`
                : ''}
            </p>
            <label
              className="office-kpi-edit__value-label"
              htmlFor="office-kpi-site-headline"
            >
              כותרת
            </label>
            <textarea
              id="office-kpi-site-headline"
              className="office-kpi-edit__headline"
              rows={2}
              value={headlineDraft}
              disabled={savingHeadline}
              onChange={(event) => {
                setHeadlineDraft(event.target.value)
                setHeadlineSaveMessage(null)
              }}
            />
            <div className="office-kpi-edit__headline-meta">
              <span
                className={
                  draftWordCount > 8
                    ? 'office-kpi-edit__words office-kpi-edit__words--warn'
                    : 'office-kpi-edit__words'
                }
              >
                {draftWordCount} מילים
              </span>
              <button
                type="button"
                className="office-kpi-edit__btn office-kpi-edit__btn--approve"
                disabled={savingHeadline || !headlineDirty}
                onClick={() => void onSaveHeadline()}
              >
                {savingHeadline ? 'שומר…' : 'שמור כותרת'}
              </button>
              {headlineSaveMessage ? (
                <span className="office-kpi-edit__muted">
                  {headlineSaveMessage}
                </span>
              ) : null}
            </div>
            <div
              className="office-kpi-edit__news-preview"
              aria-label="תצוגה מקדימה בפס החדשות"
            >
              <span className="office-kpi-edit__news-preview-label">
                תצוגה מקדימה
              </span>
              <span className="office-kpi-edit__news-preview-text">
                {headlineDraft.trim() || siteUpdate.headline}
              </span>
            </div>
          </>
        ) : (
          <p className="office-kpi-edit__muted">
            עדיין אין כותרת לפס החדשות להרצת מדדים זו. כותרת נוצרת רק אחרי ריצה
            שפרסמה ערכים חדשים (ואם OpenAI זמין). הריצה הראשונה נכשלה ביצירת
            הכותרת בגלל מחסור בקרדיטים — הריצו שוב אחרי שפורסמו מדדים חדשים.
          </p>
        )}
      </section>

      <section
        className="office-kpi-edit__section"
        aria-labelledby="kpi-counts-title"
      >
        <h2 id="kpi-counts-title" className="office-kpi-edit__h2">
          סטטוס מועמדים במסד
        </h2>
        {counts ? (
          <ul className="office-kpi-edit__stats office-kpi-edit__stats--grid">
            {(
              [
                'pending',
                'published',
                'rejected',
                'approved',
                'superseded',
              ] as const
            ).map((key) => (
              <li key={key}>
                {CANDIDATE_STATUS_HE[key]}{' '}
                <strong>{counts[key] ?? 0}</strong>
              </li>
            ))}
          </ul>
        ) : (
          <p className="office-kpi-edit__muted">אין סיכום עדיין</p>
        )}
      </section>

      <section
        className="office-kpi-edit__section"
        aria-labelledby="kpi-candidates-title"
      >
        <div className="office-kpi-edit__section-head">
          <h2 id="kpi-candidates-title" className="office-kpi-edit__h2">
            נתונים שנמצאו
          </h2>
          <div className="office-kpi-edit__filters" role="tablist">
            {(
              [
                ['pending', 'ממתינים לאישור'],
                ['published', 'פורסמו'],
                ['rejected', 'נדחו'],
                ['all', 'הכל'],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={statusFilter === value}
                className={
                  statusFilter === value
                    ? 'office-kpi-edit__filter office-kpi-edit__filter--active'
                    : 'office-kpi-edit__filter'
                }
                onClick={() => setStatusFilter(value)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <p className="office-kpi-edit__muted">טוען מועמדים…</p>
        ) : candidates.length === 0 ? (
          <p className="office-kpi-edit__muted">
            {statusFilter === 'pending'
              ? 'אין ערכים שממתינים לאישור כרגע.'
              : 'אין מועמדים להצגה במסנן זה.'}
          </p>
        ) : (
          <div className="office-kpi-edit__candidate-grid">
            {candidates.map((candidate) => (
              <CandidateCard
                key={candidate.id}
                candidate={candidate}
                busy={busyId === candidate.id}
                onReview={onReview}
              />
            ))}
          </div>
        )}
      </section>

      <section
        className="office-kpi-edit__section"
        aria-labelledby="kpi-fresh-title"
      >
        <h2 id="kpi-fresh-title" className="office-kpi-edit__h2">
          מצב בדיקות (רעננות)
        </h2>
        {freshness.length === 0 ? (
          <p className="office-kpi-edit__muted">
            עדיין אין רשומות ב־kpi_check_state — יופיעו אחרי הרצה מלאה.
          </p>
        ) : (
          <div className="office-kpi-edit__table-wrap">
            <table className="office-kpi-edit__table">
              <thead>
                <tr>
                  <th>משרד</th>
                  <th>מדד</th>
                  <th>יעד</th>
                  <th>סטטוס</th>
                  <th>נבדק לאחרונה</th>
                  <th>שגיאה</th>
                </tr>
              </thead>
              <tbody>
                {freshness.map((item) => (
                  <tr key={`${item.indexId}-${item.targetPeriod}`}>
                    <td>{item.officeName}</td>
                    <td>{item.indexName}</td>
                    <td dir="ltr">{item.targetPeriod}</td>
                    <td>
                      <span
                        className={`office-kpi-edit__pill office-kpi-edit__pill--check-${item.status}`}
                      >
                        {CHECK_STATUS_HE[item.status] ?? item.status}
                      </span>
                    </td>
                    <td>{formatTime(item.lastCheckedAt)}</td>
                    <td className="office-kpi-edit__cell-error">
                      {item.lastError ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}

export function OfficeKpiEditPage() {
  return (
    <SiteLayout className="site--pipelines-dash">
      <main className="pipelines-dash">
        <div className="pipelines-dash__inner container">
          <header className="pipelines-dash__hero">
            <PageBreadcrumb
              items={[
                { label: 'צינורות נתונים', href: '/piplines' },
                { label: 'מדדי משרדים' },
              ]}
            />
            <h1 className="pipelines-dash__title">
              מדדי משרדים — תוצאות ואישורים
            </h1>
            <p className="pipelines-dash__intro">
              סיכום הרצות הצינור, הערכים שנמצאו, וסטטוס אישור לכל נקודת נתון
              לפני שהיא מגיעה לדשבורד הציבורי.
            </p>
          </header>

          <PipelineUnlockGate
            panelClassName="pipelines-dash__panel"
            gateClassName="pipelines-dash__gate party-detail-card"
          >
            <OfficeKpiEditContent />
          </PipelineUnlockGate>
        </div>
      </main>
    </SiteLayout>
  )
}

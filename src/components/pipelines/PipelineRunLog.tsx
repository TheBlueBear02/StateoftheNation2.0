'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { PipelineRunRow } from '../../hooks/usePipelineRuns'
import { getPipelineById, PIPELINES } from '../../content/pipelines'
import './PipelineRunLog.css'

const STATUS_LABEL: Record<PipelineRunRow['status'], string> = {
  success: 'הצלחה',
  error: 'שגיאה',
  warning: 'אזהרה',
}

const SOURCE_LABEL: Record<PipelineRunRow['source'], string> = {
  ui: 'ממשק',
  cli: 'CLI',
  'github-actions': 'GitHub Actions',
}

const CHANGE_STATUS_HE: Record<string, string> = {
  published: 'פורסם',
  pending: 'ממתין לאישור',
  rejected: 'נדחה',
  approved: 'אושר',
}

const CHANGE_KIND_HE: Record<string, string> = {
  new: 'חדש',
  revision: 'תיקון',
  same: 'זהה',
}

type SummaryChange = {
  key?: number
  index_id?: number
  name?: string
  office?: string
  label?: string
  value?: number
  previous_value?: number | null
  kind?: string
  status?: string
  method?: string
  flags?: string[]
  source_url?: string | null
}

function pipelineTitle(pipelineId: string): string {
  const fromRegistry = getPipelineById(pipelineId)
  if (fromRegistry) return fromRegistry.title
  const match = PIPELINES.find(
    (p) => p.id === pipelineId || p.id.includes(pipelineId),
  )
  if (match) return match.title
  if (pipelineId === 'polls' || pipelineId === 'elections-2026-polls') {
    return 'סקרי מנדטים — בחירות 2026'
  }
  if (pipelineId === 'knesset') return 'נתוני הכנסת'
  if (pipelineId === 'elections-candidates') return 'מועמדי בחירות 2026'
  if (pipelineId === 'office-kpis') return 'מדדי משרדים — דשבורד הממשלה'
  return pipelineId
}

function formatTime(iso: string): string {
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

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value)
    return Number.isFinite(n) ? n : null
  }
  return null
}

function readChanges(summary: Record<string, unknown> | null): SummaryChange[] {
  if (!summary || !Array.isArray(summary.changes)) return []
  return summary.changes as SummaryChange[]
}

/** Prefer structured Hebrew summary for office-kpis; fall back to stored message. */
function formatRunMessage(run: PipelineRunRow): string | null {
  const summary = run.summary
  if (run.pipeline === 'office-kpis' && summary) {
    const published = asNumber(summary.published) ?? 0
    const pending = asNumber(summary.pending) ?? 0
    const due = asNumber(summary.due) ?? 0
    const rejected = asNumber(summary.rejected) ?? 0
    const parts = [
      `פורסמו ${published}`,
      `ממתינים לאישור ${pending}`,
      `נבדקו ${due}`,
    ]
    if (rejected > 0) parts.push(`נדחו ${rejected}`)
    return parts.join(' · ')
  }

  // English KPI messages scramble under RTL — normalize if we recognize the pattern.
  if (run.message) {
    const m = run.message.match(
      /^(\d+)\s+published\s*·\s*(\d+)\s+pending\s*·\s*(\d+)\s+checked$/i,
    )
    if (m) {
      return `פורסמו ${m[1]} · ממתינים לאישור ${m[2]} · נבדקו ${m[3]}`
    }
  }

  return run.message
}

function editPathFor(pipelineId: string): string | null {
  return getPipelineById(pipelineId)?.editPath ?? null
}

function ChangeRow({
  change,
  showFlags = false,
}: {
  change: SummaryChange
  showFlags?: boolean
}) {
  const sourceUrl =
    typeof change.source_url === 'string' && change.source_url.trim()
      ? change.source_url.trim()
      : null

  return (
    <li>
      <span className="pipeline-run-log__change-name">
        {change.office ? `${change.office} · ` : ''}
        {change.name ?? `מדד ${change.key ?? change.index_id}`}
      </span>
      <span className="pipeline-run-log__change-meta">
        {change.label ?? '—'}
        {!showFlags && change.kind
          ? ` · ${CHANGE_KIND_HE[change.kind] ?? change.kind}`
          : ''}
        {!showFlags && change.status
          ? ` · ${CHANGE_STATUS_HE[change.status] ?? change.status}`
          : ''}
        {showFlags && change.flags && change.flags.length > 0
          ? ` · דגלים: ${change.flags.join(', ')}`
          : ''}
      </span>
      <span className="pipeline-run-log__change-value">
        {typeof change.value === 'number' ? formatNumber(change.value) : '—'}
        {typeof change.previous_value === 'number' ? (
          <span className="pipeline-run-log__change-prev">
            {' '}
            (היה {formatNumber(change.previous_value)})
          </span>
        ) : null}
      </span>
      {sourceUrl ? (
        <a
          className="pipeline-run-log__change-source"
          href={sourceUrl}
          target="_blank"
          rel="noreferrer"
        >
          מקור לבדיקה
        </a>
      ) : null}
    </li>
  )
}

function RunItem({ run }: { run: PipelineRunRow }) {
  const [open, setOpen] = useState(false)
  const changes = readChanges(run.summary)
  const message = formatRunMessage(run)
  const editPath = editPathFor(run.pipeline)
  const hasDetails =
    changes.length > 0 ||
    Boolean(run.error) ||
    Boolean(run.summary) ||
    Boolean(editPath)

  const publishedChanges = changes.filter((c) => c.status === 'published')
  const pendingChanges = changes.filter((c) => c.status === 'pending')

  return (
    <li
      className={`pipeline-run-log__item pipeline-run-log__item--${run.status}${
        open ? ' pipeline-run-log__item--open' : ''
      }`}
    >
      <button
        type="button"
        className="pipeline-run-log__toggle"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        disabled={!hasDetails}
      >
        <div className="pipeline-run-log__meta">
          <span
            className={`pipeline-run-log__status pipeline-run-log__status--${run.status}`}
          >
            {STATUS_LABEL[run.status]}
          </span>
          <time dateTime={run.finished_at}>{formatTime(run.finished_at)}</time>
          <span className="pipeline-run-log__source">
            {SOURCE_LABEL[run.source] ?? run.source}
          </span>
          {hasDetails ? (
            <span className="pipeline-run-log__chevron" aria-hidden>
              {open ? '▾' : '◂'}
            </span>
          ) : null}
        </div>
        <p className="pipeline-run-log__pipeline">
          {pipelineTitle(run.pipeline)}
          <span className="pipeline-run-log__action"> · {run.action}</span>
        </p>
        {message ? (
          <p className="pipeline-run-log__message" dir="rtl">
            {message}
          </p>
        ) : null}
        {run.error ? (
          <p className="pipeline-run-log__error-detail">{run.error}</p>
        ) : null}
      </button>

      {open && hasDetails ? (
        <div className="pipeline-run-log__details">
          {run.pipeline === 'office-kpis' && run.summary ? (
            <p className="pipeline-run-log__details-legend">
              <strong>פורסמו</strong> — נכנסו לדשבורד אוטומטית ·{' '}
              <strong>ממתינים לאישור</strong> — דורשים בדיקה ידנית ·{' '}
              <strong>נבדקו</strong> — כמה מדדים הצינור ניסה לעדכן בריצה
            </p>
          ) : null}

          {changes.length > 0 ? (
            <>
              {publishedChanges.length > 0 ? (
                <div className="pipeline-run-log__change-block">
                  <h3 className="pipeline-run-log__change-title">
                    מדדים שעודכנו ({publishedChanges.length})
                  </h3>
                  <ul className="pipeline-run-log__change-list">
                    {publishedChanges.map((c, i) => (
                      <ChangeRow
                        key={`p-${c.index_id ?? c.key}-${c.label}-${i}`}
                        change={c}
                      />
                    ))}
                  </ul>
                </div>
              ) : null}

              {pendingChanges.length > 0 ? (
                <div className="pipeline-run-log__change-block">
                  <h3 className="pipeline-run-log__change-title">
                    ממתינים לאישור ({pendingChanges.length})
                  </h3>
                  <ul className="pipeline-run-log__change-list">
                    {pendingChanges.map((c, i) => (
                      <ChangeRow
                        key={`w-${c.index_id ?? c.key}-${c.label}-${i}`}
                        change={c}
                        showFlags
                      />
                    ))}
                  </ul>
                </div>
              ) : null}
            </>
          ) : run.pipeline === 'office-kpis' ? (
            <p className="pipeline-run-log__muted">
              בריצה הזו אין פירוט נקודות שמור (ריצות ישנות לפני העדכון). אפשר
              לראות את המועמדים במסך העריכה.
            </p>
          ) : run.summary ? (
            <pre className="pipeline-run-log__summary-json" dir="ltr">
              {JSON.stringify(run.summary, null, 2)}
            </pre>
          ) : (
            <p className="pipeline-run-log__muted">אין פירוט נוסף להרצה זו.</p>
          )}

          {editPath ? (
            <p className="pipeline-run-log__details-actions">
              <Link href={editPath} className="pipeline-run-log__details-link">
                למסך הסטטוס והאישורים
              </Link>
            </p>
          ) : null}
        </div>
      ) : null}
    </li>
  )
}

type PipelineRunLogProps = {
  runs: PipelineRunRow[]
  loading: boolean
  error: string | null
}

export function PipelineRunLog({ runs, loading, error }: PipelineRunLogProps) {
  return (
    <section
      className="pipeline-run-log"
      aria-labelledby="pipeline-run-log-title"
    >
      <header className="pipeline-run-log__header">
        <h2 id="pipeline-run-log-title" className="pipeline-run-log__title">
          יומן הרצות
        </h2>
        <p className="pipeline-run-log__hint">
          הרצות אחרונות מכל הצינורות — לחצו על הרצה כדי לראות פירוט עדכונים
        </p>
      </header>

      {loading ? (
        <p className="pipeline-run-log__muted">טוען יומן…</p>
      ) : null}

      {error ? (
        <p className="pipeline-run-log__error" role="alert">
          {error}
        </p>
      ) : null}

      {!loading && !error && runs.length === 0 ? (
        <p className="pipeline-run-log__muted">
          עדיין אין הרצות ביומן. הרצות חדשות יופיעו כאן אחרי סנכרון.
        </p>
      ) : null}

      {runs.length > 0 ? (
        <ol className="pipeline-run-log__list">
          {runs.map((run) => (
            <RunItem key={run.id} run={run} />
          ))}
        </ol>
      ) : null}
    </section>
  )
}

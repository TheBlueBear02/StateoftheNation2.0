'use client'

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
  return pipelineId
}

function formatTime(iso: string): string {
  return new Intl.DateTimeFormat('he-IL', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(iso))
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
          הרצות אחרונות מכל הצינורות — הצלחות, אזהרות ושגיאות
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
            <li
              key={run.id}
              className={`pipeline-run-log__item pipeline-run-log__item--${run.status}`}
            >
              <div className="pipeline-run-log__meta">
                <span
                  className={`pipeline-run-log__status pipeline-run-log__status--${run.status}`}
                >
                  {STATUS_LABEL[run.status]}
                </span>
                <time dateTime={run.finished_at}>
                  {formatTime(run.finished_at)}
                </time>
                <span className="pipeline-run-log__source">
                  {SOURCE_LABEL[run.source]}
                </span>
              </div>
              <p className="pipeline-run-log__pipeline">
                {pipelineTitle(run.pipeline)}
                <span className="pipeline-run-log__action"> · {run.action}</span>
              </p>
              {run.message ? (
                <p className="pipeline-run-log__message">{run.message}</p>
              ) : null}
              {run.error ? (
                <p className="pipeline-run-log__error-detail">{run.error}</p>
              ) : null}
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  )
}

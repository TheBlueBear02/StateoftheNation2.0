'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { SiteLayout } from '../components/SiteLayout'
import { PageBreadcrumb } from '../components/PageBreadcrumb'
import { PipelineUnlockGate } from '../components/pipelines/PipelineUnlockGate'
import {
  fetchOfficeKpiBoard,
  type OfficeKpiBoardOffice,
} from '../lib/officeKpiPipeline'
import './PipelinesDashboardPage.css'
import './ElectionCandidatesEditPage.css'
import './GovernmentDashboardPipelinePage.css'

function formatAsOf(iso: string | null): string {
  if (!iso) return '—'
  return new Intl.DateTimeFormat('he-IL', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(iso))
}

function BoardContent() {
  const [offices, setOffices] = useState<OfficeKpiBoardOffice[]>([])
  const [asOf, setAsOf] = useState<string | null>(null)
  const [totals, setTotals] = useState({
    indexes: 0,
    upToDate: 0,
    automated: 0,
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const result = await fetchOfficeKpiBoard()
    if (!result.ok) {
      setError(result.error)
      setOffices([])
      setLoading(false)
      return
    }
    setOffices(result.offices)
    setAsOf(result.asOf)
    setTotals(result.totals)
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <>
      <header className="gov-pipe-board__hero">
        <PageBreadcrumb
          items={[
            { label: 'צינורות נתונים', to: '/piplines' },
            { label: 'דשבורד הממשלה' },
          ]}
        />
        <h1 className="gov-pipe-board__title">מדדי דשבורד הממשלה</h1>
        <p className="gov-pipe-board__intro">
          כל המדדים באתר לפי משרד. מסגרת ירוקה = עדכני לפי חלון הפרסום הצפוי;
          אדומה = לא מעודכן אחרי התאריך שבו כבר היינו אמורים לקבל נקודה. תג ירוק =
          רץ בצינור האוטומטי; אדום = עדיין לא. לחצו על מדד כדי לפתוח את הגרף
          בדשבורד.
        </p>
        <div className="gov-pipe-board__toolbar">
          <p className="gov-pipe-board__meta" dir="rtl">
            {loading
              ? 'טוען…'
              : `עודכנו ${totals.upToDate}/${totals.indexes} · אוטומטיים ${totals.automated}/${totals.indexes} · נכון ל־${formatAsOf(asOf)}`}
          </p>
          <div className="gov-pipe-board__toolbar-actions">
            <button
              type="button"
              className="pipelines-dash__refresh"
              onClick={() => void load()}
              disabled={loading}
            >
              רענון
            </button>
            <Link
              href="/government/dashboard/edit"
              className="gov-pipe-board__link"
            >
              מסך אישורים
            </Link>
          </div>
        </div>
        <ul className="gov-pipe-board__legend" aria-label="מקרא">
          <li>
            <span className="gov-pipe-board__swatch gov-pipe-board__swatch--fresh" />
            עדכני
          </li>
          <li>
            <span className="gov-pipe-board__swatch gov-pipe-board__swatch--stale" />
            לא מעודכן
          </li>
          <li>
            <span className="gov-pipe-board__pill gov-pipe-board__pill--auto">
              אוטומטי
            </span>
          </li>
          <li>
            <span className="gov-pipe-board__pill gov-pipe-board__pill--manual">
              ידני / בהמתנה
            </span>
          </li>
        </ul>
      </header>

      {error ? (
        <p className="pipelines-dash__panel" role="alert">
          {error}
        </p>
      ) : null}

      {loading && offices.length === 0 ? (
        <p className="gov-pipe-board__muted">טוען מדדים…</p>
      ) : null}

      <div className="gov-pipe-board__offices">
        {offices.map((office) => (
          <section
            key={office.officeId}
            className="gov-pipe-board__office"
            aria-labelledby={`office-${office.officeId}`}
          >
            <h2
              id={`office-${office.officeId}`}
              className="gov-pipe-board__office-title"
            >
              {office.officeName}
              <span className="gov-pipe-board__office-count">
                {office.indexes.filter((i) => i.upToDate).length}/
                {office.indexes.length} עדכניים ·{' '}
                {office.indexes.filter((i) => i.automated).length} אוטומטיים
              </span>
            </h2>
            <ul className="gov-pipe-board__grid">
              {office.indexes.map((index) => (
                <li key={index.indexId}>
                  <Link
                    href={`/government/dashboard?office=${office.officeId}&index=${index.indexId}`}
                    className={`gov-pipe-board__card ${
                      index.upToDate
                        ? 'gov-pipe-board__card--fresh'
                        : 'gov-pipe-board__card--stale'
                    }`}
                  >
                    <div className="gov-pipe-board__card-top">
                      <span
                        className={`gov-pipe-board__pill ${
                          index.automated
                            ? 'gov-pipe-board__pill--auto'
                            : 'gov-pipe-board__pill--manual'
                        }`}
                      >
                        {index.automated ? 'אוטומטי' : 'לא בצינור'}
                      </span>
                      <span className="gov-pipe-board__kind">
                        {index.kind === 'kpi' ? 'מדד' : 'מדיניות'}
                      </span>
                    </div>
                    <h3 className="gov-pipe-board__card-title">{index.name}</h3>
                    <p className="gov-pipe-board__card-meta">
                      אחרון באתר:{' '}
                      <strong>{index.latestLabel ?? '—'}</strong>
                      {index.frequency
                        ? ` · ${index.frequency === 'yearly' ? 'שנתי' : 'חודשי'}`
                        : ''}
                      {index.adapterFamily
                        ? ` · ${index.adapterFamily}`
                        : ''}
                    </p>
                    {!index.upToDate && index.targetPeriod ? (
                      <p className="gov-pipe-board__card-warn">
                        ממתין ל־{index.targetPeriod}
                        {index.windowEnd
                          ? ` (חלון עד ${index.windowEnd})`
                          : ''}
                      </p>
                    ) : null}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </>
  )
}

export function GovernmentDashboardPipelinePage() {
  return (
    <SiteLayout className="site--pipelines-dash">
      <main className="gov-pipe-board">
        <div className="gov-pipe-board__inner container">
          <PipelineUnlockGate
            panelClassName="pipelines-dash__panel"
            gateClassName="pipelines-dash__gate party-detail-card"
          >
            <BoardContent />
          </PipelineUnlockGate>
        </div>
      </main>
    </SiteLayout>
  )
}

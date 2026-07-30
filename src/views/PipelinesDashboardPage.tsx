'use client'

import Link from 'next/link'
import { SiteLayout } from '../components/SiteLayout'
import { PageBreadcrumb } from '../components/PageBreadcrumb'
import { PipelineUnlockGate } from '../components/pipelines/PipelineUnlockGate'
import { PipelineRunLog } from '../components/pipelines/PipelineRunLog'
import { PIPELINES } from '../content/pipelines'
import { usePipelineRuns } from '../hooks/usePipelineRuns'
import './PipelinesDashboardPage.css'
import './ElectionCandidatesEditPage.css'

const STATUS_HE: Record<string, string> = {
  live: 'פעיל',
  planned: 'מתוכנן',
}

function PipelinesDashboardContent() {
  const { runs, loading, error, refetch } = usePipelineRuns()

  return (
    <>
      <section
        className="pipelines-dash__cards"
        aria-labelledby="pipelines-dash-cards-title"
      >
        <div className="pipelines-dash__section-head">
          <h2 id="pipelines-dash-cards-title" className="pipelines-dash__h2">
            הצינורות
          </h2>
          <button
            type="button"
            className="pipelines-dash__refresh"
            onClick={() => void refetch()}
          >
            רענון יומן
          </button>
        </div>

        <ul className="pipelines-dash__grid">
          {PIPELINES.map((pipeline, index) => (
            <li
              key={pipeline.id}
              className="pipelines-dash__card"
              style={{ animationDelay: `${index * 60}ms` }}
            >
              <div className="pipelines-dash__card-top">
                <p className="pipelines-dash__card-status">
                  {STATUS_HE[pipeline.status] ?? pipeline.status}
                </p>
                <h3 className="pipelines-dash__card-title">{pipeline.title}</h3>
                <p className="pipelines-dash__card-sub">{pipeline.subtitle}</p>
              </div>

              <p className="pipelines-dash__card-schedule">
                <span className="pipelines-dash__card-schedule-label">
                  תזמון אוטומטי
                </span>
                <span>
                  {pipeline.schedule?.label ?? 'לא נקבע עדיין'}
                </span>
              </p>

              <div className="pipelines-dash__card-links">
                <Link href={pipeline.docsPath} className="pipelines-dash__link">
                  תיעוד
                </Link>
                {pipeline.editPath ? (
                  <Link
                    href={pipeline.editPath}
                    className="pipelines-dash__link pipelines-dash__link--primary"
                  >
                    הרצה / עריכה
                  </Link>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      </section>

      <PipelineRunLog runs={runs} loading={loading} error={error} />
    </>
  )
}

export function PipelinesDashboardPage() {
  return (
    <SiteLayout className="site--pipelines-dash">
      <main className="pipelines-dash">
        <div className="pipelines-dash__inner container">
          <header className="pipelines-dash__hero">
            <PageBreadcrumb items={[{ label: 'צינורות נתונים' }]} />
            <h1 className="pipelines-dash__title">לוח צינורות נתונים</h1>
            <p className="pipelines-dash__intro">
              סקירה של כל צינורות הסנכרון, תזמון ההרצות האוטומטיות, ויומן
              התוצאות האחרונות.
            </p>
          </header>

          <PipelineUnlockGate
            panelClassName="pipelines-dash__panel"
            gateClassName="pipelines-dash__gate party-detail-card"
          >
            <PipelinesDashboardContent />
          </PipelineUnlockGate>
        </div>
      </main>
    </SiteLayout>
  )
}

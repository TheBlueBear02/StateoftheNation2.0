import { NavLink, Navigate, Route, Routes, useParams } from 'react-router-dom'
import { SiteLayout } from '../components/SiteLayout'
import { PipelineDocView } from '../components/pipelines/PipelineDocView'
import {
  DEFAULT_PIPELINE_ID,
  getPipelineById,
  PIPELINES,
} from '../content/pipelines'
import './PiplinesPage.css'

function PipelineContent() {
  const { pipelineId } = useParams<{ pipelineId: string }>()
  const pipeline = pipelineId ? getPipelineById(pipelineId) : undefined

  if (!pipeline) {
    return <Navigate to={`/piplines/${DEFAULT_PIPELINE_ID}`} replace />
  }

  return <PipelineDocView pipeline={pipeline} />
}

function PiplinesIndexRedirect() {
  return <Navigate to={DEFAULT_PIPELINE_ID} replace />
}

export function PiplinesPage() {
  return (
    <SiteLayout className="site--piplines">
      <main className="piplines-page">
        <div className="piplines-page__inner">
          <aside className="piplines-sidebar" aria-label="רשימת צינורות נתונים">
            <div className="piplines-sidebar__header">
              <h2 className="piplines-sidebar__title">צינורות נתונים</h2>
              <p className="piplines-sidebar__desc">
                מקורות הנתונים שמזינים את מסד הנתונים של הפרויקט
              </p>
            </div>

            <nav className="piplines-sidebar__nav">
              <ul className="piplines-sidebar__list">
                {PIPELINES.map((pipeline) => (
                  <li key={pipeline.id}>
                    <NavLink
                      to={`/piplines/${pipeline.id}`}
                      className={({ isActive }) =>
                        isActive
                          ? 'piplines-sidebar__link piplines-sidebar__link--active'
                          : 'piplines-sidebar__link'
                      }
                    >
                      <span className="piplines-sidebar__link-label">
                        {pipeline.title}
                      </span>
                    </NavLink>
                  </li>
                ))}
              </ul>
            </nav>
          </aside>

          <div className="piplines-main">
            <Routes>
              <Route index element={<PiplinesIndexRedirect />} />
              <Route path=":pipelineId" element={<PipelineContent />} />
            </Routes>
          </div>
        </div>
      </main>
    </SiteLayout>
  )
}

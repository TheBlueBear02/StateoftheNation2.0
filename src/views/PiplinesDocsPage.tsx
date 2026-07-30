'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { useParams, usePathname, useRouter } from 'next/navigation'
import { SiteLayout } from '../components/SiteLayout'
import { PageBreadcrumb } from '../components/PageBreadcrumb'
import { PipelineDocView } from '../components/pipelines/PipelineDocView'
import {
  DEFAULT_PIPELINE_ID,
  getPipelineById,
  PIPELINES,
} from '../content/pipelines'
import './PiplinesPage.css'

export function PiplinesDocsPage() {
  const params = useParams<{ slug?: string[] }>()
  const pathname = usePathname()
  const router = useRouter()
  const pipelineId = params.slug?.[0]
  const pipeline = pipelineId ? getPipelineById(pipelineId) : undefined

  useEffect(() => {
    if (!pipelineId || !pipeline) {
      router.replace(`/piplines/docs/${DEFAULT_PIPELINE_ID}`)
    }
  }, [pipelineId, pipeline, router])

  return (
    <SiteLayout className="site--piplines">
      <main className="piplines-page">
        <div className="piplines-page__inner">
          <aside className="piplines-sidebar" aria-label="רשימת צינורות נתונים">
            <div className="piplines-sidebar__header">
              <PageBreadcrumb
                className="piplines-sidebar__breadcrumb"
                items={[
                  { label: 'צינורות נתונים', to: '/piplines' },
                  { label: 'תיעוד' },
                ]}
              />
              <h2 className="piplines-sidebar__title">תיעוד צינורות</h2>
              <p className="piplines-sidebar__desc">
                מקורות הנתונים שמזינים את מסד הנתונים של הפרויקט
              </p>
            </div>

            <nav className="piplines-sidebar__nav">
              <ul className="piplines-sidebar__list">
                {PIPELINES.map((p) => {
                  const href = `/piplines/docs/${p.id}`
                  const isActive =
                    pathname === href || pathname.startsWith(`${href}/`)
                  return (
                    <li key={p.id}>
                      <Link
                        href={href}
                        className={
                          isActive
                            ? 'piplines-sidebar__link piplines-sidebar__link--active'
                            : 'piplines-sidebar__link'
                        }
                      >
                        <span className="piplines-sidebar__link-label">
                          {p.title}
                        </span>
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </nav>
          </aside>

          <div className="piplines-main">
            {pipeline ? <PipelineDocView pipeline={pipeline} /> : null}
          </div>
        </div>
      </main>
    </SiteLayout>
  )
}

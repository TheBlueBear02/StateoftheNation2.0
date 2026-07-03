import { useEffect, useState } from 'react'
import { SiteLayout } from '../components/SiteLayout'
import { GovernmentPyramid } from '../components/government/GovernmentPyramid'
import { OfficeList } from '../components/government/OfficeList'
import {
  formatGovernmentLabel,
  formatGovernmentOfficesTitle,
  formatGovernmentTitle,
  useGovernmentList,
} from '../hooks/useGovernmentList'
import { useGovernmentMinisters } from '../hooks/useGovernmentMinisters'
import type { GovernmentOption } from '../lib/supabase'
import './GovernmentPage.css'

export function GovernmentPage() {
  const { governments, loading: listLoading, error: listError } = useGovernmentList()
  const [selectedGovernment, setSelectedGovernment] =
    useState<GovernmentOption | null>(null)

  useEffect(() => {
    if (selectedGovernment || governments.length === 0) {
      return
    }

    const defaultGovernment =
      governments.find((government) => government.isActive) ?? governments[0] ?? null
    setSelectedGovernment(defaultGovernment)
  }, [governments, selectedGovernment])

  const {
    pyramidTiers,
    officeGroups,
    ministerAndDeputyCount,
    officeCount,
    loading,
    error,
  } = useGovernmentMinisters(selectedGovernment)

  const pageLoading = listLoading || loading
  const pageError = listError || error
  const title = selectedGovernment
    ? formatGovernmentTitle(selectedGovernment)
    : 'הממשלה'
  const officesTitle = selectedGovernment
    ? formatGovernmentOfficesTitle(selectedGovernment)
    : 'משרדי הממשלה'

  return (
    <SiteLayout className="government-page">
      <main className="government-page__main">
        <section
          className="government-page__section"
          aria-labelledby="government-title"
        >
          <div className="government-page__inner container">
            <header className="government-page__header">
              <div className="government-page__header-row">
                <div>
                  <h1 id="government-title" className="government-page__title">
                    {title}
                  </h1>
                  <p className="government-page__subtitle">
                    מבנה הממשלה, השרים והמשרדים הפעילים
                  </p>
                </div>

                <label className="government-page__picker">
                  <select
                    className="government-page__picker-select"
                    value={selectedGovernment?.id ?? ''}
                    onChange={(event) => {
                      const nextGovernment = governments.find(
                        (government) =>
                          government.id === Number(event.target.value),
                      )
                      setSelectedGovernment(nextGovernment ?? null)
                    }}
                    disabled={listLoading || governments.length === 0}
                    aria-label="בחירת ממשלה"
                  >
                    {governments.map((government) => (
                      <option key={government.id} value={government.id}>
                        {formatGovernmentLabel(government)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </header>

            <GovernmentPyramid
              key={selectedGovernment?.id ?? 'loading'}
              tiers={pyramidTiers}
              ministerAndDeputyCount={ministerAndDeputyCount}
              startDate={selectedGovernment?.startDate ?? null}
              endDate={selectedGovernment?.endDate ?? null}
              loading={pageLoading}
            />

            <div className="government-page__below container">
              {pageError ? (
                <p className="government-page__error" role="alert">
                  לא ניתן לטעון את נתוני הממשלה
                </p>
              ) : null}

              {!pageError ? (
                <section
                  className="government-page__offices"
                  aria-label={officesTitle}
                >
                  <div className="government-page__offices-header">
                    <div>
                      <h2 className="government-page__offices-title">
                        {officesTitle}
                      </h2>
                      <p className="government-page__offices-meta">
                        {officeCount > 0
                          ? `${officeCount} משרדים וגופים ממשלתיים`
                          : 'משרדים וגופים ממשלתיים'}
                      </p>
                    </div>
                  </div>

                  <OfficeList officeGroups={officeGroups} loading={pageLoading} />
                </section>
              ) : null}
            </div>
          </div>
        </section>
      </main>
    </SiteLayout>
  )
}

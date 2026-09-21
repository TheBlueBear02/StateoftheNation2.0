'use client'

import Link from 'next/link'
import { SiteLayout } from '../components/SiteLayout'
import { PageBreadcrumb } from '../components/PageBreadcrumb'
import { DreamActivityChart } from '../components/elections/dream/DreamActivityChart'
import { DreamLeadersPoster } from '../components/elections/dream/DreamLeadersPoster'
import { useDreamCabinetDashboard } from '../hooks/useDreamCabinetDashboard'
import './DreamGovernmentDashboardPage.css'

function formatNumber(value: number): string {
  return new Intl.NumberFormat('he-IL').format(value)
}

export function DreamGovernmentDashboardPage() {
  const { data, loading, error, refetch } = useDreamCabinetDashboard()

  return (
    <SiteLayout className="site--dream-dash">
      <main className="dream-dash">
        <div className="dream-dash__inner container">
          <header className="dream-dash__hero">
            <PageBreadcrumb
              items={[
                { label: 'בחירות 2026', to: '/elections' },
                {
                  label: 'ממשלת החלומות',
                  to: '/elections/dream-government',
                },
                { label: 'לוח בקרה' },
              ]}
            />
            <div className="dream-dash__hero-row">
              <div>
                <p className="dream-dash__eyebrow">development בלבד</p>
                <h1 className="dream-dash__title">לוח בקרה — ממשלת החלומות</h1>
                <p className="dream-dash__intro">
                  דירוגי מועמדים לפי משרד, מספר מצביעים ייחודיים, ופעילות יומית
                  לפי שיתופים.
                </p>
              </div>
              <button
                type="button"
                className="dream-dash__refresh"
                onClick={() => void refetch()}
                disabled={loading}
              >
                רענון
              </button>
            </div>
          </header>

          {error ? (
            <p className="dream-dash__error" role="alert">
              {error}
            </p>
          ) : null}

          {loading && !data ? (
            <p className="dream-dash__muted">טוען נתונים…</p>
          ) : null}

          {data ? (
            <>
              <section
                className="dream-dash__kpis"
                aria-label="מדדים ראשיים"
              >
                <article className="dream-dash__kpi">
                  <p className="dream-dash__kpi-label">מצביעים ייחודיים</p>
                  <p className="dream-dash__kpi-value">
                    {formatNumber(data.uniqueVoters)}
                  </p>
                </article>
                <article className="dream-dash__kpi">
                  <p className="dream-dash__kpi-label">סה״כ בחירות פעילות</p>
                  <p className="dream-dash__kpi-value">
                    {formatNumber(data.totalPicks)}
                  </p>
                  <p className="dream-dash__kpi-hint">
                    שורה לכל משרד שנשמר (עד 7 למשתמש)
                  </p>
                </article>
              </section>

              <section
                className="dream-dash__section"
                aria-labelledby="dream-dash-activity-title"
              >
                <div className="dream-dash__section-head">
                  <h2
                    id="dream-dash-activity-title"
                    className="dream-dash__h2"
                  >
                    פעילות לפי יום
                  </h2>
                  <p className="dream-dash__section-sub">
                    משתמשים ייחודיים שעדכנו בחירה ב־30 הימים האחרונים (שעון
                    ישראל)
                  </p>
                </div>
                <DreamActivityChart days={data.activityByDay} />
              </section>

              <section
                className="dream-dash__section"
                aria-labelledby="dream-dash-boards-title"
              >
                <div className="dream-dash__section-head">
                  <h2 id="dream-dash-boards-title" className="dream-dash__h2">
                    דירוגים לפי משרד
                  </h2>
                  <p className="dream-dash__section-sub">
                    עד 10 המובילים בכל משרד
                  </p>
                </div>

                <div className="dream-dash__boards">
                  {data.offices.map((office) => (
                    <article
                      key={office.officeId}
                      className="dream-dash__board"
                    >
                      <header className="dream-dash__board-head">
                        <h3 className="dream-dash__board-title">
                          {office.label}
                        </h3>
                        <p className="dream-dash__board-total">
                          {formatNumber(office.total)} בחירות
                        </p>
                      </header>

                      {office.leaders.length === 0 ? (
                        <p className="dream-dash__muted">עדיין אין בחירות</p>
                      ) : (
                        <ol className="dream-dash__leaders">
                          {office.leaders.map((leader, index) => (
                            <li
                              key={leader.candidateId}
                              className="dream-dash__leader"
                            >
                              <span className="dream-dash__leader-rank">
                                {index + 1}
                              </span>
                              {leader.imageUrl ? (
                                <img
                                  className="dream-dash__leader-photo"
                                  src={leader.imageUrl}
                                  alt=""
                                  width={40}
                                  height={40}
                                />
                              ) : (
                                <span
                                  className="dream-dash__leader-photo dream-dash__leader-photo--empty"
                                  aria-hidden="true"
                                />
                              )}
                              <div className="dream-dash__leader-meta">
                                <p className="dream-dash__leader-name">
                                  {leader.fullName}
                                </p>
                                <p className="dream-dash__leader-party">
                                  {leader.partyShortName ||
                                    leader.partyName ||
                                    '—'}
                                </p>
                              </div>
                              <div className="dream-dash__leader-stats">
                                <span className="dream-dash__leader-pct">
                                  {leader.percentage}%
                                </span>
                                <span className="dream-dash__leader-count">
                                  {formatNumber(leader.pickCount)}
                                </span>
                              </div>
                            </li>
                          ))}
                        </ol>
                      )}
                    </article>
                  ))}
                </div>
              </section>

              <section
                className="dream-dash__section"
                aria-labelledby="dream-dash-poster-title"
              >
                <div className="dream-dash__section-head">
                  <h2 id="dream-dash-poster-title" className="dream-dash__h2">
                    פוסטר המובילים
                  </h2>
                  <p className="dream-dash__section-sub">
                    שלושת המועמדים המובילים בכל משרד, בסגנון כרטיס השיתוף
                  </p>
                </div>
                <div className="dream-dash__poster-wrap">
                  <DreamLeadersPoster
                    offices={data.offices}
                    uniqueVoters={data.uniqueVoters}
                  />
                </div>
              </section>
            </>
          ) : null}

          <p className="dream-dash__footer-link">
            <Link href="/elections/dream-government">
              חזרה לממשלת החלומות
            </Link>
          </p>
        </div>
      </main>
    </SiteLayout>
  )
}

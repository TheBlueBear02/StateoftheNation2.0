'use client'

import type { CSSProperties } from 'react'
import { PageBreadcrumb } from '../components/PageBreadcrumb'
import { SiteLayout } from '../components/SiteLayout'
import { CandidateList } from '../components/elections/CandidateList'
import { CandidateMap } from '../components/elections/CandidateMap'
import { ListsGamePromo } from '../components/elections/ListsGamePromo'
import { SeatsTrend } from '../components/elections/SeatsTrend'
import { StatsBar } from '../components/elections/StatsBar'
import { useElectionCandidates } from '../hooks/useElectionCandidates'
import type { ElectionCandidate } from '../lib/fetchElectionCandidates'
import type { ElectionParty } from '../lib/supabase'
import './ElectionPartyPage.css'

type ElectionPartyPageProps = {
  party: ElectionParty | null
  initialCandidates?: ElectionCandidate[]
  loadError?: string | null
}

export function ElectionPartyPage({
  party,
  initialCandidates,
  loadError = null,
}: ElectionPartyPageProps) {
  const {
    candidates,
    mapPins,
    stats,
    loading: candidatesLoading,
    error: candidatesError,
  } = useElectionCandidates(party?.id ?? null, initialCandidates)

  const partyName = party?.shortName ?? party?.name ?? 'מפלגה'
  const showFullNameSubtitle = Boolean(
    party?.shortName && party.name.trim() !== party.shortName.trim(),
  )
  const accentColor = party?.color ?? '#4890fd'
  const style = { '--party-color': accentColor } as CSSProperties
  const loading = Boolean(party) && candidatesLoading
  const error = loadError ?? candidatesError
  const notFound = !party && !loadError

  return (
    <SiteLayout className="election-party-page">
      <main className="election-party-page__main" style={style}>
        <div className="election-party-page__inner container">
          <PageBreadcrumb
            items={[
              { label: 'בחירות 2026', to: '/elections' },
              { label: partyName },
            ]}
          />

          {error ? (
            <p className="election-party-page__error" role="alert">
              לא ניתן לטעון את נתוני המפלגה
            </p>
          ) : null}

          {notFound && !error ? (
            <section className="party-detail-card election-party-page__not-found">
              <h1 className="party-detail-card__title">המפלגה לא נמצאה</h1>
              <p>בדקו שהקישור תקין או חזרו לרשימת המפלגות.</p>
            </section>
          ) : null}

          {party && !error ? (
            <>
              <header
                className={`party-hero${
                  showFullNameSubtitle ? '' : ' party-hero--name-centered'
                }`}
              >
                <div className="party-hero__logo-wrap">
                  {party.logoUrl ? (
                    <img className="party-hero__logo" src={party.logoUrl} alt="" />
                  ) : (
                    <span className="party-hero__swatch" aria-hidden="true" />
                  )}
                </div>

                <div className="party-hero__content">
                  <div className="party-hero__heading">
                    <h1 className="party-hero__title">{partyName}</h1>
                    {showFullNameSubtitle ? (
                      <p className="party-hero__subtitle">{party.name}</p>
                    ) : null}
                  </div>
                  {party.description ? (
                    <p className="party-hero__description">{party.description}</p>
                  ) : null}
                </div>

                <SeatsTrend partyId={party.id} color={party.color} />
              </header>

              <StatsBar stats={stats} />
              <CandidateList
                candidates={candidates}
                partyColor={party.color}
                loading={loading}
              />
              <CandidateMap
                pins={mapPins}
                partyName={partyName}
                partyLogoUrl={party.logoUrl}
                partyColor={party.color}
                loading={loading}
              />
            </>
          ) : null}
        </div>

        {party && !error ? (
          <ListsGamePromo titleId="party-lists-game-title" />
        ) : null}
      </main>
    </SiteLayout>
  )
}

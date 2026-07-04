import { Link, useParams } from 'react-router-dom'
import type { CSSProperties } from 'react'
import { SiteLayout } from '../components/SiteLayout'
import { CandidateList } from '../components/elections/CandidateList'
import { CandidateMap } from '../components/elections/CandidateMap'
import { SeatsTrend } from '../components/elections/SeatsTrend'
import { StatsBar } from '../components/elections/StatsBar'
import { useElectionCandidates } from '../hooks/useElectionCandidates'
import { useElectionParties } from '../hooks/useElectionParties'
import './ElectionPartyPage.css'

export function ElectionPartyPage() {
  const { partyId } = useParams()
  const partyIdNumber = Number(partyId)
  const {
    parties,
    loading: partiesLoading,
    error: partiesError,
  } = useElectionParties()
  const party =
    Number.isFinite(partyIdNumber) && partyId
      ? parties.find((item) => item.id === partyIdNumber) ?? null
      : null
  const {
    candidates,
    mapPins,
    stats,
    loading: candidatesLoading,
    error: candidatesError,
  } = useElectionCandidates(party?.id ?? null)

  const partyName = party?.shortName ?? party?.name ?? 'מפלגה'
  const accentColor = party?.color ?? '#4890fd'
  const style = { '--party-color': accentColor } as CSSProperties
  const loading = partiesLoading || (Boolean(party) && candidatesLoading)
  const error = partiesError ?? candidatesError
  const notFound = !partiesLoading && !party

  return (
    <SiteLayout className="election-party-page">
      <main className="election-party-page__main" style={style}>
        <div className="election-party-page__inner container">
          <Link to="/elections" className="election-party-page__back">
            חזרה לכל המפלגות
          </Link>

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
              <header className="party-hero">
                <div className="party-hero__logo-wrap">
                  {party.logoUrl ? (
                    <img className="party-hero__logo" src={party.logoUrl} alt="" />
                  ) : (
                    <span className="party-hero__swatch" aria-hidden="true" />
                  )}
                </div>

                <div className="party-hero__content">
                  <p className="election-party-page__eyebrow">בחירות 2026</p>
                  <h1 className="party-hero__title">{partyName}</h1>
                  <p className="party-hero__subtitle">{party.name}</p>
                  {party.description ? (
                    <p className="party-hero__description">{party.description}</p>
                  ) : null}
                </div>

                <SeatsTrend color={party.color} />
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
      </main>
    </SiteLayout>
  )
}

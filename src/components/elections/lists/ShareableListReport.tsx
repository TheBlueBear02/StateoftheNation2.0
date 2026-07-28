import { forwardRef } from 'react'
import type { ElectionCandidate } from '../../../hooks/useElectionCandidates'
import type { ElectionParty } from '../../../lib/supabase'
import { getInitials } from '../../../lib/hemicycle'
import type { CandidateRating } from '../../../lib/listFitScore'

type ShareableListReportProps = {
  party: ElectionParty
  candidates: ElectionCandidate[]
  ratings: Map<number, CandidateRating>
  score: number
  counts: { green: number; orange: number; red: number }
}

export const ShareableListReport = forwardRef<
  HTMLDivElement,
  ShareableListReportProps
>(function ShareableListReport(
  { party, candidates, ratings, score, counts },
  ref,
) {
  const displayName = party.shortName ?? party.name

  return (
    <div ref={ref} className="lists-share-card" dir="rtl">
      <header className="lists-share-card__header">
        <img
          className="lists-share-card__site-logo"
          src="/header-logo%203.svg"
          alt="מצב האומה"
          width={160}
          height={52}
        />
        <p className="lists-share-card__eyebrow">משחק הרשימות · בחירות 2026</p>
      </header>

      <div className="lists-share-card__party">
        {party.logoUrl ? (
          <img
            className="lists-share-card__party-logo"
            src={party.logoUrl}
            alt=""
            crossOrigin="anonymous"
          />
        ) : (
          <span
            className="lists-share-card__party-swatch"
            style={{ background: party.color ?? '#4890fd' }}
            aria-hidden="true"
          />
        )}
        <div>
          <h2 className="lists-share-card__party-name">{displayName}</h2>
          <p className="lists-share-card__party-full">{party.name}</p>
        </div>
      </div>

      <div className="lists-share-card__score-block">
        <p className="lists-share-card__score-label">מידת ההתאמה שלי</p>
        <p className="lists-share-card__score">{score}</p>
        <p className="lists-share-card__score-out-of">מתוך 100</p>
        <p className="lists-share-card__counts">
          <span className="lists-share-card__count lists-share-card__count--green">
            {counts.green} כן
          </span>
          <span className="lists-share-card__count lists-share-card__count--orange">
            {counts.orange} ?
          </span>
          <span className="lists-share-card__count lists-share-card__count--red">
            {counts.red} לא
          </span>
        </p>
      </div>

      <ul className="lists-share-card__grid">
        {candidates.map((candidate) => {
          const rating = ratings.get(candidate.id) ?? 'orange'
          return (
            <li
              key={candidate.id}
              className={`lists-share-card__person lists-share-card__person--${rating}`}
            >
              {candidate.imageUrl ? (
                <img
                  src={candidate.imageUrl}
                  alt=""
                  crossOrigin="anonymous"
                  className="lists-share-card__face"
                />
              ) : (
                <span className="lists-share-card__face lists-share-card__face--initials">
                  {getInitials(candidate.fullName)}
                </span>
              )}
              <span className="lists-share-card__person-pos">
                {candidate.listPosition}
              </span>
              <span className="lists-share-card__person-name">
                {candidate.fullName}
              </span>
            </li>
          )
        })}
      </ul>

      <footer className="lists-share-card__footer">מצב האומה · stateofthenation</footer>
    </div>
  )
})

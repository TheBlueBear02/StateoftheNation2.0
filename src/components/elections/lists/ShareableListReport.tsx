import { forwardRef } from 'react'
import type { ElectionCandidate } from '../../../hooks/useElectionCandidates'
import { getInitials } from '../../../lib/hemicycle'
import type { CandidateRating } from '../../../lib/listFitScore'

type ShareableListReportProps = {
  partyName: string
  candidates: ElectionCandidate[]
  ratings: Map<number, CandidateRating>
  score: number
  counts: { green: number; orange: number; red: number }
}

export const ShareableListReport = forwardRef<
  HTMLDivElement,
  ShareableListReportProps
>(function ShareableListReport(
  { partyName, candidates, ratings, score, counts },
  ref,
) {
  return (
    <div ref={ref} className="lists-share-card" dir="rtl">
      <img
        className="lists-share-card__site-logo"
        src="/while-logo-nobg.svg"
        alt="מצב האומה"
        width={160}
        height={52}
      />

      <div className="lists-share-card__score">
        <p className="lists-share-card__score-value">
          {score}
          <span className="lists-share-card__score-suffix">/100</span>
        </p>
        <p className="lists-share-card__score-label">
          מידת ההתאמה של רשימת {partyName} אליכם
        </p>
        <p className="lists-share-card__counts">
          <span className="lists-share-card__count lists-share-card__count--green">
            {counts.green} רוצה בכנסת
          </span>
          <span className="lists-share-card__count lists-share-card__count--orange">
            {counts.orange} לא יודע
          </span>
          <span className="lists-share-card__count lists-share-card__count--red">
            {counts.red} לא רוצה
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
              <span className="lists-share-card__position">
                {candidate.listPosition}
              </span>
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
            </li>
          )
        })}
      </ul>
    </div>
  )
})

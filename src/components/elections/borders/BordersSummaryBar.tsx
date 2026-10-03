'use client'

import {
  BORDERS_MAJORITY,
  KNESSET_SEATS,
  majorityStatus,
} from '../../../lib/governmentBorders'
import { displayBlocBarGradient } from '../../../lib/pollChartData'

type BordersSummaryBarProps = {
  governmentSeats: number
}

export function BordersSummaryBar({ governmentSeats }: BordersSummaryBarProps) {
  const oppositionSeats = Math.max(0, KNESSET_SEATS - governmentSeats)
  const govPct = (governmentSeats / KNESSET_SEATS) * 100
  const oppPct = (oppositionSeats / KNESSET_SEATS) * 100
  const status = majorityStatus(governmentSeats)
  const majorityPct = (BORDERS_MAJORITY / KNESSET_SEATS) * 100

  return (
    <section className="borders-summary" aria-live="polite">
      <div className="borders-summary__totals">
        <p className="borders-summary__gov">
          ממשלה: <strong>{governmentSeats}</strong> מנדטים
        </p>
        <p
          className={
            status.hasMajority
              ? 'borders-summary__status borders-summary__status--ok'
              : 'borders-summary__status borders-summary__status--short'
          }
        >
          {status.label}
        </p>
      </div>

      <div className="borders-summary__bar-wrap">
        <span
          className="borders-summary__majority-label"
          style={{ insetInlineStart: `${majorityPct}%` }}
          aria-hidden="true"
        >
          {BORDERS_MAJORITY}
        </span>
        <div
          className="borders-summary__bar"
          role="img"
          aria-label={`ממשלה ${governmentSeats}, מחוץ לממשלה ${oppositionSeats}`}
        >
          <div
            className="borders-summary__segment borders-summary__segment--gov"
            style={{
              width: `${govPct}%`,
              background: displayBlocBarGradient('#4890fd'),
            }}
          >
            {governmentSeats > 0 ? (
              <span className="borders-summary__segment-label">
                קואליציה {governmentSeats}
              </span>
            ) : null}
          </div>
          <div
            className="borders-summary__segment borders-summary__segment--opp"
            style={{
              width: `${oppPct}%`,
              background: displayBlocBarGradient('#e74c3c'),
            }}
          >
            {oppositionSeats > 0 ? (
              <span className="borders-summary__segment-label">
                אופוזיציה {oppositionSeats}
              </span>
            ) : null}
          </div>
        </div>
        <span
          className="borders-summary__majority-line"
          style={{ insetInlineStart: `${majorityPct}%` }}
          aria-hidden="true"
        />
      </div>
    </section>
  )
}

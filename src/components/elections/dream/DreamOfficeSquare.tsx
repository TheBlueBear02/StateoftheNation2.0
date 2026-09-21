import { getInitials } from '../../../lib/hemicycle'
import {
  getDreamOfficeLabel,
  type DreamOffice,
} from '../../../lib/dreamGovernmentOffices'
import type { ElectionCandidate } from '../../../hooks/useElectionCandidates'
import type { ElectionParty } from '../../../lib/supabase'

export type DreamOfficeSelection = {
  candidate: ElectionCandidate
  party: ElectionParty
}

export type DreamOfficePickStat = {
  percentage: number
  total: number
  count: number
}

/** Popularity band for % badge color (site-wide pick share). */
export type DreamPickPopularity = 'low' | 'mid' | 'high' | 'top'

export function getDreamPickPopularity(
  percentage: number,
): DreamPickPopularity {
  if (percentage >= 75) return 'top'
  if (percentage >= 50) return 'high'
  if (percentage >= 25) return 'mid'
  return 'low'
}

type DreamOfficeSquareProps = {
  office: DreamOffice
  selection: DreamOfficeSelection | null
  onClick: () => void
  /** Site-wide share stat for the selected candidate; null = hide %. */
  pickStat?: DreamOfficePickStat | null
}

export function DreamOfficeSquare({
  office,
  selection,
  onClick,
  pickStat = null,
}: DreamOfficeSquareProps) {
  const isPm = Boolean(office.isPm)
  const officeLabel = getDreamOfficeLabel(
    office,
    selection?.candidate.gender,
  )
  const showPct = selection != null && pickStat != null
  const popularity =
    showPct && pickStat
      ? getDreamPickPopularity(pickStat.percentage)
      : null

  return (
    <div
      className={
        isPm
          ? 'dream-office dream-office--pm'
          : 'dream-office'
      }
    >
      <p className="dream-office__title">{officeLabel}</p>

      <div className="dream-office__portrait-row">
        <button
          type="button"
          className={
            selection
              ? 'dream-office__square dream-office__square--filled'
              : 'dream-office__square dream-office__square--empty'
          }
          onClick={onClick}
          aria-label={
            selection
              ? `שנה את ${officeLabel}: ${selection.candidate.fullName}`
              : `בחר ${officeLabel}`
          }
        >
          {selection ? (
            selection.candidate.imageUrl ? (
              <img
                className="dream-office__photo"
                src={selection.candidate.imageUrl}
                alt=""
                loading="lazy"
              />
            ) : (
              <span className="dream-office__initials" aria-hidden="true">
                {getInitials(selection.candidate.fullName)}
              </span>
            )
          ) : (
            <span className="dream-office__plus" aria-hidden="true">
              +
            </span>
          )}
          {selection ? (
            <span className="dream-office__edit" aria-hidden="true">
              <svg
                className="dream-office__edit-icon"
                viewBox="0 0 24 24"
                width="14"
                height="14"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
              </svg>
            </span>
          ) : null}
          {showPct && pickStat && popularity ? (
            <span
              className={`dream-office__pct-badge dream-office__pct-badge--${popularity}`}
              aria-label={`${pickStat.percentage}% מהבחירות באתר למשרד זה (מתוך ${pickStat.total})`}
            >
              {pickStat.percentage}%
            </span>
          ) : null}
        </button>
      </div>

      <div className="dream-office__meta">
        {selection ? (
          <>
            <p className="dream-office__name">{selection.candidate.fullName}</p>
            <p className="dream-office__party">
              {selection.party.shortName ?? selection.party.name}
            </p>
          </>
        ) : (
          <p className="dream-office__hint">לחצו לבחירה</p>
        )}
      </div>
    </div>
  )
}

import { getInitials } from '../../../lib/hemicycle'
import type { DreamOffice } from '../../../lib/dreamGovernmentOffices'
import type { ElectionCandidate } from '../../../hooks/useElectionCandidates'
import type { ElectionParty } from '../../../lib/supabase'

export type DreamOfficeSelection = {
  candidate: ElectionCandidate
  party: ElectionParty
}

type DreamOfficeSquareProps = {
  office: DreamOffice
  selection: DreamOfficeSelection | null
  onClick: () => void
}

export function DreamOfficeSquare({
  office,
  selection,
  onClick,
}: DreamOfficeSquareProps) {
  const isPm = Boolean(office.isPm)
  const partyLogoUrl = selection?.party.logoUrl ?? null
  const partyLabel =
    selection?.party.shortName ?? selection?.party.name ?? 'מפלגה'

  return (
    <div
      className={
        isPm
          ? 'dream-office dream-office--pm'
          : 'dream-office'
      }
    >
      <p className="dream-office__title">{office.label}</p>

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
            ? `שנה את ${office.label}: ${selection.candidate.fullName}`
            : `בחר ${office.label}`
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
        {partyLogoUrl ? (
          <img
            className="dream-office__party-logo"
            src={partyLogoUrl}
            alt={partyLabel}
            loading="lazy"
          />
        ) : null}
      </button>

      <div className="dream-office__meta">
        {selection ? (
          <p className="dream-office__name">{selection.candidate.fullName}</p>
        ) : (
          <p className="dream-office__hint">לחצו לבחירה</p>
        )}
      </div>
    </div>
  )
}

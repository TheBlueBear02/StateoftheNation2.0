import type { CSSProperties } from 'react'
import type { ElectionParty } from '../../../lib/supabase'
import { getInitials } from '../../../lib/hemicycle'

type ListPartyPickerProps = {
  parties: ElectionParty[]
  loading: boolean
  onSelect: (party: ElectionParty) => void
}

export function ListPartyPicker({
  parties,
  loading,
  onSelect,
}: ListPartyPickerProps) {
  if (loading) {
    return (
      <div className="lists-picker__grid" aria-hidden="true">
        {Array.from({ length: 8 }, (_, index) => (
          <div key={index} className="lists-picker-card lists-picker-card--skeleton">
            <span className="lists-picker-card__media" />
          </div>
        ))}
      </div>
    )
  }

  if (parties.length === 0) {
    return (
      <p className="lists-game__empty">
        אין מפלגות מאושרות להצגה כרגע.
      </p>
    )
  }

  return (
    <ul className="lists-picker__grid">
      {parties.map((party) => {
        const hasList = Boolean(party.leader)
        const displayName = party.shortName ?? party.name
        const leaderName = party.leader?.fullName ?? null
        const accentColor = party.color ?? '#4890fd'
        const style = { '--party-color': accentColor } as CSSProperties
        const leaderImageUrl = party.leader?.imageUrl

        return (
          <li key={party.id}>
            <button
              type="button"
              className={
                hasList
                  ? 'lists-picker-card'
                  : 'lists-picker-card lists-picker-card--disabled'
              }
              style={style}
              disabled={!hasList}
              onClick={() => {
                if (hasList) onSelect(party)
              }}
              aria-label={
                hasList
                  ? `בחר את רשימת ${displayName}`
                  : `ל${displayName} עדיין אין רשימת מועמדים`
              }
            >
              <span className="lists-picker-card__media">
                {leaderImageUrl ? (
                  <img
                    src={leaderImageUrl}
                    alt=""
                    loading="lazy"
                    className="lists-picker-card__photo"
                  />
                ) : (
                  <span className="lists-picker-card__initials" aria-hidden="true">
                    {getInitials(leaderName ?? displayName)}
                  </span>
                )}

                <span className="lists-picker-card__gradient" aria-hidden="true" />

                {party.logoUrl ? (
                  <img
                    src={party.logoUrl}
                    alt=""
                    loading="lazy"
                    className="lists-picker-card__logo"
                  />
                ) : null}

                <span className="lists-picker-card__overlay">
                  <span className="lists-picker-card__name">{displayName}</span>
                  {hasList && leaderName ? (
                    <span className="lists-picker-card__leader">
                      בראשות {leaderName}
                    </span>
                  ) : null}
                  {!hasList ? (
                    <span className="lists-picker-card__status">אין רשימה עדיין</span>
                  ) : null}
                </span>
              </span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}

import { Link } from 'react-router-dom'
import type { CSSProperties } from 'react'
import type { ElectionParty } from '../../lib/supabase'

type PartyCardProps = {
  party: ElectionParty
}

export function PartyCard({ party }: PartyCardProps) {
  const displayName = party.shortName ?? party.name
  const accentColor = party.color ?? '#4890fd'
  const style = { '--party-color': accentColor } as CSSProperties

  return (
    <Link
      to={`/elections/${party.id}`}
      className="election-party-card"
      style={style}
      aria-label={`לעמוד הבחירות של ${displayName}`}
    >
      <span className="election-party-card__accent" aria-hidden="true" />

      <span className="election-party-card__media">
        {party.logoUrl ? (
          <img
            className="election-party-card__logo"
            src={party.logoUrl}
            alt=""
            loading="lazy"
          />
        ) : (
          <span className="election-party-card__swatch" aria-hidden="true" />
        )}
      </span>

      <span className="election-party-card__content">
        <span className="election-party-card__name">{displayName}</span>
        <span className="election-party-card__full-name">{party.name}</span>
        {party.ballotLetter ? (
          <span className="election-party-card__ballot">
            אות בקלפי: {party.ballotLetter}
          </span>
        ) : (
          <span className="election-party-card__ballot election-party-card__ballot--muted">
            אות בקלפי טרם פורסמה
          </span>
        )}
      </span>
    </Link>
  )
}

export function PartyCardSkeleton() {
  return (
    <div className="election-party-card election-party-card--skeleton" aria-hidden="true">
      <span className="election-party-card__accent" />
      <span className="election-party-card__media">
        <span className="election-party-card__swatch" />
      </span>
      <span className="election-party-card__content">
        <span className="election-party-card__line election-party-card__line--title" />
        <span className="election-party-card__line" />
        <span className="election-party-card__line election-party-card__line--short" />
      </span>
    </div>
  )
}

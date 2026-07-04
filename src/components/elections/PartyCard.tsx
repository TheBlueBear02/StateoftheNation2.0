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
  const leaderImageUrl = party.leader?.imageUrl
  const cardClassName = leaderImageUrl
    ? 'election-party-card election-party-card--has-image'
    : 'election-party-card'

  return (
    <Link
      to={`/elections/${party.id}`}
      className={cardClassName}
      style={style}
      aria-label={`לעמוד הבחירות של ${displayName}`}
    >
      {leaderImageUrl ? (
        <span className="election-party-card__media">
          <img
            className="election-party-card__leader-image"
            src={leaderImageUrl}
            alt={`תמונת ${party.leader?.fullName ?? displayName}`}
            loading="lazy"
          />
        </span>
      ) : null}

      <span className="election-party-card__content">
        <span className="election-party-card__name">{displayName}</span>
        <span className="election-party-card__full-name">{party.name}</span>
      </span>

      {party.logoUrl ? (
        <span className="election-party-card__logo-badge">
          <img
            className="election-party-card__logo"
            src={party.logoUrl}
            alt=""
            loading="lazy"
          />
        </span>
      ) : null}
    </Link>
  )
}

export function PartyCardSkeleton() {
  return (
    <div
      className="election-party-card election-party-card--has-image election-party-card--skeleton"
      aria-hidden="true"
    >
      <span className="election-party-card__media">
        <span className="election-party-card__swatch" />
      </span>
      <span className="election-party-card__content">
        <span className="election-party-card__line election-party-card__line--title" />
        <span className="election-party-card__line" />
      </span>
      <span className="election-party-card__logo-badge election-party-card__logo-badge--skeleton" />
    </div>
  )
}

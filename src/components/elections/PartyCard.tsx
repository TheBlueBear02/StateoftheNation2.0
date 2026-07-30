'use client'

import Link from 'next/link'
import type { CSSProperties } from 'react'
import type { ElectionParty } from '../../lib/supabase'
import { getInitials } from '../../lib/hemicycle'

type PartyCardProps = {
  party: ElectionParty
}

export function PartyCard({ party }: PartyCardProps) {
  const displayName = party.shortName ?? party.name
  const leaderName = party.leader?.fullName ?? null
  const accentColor = party.color ?? '#4890fd'
  const style = { '--party-color': accentColor } as CSSProperties
  const leaderImageUrl = party.leader?.imageUrl

  return (
    <Link
      href={`/elections/${party.id}`}
      className="election-party-card"
      style={style}
      aria-label={`לעמוד הבחירות של ${displayName}`}
    >
      <span className="election-party-card__media">
        {leaderImageUrl ? (
          <img
            className="election-party-card__photo"
            src={leaderImageUrl}
            alt={`תמונת ${leaderName ?? displayName}`}
            loading="lazy"
          />
        ) : (
          <span className="election-party-card__initials" aria-hidden="true">
            {getInitials(leaderName ?? displayName)}
          </span>
        )}

        <span className="election-party-card__gradient" aria-hidden="true" />

        {party.logoUrl ? (
          <img
            className="election-party-card__logo"
            src={party.logoUrl}
            alt=""
            loading="lazy"
          />
        ) : null}

        <span className="election-party-card__overlay">
          <span className="election-party-card__name">{displayName}</span>
          {leaderName ? (
            <span className="election-party-card__leader">בראשות {leaderName}</span>
          ) : null}
        </span>
      </span>
    </Link>
  )
}

export function PartyCardSkeleton() {
  return (
    <div className="election-party-card election-party-card--skeleton" aria-hidden="true">
      <span className="election-party-card__media" />
    </div>
  )
}

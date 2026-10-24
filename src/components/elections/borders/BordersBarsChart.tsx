'use client'

import { getInitials } from '../../../lib/hemicycle'
import {
  bordersAvatarObjectPosition,
  isPartyInRange,
  type BordersPartyColumn,
  type BordersRange,
} from '../../../lib/governmentBorders'
import { displayBlocBarGradientForParty } from '../../../lib/pollChartData'

/** Floor so tiny parties still show a visible stub (percent of plot). */
const MIN_BAR_PCT = 14

type BordersBarsChartProps = {
  columns: BordersPartyColumn[]
  range: BordersRange
  topicStartLabel: string
  topicEndLabel: string
}

function PartyAvatar({ column }: { column: BordersPartyColumn }) {
  const leaderImage = column.leader?.imageUrl?.trim() || null
  const logo = column.partyLogoUrl?.trim() || null
  const color = column.partyColor || '#888'
  const name = column.leader?.fullName || column.partyShortName

  if (leaderImage) {
    const objectPosition = bordersAvatarObjectPosition(column)
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        className="borders-bars__avatar-img"
        src={leaderImage}
        alt=""
        width={48}
        height={48}
        loading="lazy"
        decoding="async"
        style={objectPosition ? { objectPosition } : undefined}
      />
    )
  }

  if (logo) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        className="borders-bars__avatar-logo"
        src={logo}
        alt=""
        width={40}
        height={40}
        loading="lazy"
        decoding="async"
      />
    )
  }

  return (
    <span
      className="borders-bars__avatar-fallback"
      style={{ backgroundColor: color }}
      aria-hidden="true"
    >
      {getInitials(name)}
    </span>
  )
}

export function BordersBarsChart({
  columns,
  range,
  topicStartLabel,
  topicEndLabel,
}: BordersBarsChartProps) {
  const maxSeats = Math.max(...columns.map((c) => c.seats), 1)

  return (
    <div className="borders-bars">
      <div className="borders-bars__axis-labels" aria-hidden="true">
        {/* RTL flex: first child sits on the right (spectrum start). */}
        <span className="borders-bars__axis-start">{topicStartLabel}</span>
        <span className="borders-bars__axis-end">{topicEndLabel}</span>
      </div>

      <div
        className="borders-bars__plot"
        role="img"
        aria-label="מנדטים לפי מפלגה על ציר גבולות הגזרה"
      >
        {columns.map((column, index) => {
          const inRange = isPartyInRange(index, range)
          const heightPct = Math.max(
            MIN_BAR_PCT,
            (column.seats / maxSeats) * 100,
          )
          return (
            <div
              key={column.partyId}
              className={
                inRange
                  ? 'borders-bars__col'
                  : 'borders-bars__col borders-bars__col--dimmed'
              }
              style={{ ['--col-index' as string]: index }}
            >
              <div className="borders-bars__bar-slot">
                <div
                  className="borders-bars__bar"
                  style={{
                    height: `${heightPct}%`,
                    background: displayBlocBarGradientForParty({
                      partyName: column.partyName,
                      partyShortName: column.partyShortName,
                      bloc: column.bloc,
                    }),
                  }}
                  title={`${column.partyShortName}: ${column.seats}`}
                >
                  <span className="borders-bars__seats">{column.seats}</span>
                </div>
              </div>
              <div
                className="borders-bars__avatar"
                title={column.partyShortName}
              >
                <PartyAvatar column={column} />
              </div>
              <span className="borders-bars__name">{column.partyShortName}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

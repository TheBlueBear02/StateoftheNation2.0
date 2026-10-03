'use client'

import { forwardRef } from 'react'
import type { BordersTopic } from '../../../content/governmentBordersTopics'
import { getInitials } from '../../../lib/hemicycle'
import {
  BORDERS_MAJORITY,
  isPartyInRange,
  majorityStatus,
  type BordersPartyColumn,
  type BordersRange,
} from '../../../lib/governmentBorders'
import { displayBlocBarGradientForParty } from '../../../lib/pollChartData'

type ShareableBordersPosterProps = {
  columns: BordersPartyColumn[]
  range: BordersRange
  topic: BordersTopic
  channelLabel: string
  pollDateLabel: string
  governmentSeats: number
}

const POSTER_PLOT_HEIGHT = 220
const MIN_BAR = 36

export const ShareableBordersPoster = forwardRef<
  HTMLDivElement,
  ShareableBordersPosterProps
>(function ShareableBordersPoster(
  {
    columns,
    range,
    topic,
    channelLabel,
    pollDateLabel,
    governmentSeats,
  },
  ref,
) {
  const maxSeats = Math.max(...columns.map((c) => c.seats), 1)
  const status = majorityStatus(governmentSeats)
  const selected = columns.filter((_, i) => isPartyInRange(i, range))

  return (
    <div ref={ref} className="borders-poster" dir="rtl">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        className="borders-poster__site-logo"
        src="/header-logo%203.svg"
        alt=""
        width={48}
        height={48}
      />

      <header className="borders-poster__header">
        <h3 className="borders-poster__title">ג&quot;ג · גבולות גזרה לממשלה</h3>
        <p className="borders-poster__subtitle">
          {topic.label}
          <span className="borders-poster__sep" aria-hidden="true">
            ·
          </span>
          {channelLabel}
          <span className="borders-poster__sep" aria-hidden="true">
            ·
          </span>
          {pollDateLabel}
        </p>
      </header>

      <p className="borders-poster__seats">
        ממשלה: <strong>{governmentSeats}</strong> מנדטים
        <span
          className={
            status.hasMajority
              ? 'borders-poster__badge borders-poster__badge--ok'
              : 'borders-poster__badge'
          }
        >
          {status.label}
        </span>
      </p>

      <div
        className="borders-poster__plot"
        style={{ height: POSTER_PLOT_HEIGHT }}
      >
        {columns.map((column, index) => {
          const inRange = isPartyInRange(index, range)
          const height = Math.max(
            MIN_BAR,
            (column.seats / maxSeats) * POSTER_PLOT_HEIGHT,
          )
          const leaderImage = column.leader?.imageUrl?.trim() || null
          const logo = column.partyLogoUrl?.trim() || null

          return (
            <div
              key={column.partyId}
              className={
                inRange
                  ? 'borders-poster__col'
                  : 'borders-poster__col borders-poster__col--dimmed'
              }
            >
              <div
                className="borders-poster__bar"
                style={{
                  height,
                  background: displayBlocBarGradientForParty({
                    partyName: column.partyName,
                    partyShortName: column.partyShortName,
                    bloc: column.bloc,
                  }),
                }}
              >
                <span className="borders-poster__bar-seats">{column.seats}</span>
              </div>
              <div className="borders-poster__avatar">
                {leaderImage ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={leaderImage} alt="" width={40} height={40} />
                ) : logo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    className="borders-poster__avatar-logo"
                    src={logo}
                    alt=""
                    width={32}
                    height={32}
                  />
                ) : (
                  <span
                    className="borders-poster__avatar-fallback"
                    style={{
                      backgroundColor: column.partyColor || '#888',
                    }}
                  >
                    {getInitials(
                      column.leader?.fullName || column.partyShortName,
                    )}
                  </span>
                )}
              </div>
              <span className="borders-poster__name">
                {column.partyShortName}
              </span>
            </div>
          )
        })}
      </div>

      <p className="borders-poster__parties">
        {selected.map((c) => c.partyShortName).join(' · ')}
      </p>

      <p className="borders-poster__footer">
        מצב האומה · רוב = {BORDERS_MAJORITY} מנדטים
      </p>
    </div>
  )
})

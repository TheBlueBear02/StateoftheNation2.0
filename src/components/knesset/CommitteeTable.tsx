'use client'

import { useEffect, useState, type MouseEvent as ReactMouseEvent } from 'react'
import {
  COMMITTEE_TABLE_GEOMETRY,
  COMMITTEE_TABLE_VIEWBOX,
  committeeTableRingPath,
  initialsFromName,
  roundedRectPath,
  type LaidOutSeat,
} from '../../lib/committeeTableLayout'
import { Tooltip } from './Tooltip'

type CommitteeSeatProps = {
  seat: LaidOutSeat
  isSpeaking: boolean
  isSelected: boolean
  onSelect: (personId: number | null) => void
  onHover: (
    seat: LaidOutSeat | null,
    event: ReactMouseEvent<SVGGElement> | null,
  ) => void
}

function CommitteeSeat({
  seat,
  isSpeaking,
  isSelected,
  onSelect,
  onHover,
}: CommitteeSeatProps) {
  const isCounsel = seat.kind === 'legal_counsel'
  const isAbsent = !isCounsel && !seat.attended
  const personId = seat.member?.personId ?? null
  const interactive = !isCounsel && personId != null
  const radius = 24
  const imageUrl = seat.member?.imageUrl
  const clipId = `seat-clip-${seat.key.replace(/[^a-zA-Z0-9_-]/g, '-')}`

  return (
    <g
      className={[
        'committee-seat',
        isSpeaking ? 'committee-seat--speaking' : '',
        isSelected ? 'committee-seat--selected' : '',
        isCounsel ? 'committee-seat--counsel' : '',
        isAbsent ? 'committee-seat--absent' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      transform={`translate(${seat.x}, ${seat.y})`}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      aria-label={
        isAbsent ? `${seat.label} (לא נכח/ה)` : seat.label
      }
      onClick={() => {
        if (interactive) {
          onSelect(personId)
        }
      }}
      onKeyDown={(event) => {
        if (!interactive) {
          return
        }
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onSelect(personId)
        }
      }}
      onMouseEnter={(event) => {
        if (interactive) {
          onHover(seat, event)
        }
      }}
      onMouseMove={(event) => {
        if (interactive) {
          onHover(seat, event)
        }
      }}
      onMouseLeave={() => {
        if (interactive) {
          onHover(null, null)
        }
      }}
      style={interactive ? { cursor: 'pointer' } : undefined}
    >
      <defs>
        <clipPath id={clipId}>
          <circle r={radius} cx={0} cy={0} />
        </clipPath>
      </defs>
      <g className="committee-seat__visual">
        <circle className="committee-seat__ring" r={radius + 3.5} fill="none" />
        <circle
          className="committee-seat__disc"
          r={radius}
          fill={isCounsel ? '#ebe4da' : '#fff'}
        />
        {imageUrl && !isCounsel ? (
          <image
            className="committee-seat__photo"
            href={imageUrl}
            x={-radius}
            y={-radius}
            width={radius * 2}
            height={radius * 2}
            clipPath={`url(#${clipId})`}
            preserveAspectRatio="xMidYMid slice"
          />
        ) : (
          <text
            className="committee-seat__initials"
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={isCounsel ? 11 : 12}
          >
            {isCounsel ? 'יועמ״ש' : initialsFromName(seat.label)}
          </text>
        )}
      </g>
    </g>
  )
}

type CommitteeTableProps = {
  seats: LaidOutSeat[]
  overflowCount: number
  speakingPersonId: number | null
  selectedPersonId: number | null
  onSelectPerson: (personId: number | null) => void
  loading?: boolean
}

export function CommitteeTable({
  seats,
  overflowCount,
  speakingPersonId,
  selectedPersonId,
  onSelectPerson,
  loading = false,
}: CommitteeTableProps) {
  const g = COMMITTEE_TABLE_GEOMETRY
  const ringPath = committeeTableRingPath()
  const voidPath = roundedRectPath(
    g.innerX,
    g.innerY,
    g.innerW,
    g.innerH,
    g.innerR,
  )
  const outerRim = roundedRectPath(
    g.outerX,
    g.outerY,
    g.outerW,
    g.outerH,
    g.outerR,
  )
  const innerRim = voidPath

  const [hoveredSeat, setHoveredSeat] = useState<LaidOutSeat | null>(null)
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 })

  useEffect(() => {
    if (loading) {
      setHoveredSeat(null)
    }
  }, [loading])

  function handleHover(
    seat: LaidOutSeat | null,
    event: ReactMouseEvent<SVGGElement> | null,
  ) {
    setHoveredSeat(seat)
    if (event) {
      setTooltipPosition({ x: event.clientX, y: event.clientY })
    }
  }

  const hoveredMember = hoveredSeat?.member ?? null

  return (
    <div className="committee-table" aria-busy={loading || undefined}>
      <svg
        className="committee-table__svg"
        viewBox={COMMITTEE_TABLE_VIEWBOX}
        role="img"
        aria-label="שולחן הוועדה"
      >
        <defs>
          <radialGradient
            id="committee-wood-fill"
            cx="38%"
            cy="28%"
            r="78%"
          >
            <stop offset="0%" stopColor="#7a4a2e" />
            <stop offset="35%" stopColor="#5a3220" />
            <stop offset="70%" stopColor="#3a1f14" />
            <stop offset="100%" stopColor="#24140c" />
          </radialGradient>
          <linearGradient
            id="committee-wood-sheen"
            x1="15%"
            y1="0%"
            x2="85%"
            y2="100%"
          >
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.22" />
            <stop offset="40%" stopColor="#ffffff" stopOpacity="0.04" />
            <stop offset="100%" stopColor="#000000" stopOpacity="0.28" />
          </linearGradient>
          <radialGradient
            id="committee-wood-gloss"
            cx="42%"
            cy="22%"
            r="55%"
          >
            <stop offset="0%" stopColor="#c48a5a" stopOpacity="0.35" />
            <stop offset="55%" stopColor="#c48a5a" stopOpacity="0" />
          </radialGradient>
          <filter
            id="committee-table-shadow"
            x="-20%"
            y="-10%"
            width="140%"
            height="130%"
          >
            <feDropShadow
              dx="0"
              dy="10"
              stdDeviation="12"
              floodColor="#1a1008"
              floodOpacity="0.35"
            />
          </filter>
        </defs>

        <path className="committee-table__void" d={voidPath} />

        <path
          className="committee-table__wood"
          d={ringPath}
          fill="url(#committee-wood-fill)"
          fillRule="evenodd"
          filter="url(#committee-table-shadow)"
        />
        <path
          d={ringPath}
          fill="url(#committee-wood-sheen)"
          fillRule="evenodd"
          pointerEvents="none"
        />
        <path
          d={ringPath}
          fill="url(#committee-wood-gloss)"
          fillRule="evenodd"
          pointerEvents="none"
        />

        <path
          className="committee-table__rim committee-table__rim--outer"
          d={outerRim}
          fill="none"
        />
        <path
          className="committee-table__rim committee-table__rim--inner"
          d={innerRim}
          fill="none"
        />

        {seats.map((seat) => (
          <CommitteeSeat
            key={seat.key}
            seat={seat}
            isSpeaking={
              seat.member != null && seat.member.personId === speakingPersonId
            }
            isSelected={
              seat.member != null && seat.member.personId === selectedPersonId
            }
            onSelect={onSelectPerson}
            onHover={handleHover}
          />
        ))}
      </svg>

      {hoveredMember ? (
        <Tooltip
          fullName={hoveredMember.fullName}
          factionName={hoveredMember.factionName}
          factionColor={null}
          imageUrl={hoveredMember.imageUrl}
          firstElectedYear={hoveredMember.firstElectedYear ?? null}
          totalDaysInKnesset={hoveredMember.totalDaysInKnesset ?? 0}
          totalYearsInKnesset={hoveredMember.totalYearsInKnesset ?? 0}
          additionalRoles={
            hoveredMember.roleDesc ? [hoveredMember.roleDesc] : []
          }
          x={tooltipPosition.x}
          y={tooltipPosition.y}
        />
      ) : null}

      {overflowCount > 0 ? (
        <p className="committee-table__overflow">
          ועוד {overflowCount} חברים שאינם מוצגים סביב השולחן
        </p>
      ) : null}
    </div>
  )
}

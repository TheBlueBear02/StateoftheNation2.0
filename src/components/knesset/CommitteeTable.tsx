'use client'

import {
  useEffect,
  useMemo,
  useState,
  type AnimationEvent as ReactAnimationEvent,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
} from 'react'
import { createPortal } from 'react-dom'
import {
  COMMITTEE_TABLE_GEOMETRY,
  COMMITTEE_TABLE_VIEWBOX,
  committeeTableRingPath,
  initialsFromName,
  roundedRectPath,
  type LaidOutSeat,
} from '../../lib/committeeTableLayout'
import { LEGAL_COUNSEL_FALLBACK_PERSON_ID, COMMITTEE_MANAGER_FALLBACK_PERSON_ID } from '../../lib/committeeSpeakerMatch'
import { Tooltip } from './Tooltip'

type CommitteeSeatProps = {
  seat: LaidOutSeat
  index: number
  isSpeaking: boolean
  isSelected: boolean
  onSelect: (personId: number | null) => void
  onHover: (
    seat: LaidOutSeat | null,
    event: ReactMouseEvent<SVGGElement> | null,
  ) => void
}

function staffFallbackPersonId(kind: LaidOutSeat['kind']): number | null {
  if (kind === 'legal_counsel') {
    return LEGAL_COUNSEL_FALLBACK_PERSON_ID
  }
  if (kind === 'committee_manager') {
    return COMMITTEE_MANAGER_FALLBACK_PERSON_ID
  }
  return null
}

function CommitteeSeat({
  seat,
  index,
  isSpeaking,
  isSelected,
  onSelect,
  onHover,
}: CommitteeSeatProps) {
  const [enterDone, setEnterDone] = useState(false)
  const isStaff =
    seat.kind === 'legal_counsel' || seat.kind === 'committee_manager'
  const isAbsent = !isStaff && !seat.attended
  const personId =
    seat.member?.personId ?? staffFallbackPersonId(seat.kind)
  // Staff seats are always selectable once a session is open.
  const interactive = isStaff || personId != null
  const radius = 28
  const imageUrl = seat.member?.imageUrl
  const clipId = `seat-clip-${seat.key.replace(/[^a-zA-Z0-9_-]/g, '-')}`
  const placeholderLabel =
    seat.kind === 'legal_counsel'
      ? 'יועמ״ש'
      : seat.kind === 'committee_manager'
        ? 'מנהל/ת'
        : null

  function handleEnterEnd(event: ReactAnimationEvent<SVGGElement>) {
    if (event.animationName !== 'committee-seat-enter') {
      return
    }
    setEnterDone(true)
  }

  return (
    <g
      className={[
        'committee-seat',
        isSpeaking ? 'committee-seat--speaking' : '',
        isSelected ? 'committee-seat--selected' : '',
        isStaff ? 'committee-seat--staff' : '',
        seat.kind === 'legal_counsel' ? 'committee-seat--counsel' : '',
        seat.kind === 'committee_manager' ? 'committee-seat--manager' : '',
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
        if (interactive && personId != null) {
          onSelect(personId)
        }
      }}
      onKeyDown={(event) => {
        if (!interactive || personId == null) {
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
      style={
        {
          '--seat-i': index,
          ...(interactive ? { cursor: 'pointer' } : {}),
        } as CSSProperties
      }
    >
      <defs>
        <clipPath id={clipId}>
          <circle r={radius} cx={0} cy={0} />
        </clipPath>
      </defs>
      <g
        className={[
          'committee-seat__visual',
          enterDone ? '' : 'committee-seat__visual--enter',
        ]
          .filter(Boolean)
          .join(' ')}
        onAnimationEnd={handleEnterEnd}
      >
        <circle className="committee-seat__ring" r={radius + 3.5} fill="none" />
        <circle
          className="committee-seat__disc"
          r={radius}
          fill={isStaff ? '#ebe4da' : '#fff'}
        />
        {imageUrl && !isStaff ? (
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
            fontSize={placeholderLabel ? 10 : 13}
          >
            {placeholderLabel ?? initialsFromName(seat.label)}
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
  /** Remount seats (replay enter animation) when the open session changes. */
  enterKey?: number | string | null
}

export function CommitteeTable({
  seats,
  overflowCount,
  speakingPersonId,
  selectedPersonId,
  onSelectPerson,
  loading = false,
  enterKey = null,
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

  // Clockwise from the chair (top), so the stagger sweeps the rim cleanly.
  const staggerIndexByKey = useMemo(() => {
    const { cx, cy } = COMMITTEE_TABLE_GEOMETRY
    const ranked = seats
      .map((seat) => {
        let angle = Math.atan2(seat.x - cx, cy - seat.y)
        if (angle < 0) {
          angle += Math.PI * 2
        }
        return { key: seat.key, angle }
      })
      .sort((a, b) => a.angle - b.angle)
    return new Map(ranked.map((item, index) => [item.key, index]))
  }, [seats])

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
      const seatRect = event.currentTarget.getBoundingClientRect()
      setTooltipPosition({
        x: seatRect.left + seatRect.width / 2,
        y: seatRect.top,
      })
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

        {seats.map((seat) => {
          const seatPersonId =
            seat.member?.personId ??
            (seat.kind === 'legal_counsel'
              ? LEGAL_COUNSEL_FALLBACK_PERSON_ID
              : seat.kind === 'committee_manager'
                ? COMMITTEE_MANAGER_FALLBACK_PERSON_ID
                : null)
          return (
            <CommitteeSeat
              key={
                enterKey != null ? `${enterKey}-${seat.key}` : seat.key
              }
              seat={seat}
              index={staggerIndexByKey.get(seat.key) ?? 0}
              isSpeaking={
                seatPersonId != null && seatPersonId === speakingPersonId
              }
              isSelected={
                seatPersonId != null && seatPersonId === selectedPersonId
              }
              onSelect={onSelectPerson}
              onHover={handleHover}
            />
          )
        })}
      </svg>

      {hoveredMember
        ? createPortal(
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
              anchor="above"
            />,
            document.body,
          )
        : null}

      {overflowCount > 0 ? (
        <p className="committee-table__overflow">
          ועוד {overflowCount} חברי ועדה שאינם מוצגים סביב השולחן
        </p>
      ) : null}
    </div>
  )
}

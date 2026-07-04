import type { CSSProperties, MouseEvent } from 'react'
import type { PlacedMember } from '../../lib/hemicycle'
import {
  DOT_BORDER,
  DOT_RADIUS,
  getInitials,
  SEAT_REVEAL_DURATION_MS,
  SEAT_REVEAL_STAGGER_MS,
  tintColor,
} from '../../lib/hemicycle'

type MKDotProps = {
  member: PlacedMember
  isSkeleton?: boolean
  isHovered?: boolean
  revealIndex?: number
  animate?: boolean
  onHover?: (member: PlacedMember | null) => void
  onMove?: (event: MouseEvent<SVGGElement>) => void
}

export function MKDot({
  member,
  isSkeleton = false,
  isHovered = false,
  revealIndex = 0,
  animate = false,
  onHover,
  onMove,
}: MKDotProps) {
  const borderColor = isSkeleton || !member.factionColor ? '#c8c8c8' : member.factionColor
  const fillColor =
    isSkeleton || !member.factionColor
      ? '#e6e6e6'
      : tintColor(member.factionColor, 0.2)
  const scale = isHovered ? 1.15 : 1
  const hasImage = Boolean(member.imageUrl) && !isSkeleton
  const clipId = `mk-clip-${member.seatIndex}`
  const shouldAnimate = animate && !isSkeleton && Boolean(member.fullName)
  let bodyStyle: CSSProperties | undefined

  if (shouldAnimate) {
    bodyStyle = {
      animationDelay: `${revealIndex * SEAT_REVEAL_STAGGER_MS}ms`,
      animationDuration: `${SEAT_REVEAL_DURATION_MS}ms`,
    }
  } else if (isSkeleton) {
    bodyStyle = {
      animationDelay: `${(revealIndex % 30) * 45}ms`,
    }
  }

  function handleMouseLeave(event: MouseEvent<SVGGElement>) {
    const related = event.relatedTarget

    if (related instanceof Element) {
      const targetFaction = related
        .closest('[data-faction-name]')
        ?.getAttribute('data-faction-name')

      if (targetFaction && targetFaction === (member.factionName ?? '')) {
        return
      }
    }

    onHover?.(null)
  }

  return (
    <g
      className={`mk-dot${isSkeleton ? ' mk-dot--skeleton' : ''}`}
      data-faction-name={member.factionName ?? ''}
      transform={`translate(${member.x}, ${member.y})`}
      onMouseEnter={() => onHover?.(member)}
      onMouseLeave={handleMouseLeave}
      onMouseMove={(event) => onMove?.(event)}
    >
      <g
        className={`mk-dot__body${isSkeleton ? ' mk-dot__body--skeleton' : ''}${shouldAnimate ? ' mk-dot__body--enter' : ''}`}
        style={bodyStyle}
      >
        <g className="mk-dot__scale" transform={`scale(${scale})`}>
          {hasImage ? (
            <>
              <defs>
                <clipPath id={clipId}>
                  <circle r={DOT_RADIUS - DOT_BORDER} />
                </clipPath>
              </defs>
              <circle
                r={DOT_RADIUS}
                fill="#f0f0f0"
                stroke={borderColor}
                strokeWidth={DOT_BORDER}
              />
              <image
                href={member.imageUrl ?? undefined}
                x={-(DOT_RADIUS - DOT_BORDER)}
                y={-(DOT_RADIUS - DOT_BORDER)}
                width={(DOT_RADIUS - DOT_BORDER) * 2}
                height={(DOT_RADIUS - DOT_BORDER) * 2}
                clipPath={`url(#${clipId})`}
                preserveAspectRatio="xMidYMid slice"
              />
            </>
          ) : (
            <>
              <circle
                r={DOT_RADIUS}
                fill={fillColor}
                stroke={borderColor}
                strokeWidth={DOT_BORDER}
              />
              {!isSkeleton && member.fullName ? (
                <text
                  className="mk-dot__initials"
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize="9"
                  fill="#1a1a1a"
                >
                  {getInitials(member.fullName)}
                </text>
              ) : null}
            </>
          )}
        </g>
      </g>
    </g>
  )
}

import type { MouseEvent } from 'react'
import type { PlacedMember } from '../../lib/hemicycle'
import {
  DOT_BORDER,
  DOT_RADIUS,
  getInitials,
  tintColor,
} from '../../lib/hemicycle'

type MKDotProps = {
  member: PlacedMember
  isSkeleton?: boolean
  isHovered?: boolean
  onHover?: (member: PlacedMember | null) => void
  onMove?: (event: MouseEvent<SVGGElement>) => void
}

export function MKDot({
  member,
  isSkeleton = false,
  isHovered = false,
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

  return (
    <g
      className={`mk-dot${isSkeleton ? ' mk-dot--skeleton' : ''}${isHovered ? ' mk-dot--hovered' : ''}`}
      transform={`translate(${member.x}, ${member.y}) scale(${scale})`}
      onMouseEnter={() => onHover?.(member)}
      onMouseLeave={() => onHover?.(null)}
      onMouseMove={(event) => onMove?.(event)}
    >
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
  )
}

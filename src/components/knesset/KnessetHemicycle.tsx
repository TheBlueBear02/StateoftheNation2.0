import { useMemo, useState, type MouseEvent } from 'react'
import {
  buildSkeletonLayout,
  HEMICYCLE_VIEWBOX,
  type PlacedMember,
} from '../../lib/hemicycle'
import { CenterCounter } from './CenterCounter'
import { MKDot } from './MKDot'
import { Tooltip } from './Tooltip'

type KnessetHemicycleProps = {
  placedMembers: PlacedMember[]
  coalitionCount: number
  oppositionCount: number
  hasCoalitionData: boolean
  loading?: boolean
}

export function KnessetHemicycle({
  placedMembers,
  coalitionCount,
  oppositionCount,
  hasCoalitionData,
  loading = false,
}: KnessetHemicycleProps) {
  const [hoveredMember, setHoveredMember] = useState<PlacedMember | null>(null)
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 })

  const dots = useMemo(
    () => (loading ? buildSkeletonLayout() : placedMembers),
    [loading, placedMembers],
  )

  const totalCount = useMemo(
    () => placedMembers.filter((member) => member.fullName).length,
    [placedMembers],
  )

  function handleMove(event: MouseEvent<SVGGElement>) {
    setTooltipPosition({ x: event.clientX, y: event.clientY })
  }

  return (
    <div className="knesset-hemicycle">
      <svg
        className="knesset-hemicycle__svg"
        viewBox={`0 0 ${HEMICYCLE_VIEWBOX.width} ${HEMICYCLE_VIEWBOX.height}`}
        width="100%"
        height="auto"
        role="img"
        aria-label="מפת חברי הכנסת"
      >
        {dots.map((member) => (
          <MKDot
            key={member.seatIndex}
            member={member}
            isSkeleton={loading}
            isHovered={hoveredMember?.seatIndex === member.seatIndex}
            onHover={setHoveredMember}
            onMove={handleMove}
          />
        ))}

        <CenterCounter
          coalitionCount={coalitionCount}
          oppositionCount={oppositionCount}
          totalCount={totalCount}
          hasCoalitionData={hasCoalitionData}
        />
      </svg>

      {hoveredMember && !loading ? (
        <Tooltip
          fullName={hoveredMember.fullName}
          factionName={hoveredMember.factionName}
          factionColor={hoveredMember.factionColor}
          imageUrl={hoveredMember.imageUrl}
          firstElectedYear={hoveredMember.firstElectedYear}
          totalDaysInKnesset={hoveredMember.totalDaysInKnesset}
          totalYearsInKnesset={hoveredMember.totalYearsInKnesset}
          x={tooltipPosition.x}
          y={tooltipPosition.y}
        />
      ) : null}
    </div>
  )
}

import { useEffect, useMemo, useState, type MouseEvent } from 'react'
import {
  HEMICYCLE_VIEWBOX,
  SEAT_REVEAL_ORDER,
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

  const totalCount = useMemo(
    () => placedMembers.filter((member) => member.fullName).length,
    [placedMembers],
  )

  useEffect(() => {
    if (loading) {
      setHoveredMember(null)
    }
  }, [loading])

  function handleMove(event: MouseEvent<SVGGElement>) {
    setTooltipPosition({ x: event.clientX, y: event.clientY })
  }

  const hoveredFactionName = hoveredMember?.factionName ?? null

  function isFactionHovered(member: PlacedMember): boolean {
    if (!hoveredFactionName || !member.fullName) {
      return false
    }

    return member.factionName === hoveredFactionName
  }

  const hoveredBloc =
    hasCoalitionData && hoveredMember?.fullName
      ? hoveredMember.isCoalition
        ? 'coalition'
        : 'opposition'
      : null

  if (loading) {
    return (
      <div className="knesset-hemicycle" aria-busy="true">
        <div className="knesset-hemicycle__skeleton" role="status">
          <span className="visually-hidden">טוען מפת חברי הכנסת</span>
        </div>
      </div>
    )
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
        {placedMembers.map((member) => (
          <MKDot
            key={member.seatIndex}
            member={member}
            isHovered={isFactionHovered(member)}
            revealIndex={SEAT_REVEAL_ORDER.get(member.seatIndex) ?? 0}
            animate
            onHover={setHoveredMember}
            onMove={handleMove}
          />
        ))}

        <CenterCounter
          coalitionCount={coalitionCount}
          oppositionCount={oppositionCount}
          totalCount={totalCount}
          hasCoalitionData={hasCoalitionData}
          hoveredBloc={hoveredBloc}
          animate
        />
      </svg>

      {hoveredMember ? (
        <Tooltip
          fullName={hoveredMember.fullName}
          factionName={hoveredMember.factionName}
          factionColor={hoveredMember.factionColor}
          imageUrl={hoveredMember.imageUrl}
          firstElectedYear={hoveredMember.firstElectedYear}
          totalDaysInKnesset={hoveredMember.totalDaysInKnesset}
          totalYearsInKnesset={hoveredMember.totalYearsInKnesset}
          additionalRoles={hoveredMember.additionalRoles}
          x={tooltipPosition.x}
          y={tooltipPosition.y}
        />
      ) : null}
    </div>
  )
}

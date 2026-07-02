import { useState, type MouseEvent } from 'react'
import type { FactionGroup } from '../../lib/hemicycle'
import { getInitials, tintColor } from '../../lib/hemicycle'
import { Tooltip } from './Tooltip'

type FactionListProps = {
  factionGroups: FactionGroup[]
  loading?: boolean
}

type HoveredMember = {
  fullName: string
  factionName: string | null
  factionColor: string | null
}

function seatsLabel(count: number): string {
  return count === 1 ? 'מנדט אחד' : `${count} מנדטים`
}

export function FactionList({ factionGroups, loading = false }: FactionListProps) {
  const [hovered, setHovered] = useState<HoveredMember | null>(null)
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 })

  function handleMove(event: MouseEvent) {
    setTooltipPosition({ x: event.clientX, y: event.clientY })
  }

  if (loading) {
    return (
      <div className="faction-list" aria-hidden="true">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="faction-card faction-card--skeleton" />
        ))}
      </div>
    )
  }

  if (factionGroups.length === 0) {
    return null
  }

  return (
    <>
      <div className="faction-list">
        {factionGroups.map((group) => {
          const color = group.factionColor ?? '#c8c8c8'

          return (
            <article
              key={`${group.factionId ?? 'none'}-${group.factionName}`}
              className="faction-card"
            >
              <header className="faction-card__header">
                <h3 className="faction-card__name">
                  <span
                    className="faction-card__swatch"
                    style={{ backgroundColor: color }}
                    aria-hidden="true"
                  />
                  {group.factionName}
                </h3>
                <span className="faction-card__seats">
                  {seatsLabel(group.members.length)}
                </span>
              </header>

              <ul className="faction-card__members">
                {group.members.map((member, index) => (
                  <li
                    key={`${member.fullName}-${index}`}
                    className="faction-member"
                    onMouseEnter={() =>
                      setHovered({
                        fullName: member.fullName,
                        factionName: group.factionName,
                        factionColor: group.factionColor,
                      })
                    }
                    onMouseLeave={() => setHovered(null)}
                    onMouseMove={handleMove}
                  >
                    {member.imageUrl ? (
                      <img
                        className="faction-member__photo"
                        src={member.imageUrl}
                        alt={member.fullName}
                        loading="lazy"
                        style={{ borderColor: color }}
                      />
                    ) : (
                      <span
                        className="faction-member__initials"
                        style={{
                          borderColor: color,
                          backgroundColor: tintColor(color, 0.2),
                        }}
                      >
                        {getInitials(member.fullName)}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </article>
          )
        })}
      </div>

      {hovered ? (
        <Tooltip
          fullName={hovered.fullName}
          factionName={hovered.factionName}
          factionColor={hovered.factionColor}
          x={tooltipPosition.x}
          y={tooltipPosition.y}
        />
      ) : null}
    </>
  )
}

import { useState, type MouseEvent } from 'react'
import type {
  GovernmentPyramidMember,
  GovernmentPyramidTier,
} from '../../lib/governmentStructure'
import { getInitials, resolveFactionColor, tintColor } from '../../lib/hemicycle'
import { Tooltip } from '../knesset/Tooltip'

type GovernmentPyramidProps = {
  tiers: GovernmentPyramidTier[]
  ministerAndDeputyCount: number
  startDate: string | null
  endDate: string | null
  loading?: boolean
}

function totalMinistersLabel(count: number): string {
  return count === 1
    ? 'שר/סגן שר אחד'
    : `${count} שרים וסגני שרים`
}

function formatDate(value: string | null): string {
  if (!value) {
    return 'לא ידוע'
  }

  return new Intl.DateTimeFormat('he-IL', {
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
  }).format(new Date(value))
}

function formatGovernmentPeriod(startDate: string | null, endDate: string | null): string {
  return `${formatDate(startDate)}–${endDate ? formatDate(endDate) : 'היום'}`
}

function GovernmentAvatar({
  member,
  tierIndex,
  memberIndex,
  onHover,
  onLeave,
  onMove,
}: {
  member: GovernmentPyramidMember
  tierIndex: number
  memberIndex: number
  onHover: (member: GovernmentPyramidMember) => void
  onLeave: () => void
  onMove: (event: MouseEvent) => void
}) {
  const color = resolveFactionColor(
    member.factionId,
    member.factionColor,
    member.factionName,
  )
  const revealIndex = tierIndex * 8 + memberIndex

  return (
    <li
      className={`government-pyramid__member government-pyramid__member--${member.roleKind}`}
      style={{ animationDelay: `${revealIndex * 35}ms` }}
      onMouseEnter={() => onHover(member)}
      onMouseLeave={onLeave}
      onMouseMove={onMove}
    >
      <span className="government-pyramid__avatar-wrap">
        {member.imageUrl ? (
          <img
            className="government-pyramid__avatar"
            src={member.imageUrl}
            alt={member.fullName}
            loading="lazy"
            style={{ borderColor: color }}
          />
        ) : (
          <span
            className="government-pyramid__initials"
            style={{
              borderColor: color,
              backgroundColor: tintColor(color, 0.2),
            }}
          >
            {getInitials(member.fullName)}
          </span>
        )}
      </span>
      <span className="government-pyramid__name">{member.fullName}</span>
      <span className="government-pyramid__role">{member.roleTitle}</span>
    </li>
  )
}

function isLeadershipTier(tier: GovernmentPyramidTier): boolean {
  return tier.id === 'prime-minister'
}

export function GovernmentPyramid({
  tiers,
  ministerAndDeputyCount,
  startDate,
  endDate,
  loading = false,
}: GovernmentPyramidProps) {
  const [hovered, setHovered] = useState<GovernmentPyramidMember | null>(null)
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 })

  function handleMove(event: MouseEvent) {
    setTooltipPosition({ x: event.clientX, y: event.clientY })
  }

  if (loading) {
    return (
      <section className="government-pyramid" aria-label="מבנה הממשלה">
        <div className="government-pyramid__meta" aria-hidden="true">
          <div className="government-pyramid__meta-item government-pyramid__meta-item--dates" />
          <div className="government-pyramid__meta-item government-pyramid__meta-item--count" />
        </div>
        <div className="government-pyramid__skeleton" aria-hidden="true">
          {Array.from({ length: 4 }).map((_, rowIndex) => (
            <div key={rowIndex} className="government-pyramid__skeleton-row">
              {Array.from({ length: rowIndex === 0 ? 1 : rowIndex * 3 }).map(
                (__, itemIndex) => (
                  <span
                    key={`${rowIndex}-${itemIndex}`}
                    className="government-pyramid__skeleton-dot"
                  />
                ),
              )}
            </div>
          ))}
        </div>
      </section>
    )
  }

  if (tiers.length === 0) {
    return null
  }

  return (
    <section className="government-pyramid" aria-label="מבנה הממשלה">
      <div className="government-pyramid__meta">
        <div className="government-pyramid__meta-item government-pyramid__meta-item--dates">
          <span className="government-pyramid__meta-value">
            {formatGovernmentPeriod(startDate, endDate)}
          </span>
        </div>
        <div className="government-pyramid__meta-item government-pyramid__meta-item--count">
          <span className="government-pyramid__meta-value">
            {totalMinistersLabel(ministerAndDeputyCount)}
          </span>
        </div>
      </div>

      <div className="government-pyramid__tiers">
        {tiers.map((tier, tierIndex) => (
          <div key={tier.id} className="government-pyramid__tier">
            <h2 className="government-pyramid__tier-label">{tier.label}</h2>
            {isLeadershipTier(tier) &&
            tier.members.some((member) => member.roleKind === 'primeMinister') ? (
              <div className="government-pyramid__leadership-row">
                <ul className="government-pyramid__leadership-side government-pyramid__leadership-side--left">
                  {tier.members
                    .filter((member) => member.roleKind !== 'primeMinister')
                    .map((member, memberIndex) => (
                      <GovernmentAvatar
                        key={`${tier.id}-${member.personId}`}
                        member={member}
                        tierIndex={tierIndex}
                        memberIndex={memberIndex}
                        onHover={setHovered}
                        onLeave={() => setHovered(null)}
                        onMove={handleMove}
                      />
                    ))}
                </ul>

                <ul className="government-pyramid__leadership-center">
                  {tier.members
                    .filter((member) => member.roleKind === 'primeMinister')
                    .map((member, memberIndex) => (
                      <GovernmentAvatar
                        key={`${tier.id}-${member.personId}`}
                        member={member}
                        tierIndex={tierIndex}
                        memberIndex={memberIndex}
                        onHover={setHovered}
                        onLeave={() => setHovered(null)}
                        onMove={handleMove}
                      />
                    ))}
                </ul>

                <div
                  className="government-pyramid__leadership-side government-pyramid__leadership-side--right"
                  aria-hidden="true"
                />
              </div>
            ) : (
              <ul className="government-pyramid__row">
                {tier.members.map((member, memberIndex) => (
                  <GovernmentAvatar
                    key={`${tier.id}-${member.personId}`}
                    member={member}
                    tierIndex={tierIndex}
                    memberIndex={memberIndex}
                    onHover={setHovered}
                    onLeave={() => setHovered(null)}
                    onMove={handleMove}
                  />
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>

      {hovered ? (
        <Tooltip
          fullName={hovered.fullName}
          factionName={hovered.factionName ?? 'ללא סיעה'}
          factionColor={resolveFactionColor(
            hovered.factionId,
            hovered.factionColor,
            hovered.factionName,
          )}
          imageUrl={hovered.imageUrl}
          firstElectedYear={null}
          totalDaysInKnesset={0}
          totalYearsInKnesset={0}
          additionalRoles={hovered.additionalRoles}
          x={tooltipPosition.x}
          y={tooltipPosition.y}
        />
      ) : null}
    </section>
  )
}

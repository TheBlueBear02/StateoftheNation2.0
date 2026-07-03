import { useState, type MouseEvent } from 'react'
import type {
  GovernmentAppointment,
  GovernmentOfficeGroup,
} from '../../lib/governmentStructure'
import { getInitials, resolveFactionColor, tintColor } from '../../lib/hemicycle'
import { Tooltip } from '../knesset/Tooltip'

type OfficeListProps = {
  officeGroups: GovernmentOfficeGroup[]
  loading?: boolean
}

function OfficePerson({
  appointment,
  onHover,
  onLeave,
  onMove,
}: {
  appointment: GovernmentAppointment
  onHover: (appointment: GovernmentAppointment) => void
  onLeave: () => void
  onMove: (event: MouseEvent) => void
}) {
  const color = resolveFactionColor(
    appointment.factionId,
    appointment.factionColor,
    appointment.factionName,
  )

  return (
    <li
      className="office-person"
      onMouseEnter={() => onHover(appointment)}
      onMouseLeave={onLeave}
      onMouseMove={onMove}
    >
      {appointment.imageUrl ? (
        <img
          className="office-person__photo"
          src={appointment.imageUrl}
          alt=""
          loading="lazy"
          style={{ borderColor: color }}
        />
      ) : (
        <span
          className="office-person__initials"
          style={{
            borderColor: color,
            backgroundColor: tintColor(color, 0.2),
          }}
          aria-hidden="true"
        >
          {getInitials(appointment.fullName)}
        </span>
      )}

      <span className="office-person__body">
        <span className="office-person__name">{appointment.fullName}</span>
        <span className="office-person__role">{appointment.roleTitle}</span>
      </span>
    </li>
  )
}

export function OfficeList({ officeGroups, loading = false }: OfficeListProps) {
  const [hovered, setHovered] = useState<GovernmentAppointment | null>(null)
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 })

  function handleMove(event: MouseEvent) {
    setTooltipPosition({ x: event.clientX, y: event.clientY })
  }

  if (loading) {
    return (
      <div className="office-list" aria-hidden="true">
        {Array.from({ length: 8 }).map((_, index) => (
          <div key={index} className="office-card office-card--skeleton" />
        ))}
      </div>
    )
  }

  if (officeGroups.length === 0) {
    return null
  }

  return (
    <>
      <div className="office-list">
        {officeGroups.map((group) => (
          <article
            key={`${group.officeId ?? 'none'}-${group.officeName}`}
            className="office-card"
          >
            <header className="office-card__header">
              <h3 className="office-card__title">{group.officeName}</h3>
              <span className="office-card__count">
                {group.ministers.length === 1
                  ? 'שר אחד'
                  : `${group.ministers.length} שרים`}
              </span>
            </header>

            <ul className="office-card__people">
              {group.ministers.map((appointment) => (
                <OfficePerson
                  key={appointment.id}
                  appointment={appointment}
                  onHover={setHovered}
                  onLeave={() => setHovered(null)}
                  onMove={handleMove}
                />
              ))}
            </ul>

            {group.deputies.length > 0 ? (
              <div className="office-card__deputies">
                <h4 className="office-card__deputies-title">סגני שרים</h4>
                <ul className="office-card__people office-card__people--deputies">
                  {group.deputies.map((appointment) => (
                    <OfficePerson
                      key={appointment.id}
                      appointment={appointment}
                      onHover={setHovered}
                      onLeave={() => setHovered(null)}
                      onMove={handleMove}
                    />
                  ))}
                </ul>
              </div>
            ) : null}
          </article>
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
    </>
  )
}

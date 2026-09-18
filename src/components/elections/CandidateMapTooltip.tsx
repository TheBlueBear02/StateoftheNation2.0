import { getInitials, tintColor } from '../../lib/hemicycle'
import { formatTenureYears } from '../../lib/knessetTenure'

export type CandidateMapTooltipPerson = {
  id: number
  fullName: string
  partyName?: string | null
  imageUrl: string | null
  accentColor: string
  totalYearsInKnesset: number
}

type CandidateMapTooltipProps = {
  city: string
  people: CandidateMapTooltipPerson[]
  x: number
  y: number
}

export function CandidateMapTooltip({
  city,
  people,
  x,
  y,
}: CandidateMapTooltipProps) {
  if (!city || people.length === 0) {
    return null
  }

  const isMulti = people.length > 1

  return (
    <div
      className={`knesset-tooltip${isMulti ? ' knesset-tooltip--multi' : ''}`}
      style={{ left: x + 14, top: y + 14 }}
      role="tooltip"
    >
      <div className="knesset-tooltip__inner">
        <div className="knesset-tooltip__city">{city}</div>

        <div className="knesset-tooltip__people">
          {people.map((person) => (
            <div key={person.id} className="knesset-tooltip__header">
              {person.imageUrl ? (
                <img
                  className="knesset-tooltip__photo"
                  src={person.imageUrl}
                  alt=""
                />
              ) : (
                <span
                  className="knesset-tooltip__initials"
                  style={{
                    backgroundColor: tintColor(person.accentColor, 0.2),
                  }}
                >
                  {getInitials(person.fullName)}
                </span>
              )}

              <div className="knesset-tooltip__identity">
                <div className="knesset-tooltip__name">{person.fullName}</div>
                {person.partyName ? (
                  <div className="knesset-tooltip__faction">
                    {person.partyName}
                  </div>
                ) : null}
                {person.totalYearsInKnesset > 0 ? (
                  <div className="knesset-tooltip__tenure">
                    {formatTenureYears(person.totalYearsInKnesset)} בכנסת
                  </div>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

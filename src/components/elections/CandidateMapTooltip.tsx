import { getInitials, tintColor } from '../../lib/hemicycle'
import { formatTenureYears } from '../../lib/knessetTenure'

type CandidateMapTooltipProps = {
  fullName: string
  city: string
  imageUrl: string | null
  accentColor: string
  totalYearsInKnesset: number
  x: number
  y: number
}

export function CandidateMapTooltip({
  fullName,
  city,
  imageUrl,
  accentColor,
  totalYearsInKnesset,
  x,
  y,
}: CandidateMapTooltipProps) {
  if (!fullName || !city) {
    return null
  }

  return (
    <div
      className="knesset-tooltip"
      style={{ left: x + 14, top: y + 14 }}
      role="tooltip"
    >
      <div className="knesset-tooltip__inner">
        <div className="knesset-tooltip__header">
          {imageUrl ? (
            <img
              className="knesset-tooltip__photo"
              src={imageUrl}
              alt=""
            />
          ) : (
            <span
              className="knesset-tooltip__initials"
              style={{
                backgroundColor: tintColor(accentColor, 0.2),
              }}
            >
              {getInitials(fullName)}
            </span>
          )}

          <div className="knesset-tooltip__identity">
            <div className="knesset-tooltip__name">{fullName}</div>
            <div className="knesset-tooltip__faction">{city}</div>
          </div>
        </div>

        {totalYearsInKnesset > 0 ? (
          <div className="knesset-tooltip__details">
            <div className="knesset-tooltip__tenure">
              {formatTenureYears(totalYearsInKnesset)} בכנסת
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}

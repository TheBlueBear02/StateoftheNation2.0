import { getInitials, tintColor } from '../../lib/hemicycle'
import {
  formatTenureSummary,
} from '../../lib/knessetTenure'

type TooltipProps = {
  fullName: string
  factionName: string | null
  factionColor: string | null
  imageUrl: string | null
  firstElectedYear: number | null
  totalDaysInKnesset: number
  totalYearsInKnesset: number
  x: number
  y: number
}

export function Tooltip({
  fullName,
  factionName,
  factionColor,
  imageUrl,
  firstElectedYear,
  totalDaysInKnesset,
  totalYearsInKnesset,
  x,
  y,
}: TooltipProps) {
  if (!fullName || !factionName) {
    return null
  }

  const color = factionColor ?? '#c8c8c8'

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
              style={{ borderColor: color }}
            />
          ) : (
            <span
              className="knesset-tooltip__initials"
              style={{
                borderColor: color,
                backgroundColor: tintColor(color, 0.2),
              }}
            >
              {getInitials(fullName)}
            </span>
          )}

          <div className="knesset-tooltip__identity">
            <div className="knesset-tooltip__name">{fullName}</div>
            <div className="knesset-tooltip__faction">{factionName}</div>
          </div>
        </div>

        {totalDaysInKnesset > 0 || firstElectedYear !== null ? (
          <div className="knesset-tooltip__details">
            {totalDaysInKnesset > 0 ? (
              <div className="knesset-tooltip__tenure">
                {formatTenureSummary(totalDaysInKnesset, totalYearsInKnesset)}
              </div>
            ) : null}

            {firstElectedYear !== null ? (
              <div className="knesset-tooltip__meta">
                נבחר/ה לראשונה ב-{firstElectedYear}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  )
}

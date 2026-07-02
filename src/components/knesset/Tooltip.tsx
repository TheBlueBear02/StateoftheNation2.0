type TooltipProps = {
  fullName: string
  factionName: string | null
  factionColor: string | null
  x: number
  y: number
}

export function Tooltip({ fullName, factionName, factionColor, x, y }: TooltipProps) {
  if (!fullName || !factionName) {
    return null
  }

  return (
    <div
      className="knesset-tooltip"
      style={{ left: x + 14, top: y + 14 }}
      role="tooltip"
    >
      <div className="knesset-tooltip__faction">
        <span
          className="knesset-tooltip__dot"
          style={{ backgroundColor: factionColor ?? '#c8c8c8' }}
          aria-hidden="true"
        />
        <span>{factionName}</span>
      </div>
      <div className="knesset-tooltip__name">{fullName}</div>
    </div>
  )
}

import {
  DISPLAY_BLOC_COLORS,
  DISPLAY_BLOC_LABELS,
  DISPLAY_BLOC_ORDER,
  displayBlocBarGradient,
  KNESSET_SEATS,
  type DisplayBlocKey,
  type DisplayBlocTotals,
} from '../../lib/pollChartData'
import type { PollWithResults } from '../../hooks/usePolls'

type BlocDistributionBarProps = {
  totals: DisplayBlocTotals
  selectedPoll: PollWithResults | null
}

/** Same tag set as BlocTrendChart — רע״ם omitted from legend but still drawn in the bar. */
const BLOC_DIST_LEGEND_ORDER: DisplayBlocKey[] = [
  'opposition',
  'hadashTaal',
  'coalition',
]

export function BlocDistributionBar({ totals, selectedPoll }: BlocDistributionBarProps) {
  const segments = DISPLAY_BLOC_ORDER.map((bloc) => ({
    bloc,
    seats: totals[bloc],
    width: (totals[bloc] / KNESSET_SEATS) * 100,
  })).filter((s) => s.seats > 0)

  const title = selectedPoll ? 'חלוקה לגושים' : 'ממוצע החלוקה לגושים'

  return (
    <section className="polls-chart polls-chart--bloc" aria-labelledby="bloc-dist-title">
      <h2 id="bloc-dist-title" className="polls-chart__title">
        {title}
      </h2>

      <div className="polls-bloc-legend" aria-label="מקרא גושים">
        {BLOC_DIST_LEGEND_ORDER.map((bloc) => (
          <span key={bloc} className="polls-bloc-legend__item">
            <span
              className="polls-bloc-legend__swatch"
              style={{ backgroundColor: DISPLAY_BLOC_COLORS[bloc] }}
            />
            {DISPLAY_BLOC_LABELS[bloc]}
          </span>
        ))}
      </div>

      <div
        className="polls-bloc-bar"
        role="img"
        aria-label="חלוקת מנדטים לפי גושים"
      >
        {segments.map(({ bloc, seats, width }) => (
          <div
            key={bloc}
            className="polls-bloc-bar__segment"
            style={{
              width: `${width}%`,
              background: displayBlocBarGradient(DISPLAY_BLOC_COLORS[bloc]),
            }}
            title={`${DISPLAY_BLOC_LABELS[bloc]}: ${Math.round(seats)}`}
          >
            <span className="polls-bloc-bar__value">{Math.round(seats)}</span>
          </div>
        ))}
      </div>
    </section>
  )
}

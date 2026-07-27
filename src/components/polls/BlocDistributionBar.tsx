import {
  DISPLAY_BLOC_COLORS,
  DISPLAY_BLOC_LABELS,
  DISPLAY_BLOC_ORDER,
  KNESSET_SEATS,
  type DisplayBlocKey,
  type DisplayBlocTotals,
} from '../../lib/pollChartData'

type BlocDistributionBarProps = {
  totals: DisplayBlocTotals
}

function SegmentName({ bloc }: { bloc: DisplayBlocKey }) {
  if (bloc === 'hadashTaal') {
    return (
      <span className="polls-bloc-bar__name polls-bloc-bar__name--stacked">
        <span>חד״ש</span>
        <span>תע״ל</span>
      </span>
    )
  }

  return (
    <span className="polls-bloc-bar__name">{DISPLAY_BLOC_LABELS[bloc]}</span>
  )
}

export function BlocDistributionBar({ totals }: BlocDistributionBarProps) {
  const segments = DISPLAY_BLOC_ORDER.map((bloc) => ({
    bloc,
    seats: totals[bloc],
    width: (totals[bloc] / KNESSET_SEATS) * 100,
  })).filter((s) => s.seats > 0)

  return (
    <section className="polls-chart polls-chart--bloc" aria-labelledby="bloc-dist-title">
      <h2 id="bloc-dist-title" className="polls-chart__title">
        ממוצע החלוקה לגושים
      </h2>

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
              backgroundColor: DISPLAY_BLOC_COLORS[bloc],
            }}
            title={`${DISPLAY_BLOC_LABELS[bloc]}: ${Math.round(seats)}`}
          >
            <span className="polls-bloc-bar__value">{Math.round(seats)}</span>
            <SegmentName bloc={bloc} />
          </div>
        ))}
      </div>
    </section>
  )
}

import type { ElectionCandidateStats, ElectionStat } from '../../hooks/useElectionCandidates'

type StatsBarProps = {
  stats: ElectionCandidateStats
}

type StatItem = {
  label: string
  value: string
  coverage: string
}

function formatAverageAge(stat: ElectionStat): StatItem {
  return {
    label: 'גיל ממוצע',
    value: stat.value === null ? 'אין נתונים' : `${stat.value}`,
    coverage:
      stat.count > 0
        ? `חושב עבור ${stat.count} מתוך ${stat.total}`
        : 'אין תאריכי לידה זמינים',
  }
}

function formatPercent(label: string, stat: ElectionStat, emptyLabel: string): StatItem {
  return {
    label,
    value: stat.value === null ? 'אין נתונים' : `${stat.value}%`,
    coverage: stat.total > 0 ? `${stat.count} מתוך ${stat.total}` : emptyLabel,
  }
}

export function StatsBar({ stats }: StatsBarProps) {
  const items: StatItem[] = [
    formatAverageAge(stats.averageAge),
    formatPercent('ח"כים חדשים', stats.newMks, 'אין מועמדים ברשימה'),
    formatPercent('נשים', stats.women, 'אין נתוני מגדר זמינים'),
  ]

  return (
    <section className="party-detail-card stats-bar" aria-labelledby="stats-title">
      <div className="party-detail-card__header">
        <p className="party-detail-card__eyebrow">במספרים</p>
        <h2 id="stats-title" className="party-detail-card__title">
          סטטיסטיקות על הרשימה
        </h2>
      </div>

      <div className="stats-bar__grid">
        {items.map((item) => (
          <div key={item.label} className="stats-bar__item">
            <p className="stats-bar__value">{item.value}</p>
            <p className="stats-bar__label">{item.label}</p>
            <p className="stats-bar__coverage">{item.coverage}</p>
          </div>
        ))}
      </div>
    </section>
  )
}

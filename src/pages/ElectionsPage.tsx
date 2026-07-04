import { useEffect, useState } from 'react'
import { SiteLayout } from '../components/SiteLayout'
import { PartyCard, PartyCardSkeleton } from '../components/elections/PartyCard'
import {
  formatElectionDate,
  useElectionParties,
} from '../hooks/useElectionParties'
import './ElectionsPage.css'

const SKELETON_CARDS = Array.from({ length: 8 }, (_, index) => index)
const MS_PER_DAY = 1000 * 60 * 60 * 24

function parseElectionDateUtc(date: string | null): number | null {
  if (!date) {
    return null
  }

  const dateOnlyMatch = date.match(/^(\d{4})-(\d{2})-(\d{2})/)

  if (dateOnlyMatch) {
    const [, year, month, day] = dateOnlyMatch

    return Date.UTC(Number(year), Number(month) - 1, Number(day))
  }

  const parsedDate = new Date(date)

  if (Number.isNaN(parsedDate.getTime())) {
    return null
  }

  return Date.UTC(
    parsedDate.getFullYear(),
    parsedDate.getMonth(),
    parsedDate.getDate(),
  )
}

function getTodayUtc(now: Date): number {
  return Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())
}

function formatElectionCountdown(
  electionDate: string | null,
  now: Date,
): string | null {
  const electionDay = parseElectionDateUtc(electionDate)

  if (electionDay === null) {
    return null
  }

  const daysUntilElection = Math.round((electionDay - getTodayUtc(now)) / MS_PER_DAY)

  if (daysUntilElection < 0) {
    return 'הבחירות התקיימו'
  }

  if (daysUntilElection === 0) {
    return 'הבחירות היום'
  }

  if (daysUntilElection === 1) {
    return 'עוד יום אחד לבחירות'
  }

  return `עוד ${daysUntilElection.toLocaleString('he-IL')} יום לבחירות`
}

function useCurrentTime() {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setNow(new Date())
    }, 60 * 60 * 1000)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [])

  return now
}

export function ElectionsPage() {
  const { election, parties, loading, error } = useElectionParties()
  const now = useCurrentTime()
  const title = election?.name ?? 'בחירות 2026'
  const dateLabel = formatElectionDate(election?.date ?? null)
  const countdownLabel =
    formatElectionCountdown(election?.date ?? null, now) ?? title

  return (
    <SiteLayout className="elections-page">
      <main className="elections-page__main">
        <section className="elections-page__hero" aria-labelledby="elections-title">
          <div className="elections-page__inner container">
            <header className="elections-page__header">
              <p className="elections-page__eyebrow">{countdownLabel}</p>
              <h1 id="elections-title" className="elections-page__title">
                {title}
              </h1>
              <p className="elections-page__subtitle">
                כל המפלגות שרצות לכנסת ה-26 במקום אחד. לחצו על מפלגה כדי לראות את
                הרשימה, הנתונים והמפה הגיאוגרפית של המועמדים.
              </p>
              {dateLabel ? (
                <p className="elections-page__date">מועד הבחירות: {dateLabel}</p>
              ) : null}
            </header>
          </div>
        </section>

        <section className="elections-page__parties" aria-labelledby="parties-title">
          <div className="elections-page__inner container">
            <div className="elections-page__section-header">
              <h2 id="parties-title" className="elections-page__section-title">
                המפלגות המתמודדות
              </h2>
            </div>

            {error ? (
              <p className="elections-page__error" role="alert">
                לא ניתן לטעון את נתוני הבחירות
              </p>
            ) : null}

            {!error ? (
              <div className="elections-page__grid" aria-busy={loading}>
                {loading
                  ? SKELETON_CARDS.map((item) => <PartyCardSkeleton key={item} />)
                  : parties.map((party) => <PartyCard key={party.id} party={party} />)}
              </div>
            ) : null}

            {!loading && !error && parties.length === 0 ? (
              <p className="elections-page__empty">
                אין מפלגות זמינות למפתח הציבורי כרגע. אם קיימות שורות בטבלת
                המפלגות, בדקו שיש הרשאת קריאה ציבורית לנתוני הבחירות.
              </p>
            ) : null}
          </div>
        </section>
      </main>
    </SiteLayout>
  )
}

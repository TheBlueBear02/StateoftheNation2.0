import { SiteLayout } from '../components/SiteLayout'
import { PartyCard, PartyCardSkeleton } from '../components/elections/PartyCard'
import {
  formatElectionDate,
  useElectionParties,
} from '../hooks/useElectionParties'
import './ElectionsPage.css'

const SKELETON_CARDS = Array.from({ length: 8 }, (_, index) => index)

export function ElectionsPage() {
  const { election, parties, loading, error } = useElectionParties()
  const title = election?.name ?? 'בחירות 2026'
  const dateLabel = formatElectionDate(election?.date ?? null)

  return (
    <SiteLayout className="elections-page">
      <main className="elections-page__main">
        <section className="elections-page__hero" aria-labelledby="elections-title">
          <div className="elections-page__inner container">
            <header className="elections-page__header">
              <p className="elections-page__eyebrow">בחירות 2026</p>
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
              <p className="elections-page__section-copy">
                הרשימה מתעדכנת לפי טבלת המפלגות בבסיס הנתונים.
              </p>
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

import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { SiteLayout } from '../components/SiteLayout'
import { BlocDistributionBar } from '../components/polls/BlocDistributionBar'
import { BlocTrendChart } from '../components/polls/BlocTrendChart'
import { LastPollsBarChart } from '../components/polls/LastPollsBarChart'
import { usePolls } from '../hooks/usePolls'
import {
  buildPollSnapshots,
  computeLastNAverage,
  selectRecentCompleteSnapshots,
  selectRecentRegularPolls,
  sumDisplayBlocTotals,
} from '../lib/pollChartData'
import type { PartyBloc } from '../lib/supabase'
import './ElectionsPollsPage.css'

const WIKI_SOURCE =
  'https://en.wikipedia.org/wiki/Opinion_polling_for_the_2026_Israeli_legislative_election'

const LAST_N_POLLS = 5
const TREND_POLLS = 30

export function ElectionsPollsPage() {
  const { polls, loading, error } = usePolls(120)

  const partyBlocs = useMemo(() => {
    const map = new Map<number, PartyBloc | null>()
    for (const poll of polls) {
      for (const result of poll.results) {
        if (!map.has(result.partyId)) {
          map.set(result.partyId, result.bloc)
        }
      }
    }
    return map
  }, [polls])

  const regularPollCount = useMemo(
    () => selectRecentRegularPolls(polls, polls.length).length,
    [polls],
  )

  const pollCountForAverage = Math.min(LAST_N_POLLS, regularPollCount)

  const lastAverage = useMemo(
    () => computeLastNAverage(polls, LAST_N_POLLS, partyBlocs),
    [polls, partyBlocs],
  )

  const lastPollsForAverage = useMemo(
    () => selectRecentRegularPolls(polls, LAST_N_POLLS),
    [polls],
  )

  const blocTotals = useMemo(() => sumDisplayBlocTotals(lastAverage), [lastAverage])

  const snapshots = useMemo(
    () => buildPollSnapshots(polls, partyBlocs),
    [polls, partyBlocs],
  )

  const recentSnapshots = useMemo(
    () => selectRecentCompleteSnapshots(snapshots, TREND_POLLS),
    [snapshots],
  )

  return (
    <SiteLayout>
      <main className="polls-page">
        <section className="polls-page__hero">
          <div className="container polls-page__inner">
            <p className="polls-page__eyebrow">
              <Link to="/elections">בחירות 2026</Link> / סקרי מנדטים
            </p>
            <h1 className="polls-page__title">סקרי מנדטים לבחירות 2026</h1>
            <p className="polls-page__subtitle">
              ממוצע סקרי המנדטים והמגמות שלהם לקראת הבחירות
            </p>
          </div>
        </section>

        {loading && (
          <section className="polls-page__section">
            <div className="container">
              <p className="polls-empty">טוען נתוני סקרים…</p>
            </div>
          </section>
        )}

        {error && (
          <section className="polls-page__section">
            <div className="container">
              <p className="polls-error">{error}</p>
            </div>
          </section>
        )}

        {!loading && !error && lastAverage.length > 0 && (
          <>
            <section className="polls-page__section">
              <div className="container polls-page__inner">
                <LastPollsBarChart
                  parties={lastAverage}
                  pollCount={pollCountForAverage}
                  sourcePolls={lastPollsForAverage}
                />
                <BlocDistributionBar totals={blocTotals} />
              </div>
            </section>

            {recentSnapshots.length > 0 && (
              <section className="polls-page__section polls-page__section--chart">
                <div className="container polls-page__inner">
                  <BlocTrendChart snapshots={recentSnapshots} />
                </div>
              </section>
            )}
          </>
        )}

        {!loading && !error && lastAverage.length === 0 && (
          <section className="polls-page__section">
            <div className="container">
              <p className="polls-empty">אין סקרים זמינים עדיין</p>
            </div>
          </section>
        )}

        <section className="polls-page__provenance">
          <div className="container">
            <p className="polls-provenance">
              מבוסס על נתוני{' '}
              <a href={WIKI_SOURCE} target="_blank" rel="noopener noreferrer">
                ויקיפדיה
              </a>{' '}
              (CC BY-SA 4.0). ממוצעים מחושבים על תחזיות מנדטים — לא על אחוזי הצבעה
              גולמיים — ולכן הסכום אינו בהכרח 120.
            </p>
          </div>
        </section>
      </main>
    </SiteLayout>
  )
}

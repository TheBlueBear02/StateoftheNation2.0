import { useEffect, useMemo, useState } from 'react'
import { SiteLayout } from '../components/SiteLayout'
import { PageBreadcrumb } from '../components/PageBreadcrumb'
import { BlocDistributionBar } from '../components/polls/BlocDistributionBar'
import { BlocTrendChart } from '../components/polls/BlocTrendChart'
import {
  LAST_N_POLL_OPTIONS,
  LastPollsBarChart,
} from '../components/polls/LastPollsBarChart'
import { PartyTrendChart } from '../components/polls/PartyTrendChart'
import { usePolls } from '../hooks/usePolls'
import {
  buildPollSnapshots,
  computeLastNAverage,
  computePollPartySeats,
  selectRecentCompleteSnapshots,
  selectRecentRegularPolls,
  sumDisplayBlocTotals,
} from '../lib/pollChartData'
import type { PartyBloc } from '../lib/supabase'
import './ElectionsPollsPage.css'

const WIKI_SOURCE =
  'https://en.wikipedia.org/wiki/Opinion_polling_for_the_2026_Israeli_legislative_election'

const DEFAULT_LAST_N = 5
const TREND_POLLS = 30

export function ElectionsPollsPage() {
  const { polls, loading, error } = usePolls(120)
  const [lastN, setLastN] = useState(DEFAULT_LAST_N)
  const [selectedPollId, setSelectedPollId] = useState<number | null>(null)

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

  const lastNOptions = useMemo(() => {
    const available = LAST_N_POLL_OPTIONS.filter((n) => n <= regularPollCount)
    if (available.length > 0) {
      return available
    }
    return regularPollCount > 0 ? [regularPollCount] : [...LAST_N_POLL_OPTIONS]
  }, [regularPollCount])

  const effectiveLastN = lastNOptions.includes(lastN)
    ? lastN
    : (lastNOptions[0] ?? DEFAULT_LAST_N)

  const pollCountForAverage = Math.min(effectiveLastN, regularPollCount)

  const lastPollsForAverage = useMemo(
    () => selectRecentRegularPolls(polls, effectiveLastN),
    [polls, effectiveLastN],
  )

  const selectedPoll = useMemo(
    () => lastPollsForAverage.find((poll) => poll.id === selectedPollId) ?? null,
    [lastPollsForAverage, selectedPollId],
  )

  useEffect(() => {
    if (
      selectedPollId !== null &&
      !lastPollsForAverage.some((poll) => poll.id === selectedPollId)
    ) {
      setSelectedPollId(null)
    }
  }, [lastPollsForAverage, selectedPollId])

  const displayedParties = useMemo(() => {
    if (selectedPoll) {
      return computePollPartySeats(selectedPoll, partyBlocs)
    }

    return computeLastNAverage(polls, effectiveLastN, partyBlocs)
  }, [selectedPoll, polls, effectiveLastN, partyBlocs])

  const blocTotals = useMemo(
    () => sumDisplayBlocTotals(displayedParties),
    [displayedParties],
  )

  const snapshots = useMemo(
    () => buildPollSnapshots(polls, partyBlocs),
    [polls, partyBlocs],
  )

  const recentSnapshots = useMemo(
    () => selectRecentCompleteSnapshots(snapshots, TREND_POLLS),
    [snapshots],
  )

  const handleLastNChange = (n: number) => {
    setLastN(n)
    setSelectedPollId(null)
  }

  const handlePollSelect = (pollId: number) => {
    setSelectedPollId((current) => (current === pollId ? null : pollId))
  }

  return (
    <SiteLayout>
      <main className="polls-page">
        <section className="polls-page__hero">
          <div className="container polls-page__inner">
            <PageBreadcrumb
              items={[
                { label: 'בחירות 2026', to: '/elections' },
                { label: 'סקרי מנדטים' },
              ]}
            />
            <h1 className="polls-page__title">סקרי מנדטים לבחירות 2026</h1>

            {loading && <p className="polls-empty">טוען נתוני סקרים…</p>}
            {error && <p className="polls-error">{error}</p>}

            {!loading && !error && displayedParties.length > 0 && (
              <div className="polls-top-charts">
                <LastPollsBarChart
                  parties={displayedParties}
                  pollCount={pollCountForAverage}
                  lastN={effectiveLastN}
                  lastNOptions={lastNOptions}
                  onLastNChange={handleLastNChange}
                  sourcePolls={lastPollsForAverage}
                  selectedPoll={selectedPoll}
                  selectedPollId={selectedPollId}
                  onPollSelect={handlePollSelect}
                />
                <BlocDistributionBar
                  totals={blocTotals}
                  selectedPoll={selectedPoll}
                />
              </div>
            )}

            {!loading && !error && displayedParties.length === 0 && (
              <p className="polls-empty">אין סקרים זמינים עדיין</p>
            )}
          </div>
        </section>

        {!loading && !error && polls.length > 0 && (
          <section className="polls-page__section polls-page__section--chart">
            <div className="container polls-page__inner">
              <PartyTrendChart polls={polls} />
            </div>
          </section>
        )}

        {!loading && !error && recentSnapshots.length > 0 && (
          <section className="polls-page__section polls-page__section--chart">
            <div className="container polls-page__inner">
              <BlocTrendChart snapshots={snapshots} />
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

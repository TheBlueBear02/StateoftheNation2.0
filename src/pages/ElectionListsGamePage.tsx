import { useMemo, useState } from 'react'
import { SiteLayout } from '../components/SiteLayout'
import { PageBreadcrumb } from '../components/PageBreadcrumb'
import { ListFitReport } from '../components/elections/lists/ListFitReport'
import { ListPartyPicker } from '../components/elections/lists/ListPartyPicker'
import { ListRatingStep } from '../components/elections/lists/ListRatingStep'
import { useElectionCandidates } from '../hooks/useElectionCandidates'
import { useElectionParties } from '../hooks/useElectionParties'
import { usePolls } from '../hooks/usePolls'
import {
  computeFitScore,
  countRatings,
  realisticSeatBand,
  type CandidateRating,
} from '../lib/listFitScore'
import { computePartyLastNTrend } from '../lib/pollChartData'
import type { ElectionParty } from '../lib/supabase'
import './ElectionListsGamePage.css'

type GameStep = 'pick' | 'rate' | 'report'

const TREND_POLL_COUNT = 5
const POLL_FETCH_LIMIT = 30

export function ElectionListsGamePage() {
  const { parties, loading: partiesLoading, error: partiesError } =
    useElectionParties()
  const { polls } = usePolls(POLL_FETCH_LIMIT)

  const [step, setStep] = useState<GameStep>('pick')
  const [selectedParty, setSelectedParty] = useState<ElectionParty | null>(null)
  const [ratings, setRatings] = useState<Map<number, CandidateRating>>(
    () => new Map(),
  )

  const {
    candidates,
    loading: candidatesLoading,
    error: candidatesError,
  } = useElectionCandidates(selectedParty?.id ?? null)

  const selectedTrend = useMemo(() => {
    if (!selectedParty) {
      return { seatsAvg: null as number | null, pollCount: 0 }
    }
    const trend = computePartyLastNTrend(
      polls,
      selectedParty.id,
      TREND_POLL_COUNT,
    )
    return {
      seatsAvg: trend.points.length > 0 ? trend.seatsAvg : null,
      pollCount: trend.pollCount,
    }
  }, [polls, selectedParty])

  const band = useMemo(
    () => realisticSeatBand(selectedTrend.seatsAvg, candidates.length),
    [selectedTrend.seatsAvg, candidates.length],
  )

  const score = useMemo(() => {
    if (candidates.length === 0 || ratings.size !== candidates.length) {
      return null
    }
    return computeFitScore(
      candidates.map((candidate) => ({
        listPosition: candidate.listPosition,
        rating: ratings.get(candidate.id)!,
      })),
    )
  }, [candidates, ratings])

  const counts = useMemo(() => countRatings(ratings), [ratings])

  const resetToPick = () => {
    setStep('pick')
    setSelectedParty(null)
    setRatings(new Map())
  }

  const handleSelectParty = (party: ElectionParty) => {
    setSelectedParty(party)
    setRatings(new Map())
    setStep('rate')
  }

  const handleRate = (candidateId: number, rating: CandidateRating) => {
    setRatings((prev) => {
      const next = new Map(prev)
      next.set(candidateId, rating)
      return next
    })
  }

  const handleSubmit = () => {
    setStep('report')
  }

  const partyName = selectedParty?.shortName ?? selectedParty?.name ?? 'מפלגה'
  const error = partiesError ?? candidatesError

  return (
    <SiteLayout className="lists-game-page">
      <main className="lists-game-page__main">
        <div className="lists-game-page__inner container">
          <header className="lists-game-page__header">
            <PageBreadcrumb
              items={[
                { label: 'בחירות 2026', to: '/elections' },
                {
                  label: 'משחק הרשימות',
                  to: '/elections/lists',
                  onClick: (event) => {
                    if (step !== 'pick') {
                      event.preventDefault()
                      resetToPick()
                    }
                  },
                },
                ...(selectedParty && step !== 'pick'
                  ? [{ label: partyName }]
                  : []),
              ]}
            />
            <h1 className="visually-hidden">משחק הרשימות</h1>
          </header>

          {error ? (
            <p className="lists-game__error" role="alert">
              לא ניתן לטעון את נתוני הבחירות
            </p>
          ) : null}

          {step === 'pick' && !error ? (
            <section
              className="lists-game-section"
              aria-labelledby="lists-pick-title"
            >
              <h2 id="lists-pick-title" className="lists-game-section__title">
                בחרו מפלגה
              </h2>
              <ListPartyPicker
                parties={parties}
                loading={partiesLoading}
                onSelect={handleSelectParty}
              />
            </section>
          ) : null}

          {step === 'rate' && selectedParty && !error ? (
            <section
              className="lists-game-section"
              aria-label={`דרגו את רשימת ${partyName}`}
            >
              <ListRatingStep
                candidates={candidates}
                ratings={ratings}
                band={band}
                loading={candidatesLoading}
                partyName={partyName}
                onRate={handleRate}
                onSubmit={handleSubmit}
                onBack={resetToPick}
              />
            </section>
          ) : null}

          {step === 'report' &&
          selectedParty &&
          score !== null &&
          !error ? (
            <section
              className="lists-game-section"
              aria-labelledby="lists-report-title"
            >
              <h2 id="lists-report-title" className="visually-hidden">
                דוח התאמה
              </h2>
              <ListFitReport
                party={selectedParty}
                candidates={candidates}
                ratings={ratings}
                score={score}
                counts={counts}
                onRestart={resetToPick}
              />
            </section>
          ) : null}
        </div>
      </main>
    </SiteLayout>
  )
}

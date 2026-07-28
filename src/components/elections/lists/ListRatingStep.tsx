import { useEffect, useMemo, useRef, useState } from 'react'
import type { ElectionCandidate } from '../../../hooks/useElectionCandidates'
import {
  isInRealisticBand,
  type CandidateRating,
  type RealisticSeatBand,
} from '../../../lib/listFitScore'
import { CandidateRateCard } from './CandidateRateCard'

type ListRatingStepProps = {
  candidates: ElectionCandidate[]
  ratings: Map<number, CandidateRating>
  band: RealisticSeatBand | null
  loading: boolean
  partyName: string
  onRate: (candidateId: number, rating: CandidateRating) => void
  onSubmit: () => void
  onBack: () => void
}

const FLY_OUT_MS = 320

const RATING_ACTIONS: {
  value: CandidateRating
  label: string
}[] = [
  { value: 'green', label: 'רוצה לראות בכנסת' },
  { value: 'orange', label: 'לא יודע / לא אכפת' },
  { value: 'red', label: 'לא רוצה לראות בכנסת' },
]

function flyDirectionForRating(
  rating: CandidateRating,
): 'left' | 'right' | 'up' {
  if (rating === 'green') return 'right'
  if (rating === 'red') return 'left'
  return 'up'
}

export function ListRatingStep({
  candidates,
  ratings,
  band,
  loading,
  partyName,
  onRate,
  onSubmit,
  onBack,
}: ListRatingStepProps) {
  const [flyOut, setFlyOut] = useState<'left' | 'right' | 'up' | null>(null)
  const [exitingId, setExitingId] = useState<number | null>(null)
  const [cardKey, setCardKey] = useState(0)
  const flyTimeoutRef = useRef<number | null>(null)

  const ratedCount = ratings.size
  const total = candidates.length
  const partyId = candidates[0]?.partyId ?? null

  const nextUnrated =
    candidates.find((candidate) => !ratings.has(candidate.id)) ?? null
  const current =
    (exitingId !== null
      ? candidates.find((candidate) => candidate.id === exitingId)
      : nextUnrated) ?? null

  const upcomingImageUrls = useMemo(() => {
    const remaining = candidates.filter(
      (candidate) => !ratings.has(candidate.id),
    )

    // Warm the current face plus the next few so the following card is ready.
    return remaining
      .slice(0, 4)
      .map((candidate) => candidate.imageUrl)
      .filter((url): url is string => Boolean(url))
  }, [candidates, ratings])

  useEffect(() => {
    if (flyTimeoutRef.current !== null) {
      window.clearTimeout(flyTimeoutRef.current)
      flyTimeoutRef.current = null
    }
    setFlyOut(null)
    setExitingId(null)
    setCardKey((key) => key + 1)
  }, [partyId])

  useEffect(() => {
    return () => {
      if (flyTimeoutRef.current !== null) {
        window.clearTimeout(flyTimeoutRef.current)
      }
    }
  }, [])

  useEffect(() => {
    for (const url of upcomingImageUrls) {
      const image = new Image()
      image.decoding = 'async'
      image.src = url
    }
  }, [upcomingImageUrls])

  const commitRating = (rating: CandidateRating) => {
    if (!current || flyOut !== null) return

    const isLast = candidates.every(
      (candidate) =>
        candidate.id === current.id || ratings.has(candidate.id),
    )

    setExitingId(current.id)
    setFlyOut(flyDirectionForRating(rating))
    onRate(current.id, rating)

    flyTimeoutRef.current = window.setTimeout(() => {
      flyTimeoutRef.current = null
      if (isLast) {
        onSubmit()
        return
      }
      setFlyOut(null)
      setExitingId(null)
      setCardKey((key) => key + 1)
    }, FLY_OUT_MS)
  }

  if (loading) {
    return (
      <div className="lists-swipe" aria-busy="true">
        <p className="lists-game__status">טוען רשימת מועמדים…</p>
        <div className="lists-swipe__deck" aria-hidden="true">
          <div className="lists-swipe-card lists-swipe-card--skeleton" />
        </div>
      </div>
    )
  }

  if (candidates.length === 0) {
    return (
      <div className="lists-swipe">
        <p className="lists-game__empty">
          לרשימת {partyName} עדיין אין מועמדים במערכת.
        </p>
        <button type="button" className="lists-game__secondary" onClick={onBack}>
          חזרה לבחירת מפלגה
        </button>
      </div>
    )
  }

  if (!current) {
    return (
      <div className="lists-swipe">
        <p className="lists-game__status">מכינים את דוח ההתאמה…</p>
      </div>
    )
  }

  return (
    <div className="lists-swipe">
      <div className="lists-swipe__legend" role="note">
        <p className="lists-swipe__gesture-hint">
          רוצים לראות את המועמד בכנסת? החליקו ימינה. לא רוצים? החליקו שמאלה,
          לא בטוחים? החליקו למעלה. או העזרו בכפתורים
        </p>
      </div>

      <div className="lists-swipe__deck">
        <CandidateRateCard
          key={`${current.id}-${cardKey}`}
          candidate={current}
          inBand={isInRealisticBand(current.listPosition, band)}
          flyOut={flyOut}
          disabled={flyOut !== null}
          ratedCount={Math.min(ratedCount + (flyOut ? 1 : 0), total)}
          totalCount={total}
          onSwipe={commitRating}
        />
      </div>

      <div
        className="lists-swipe__actions"
        role="group"
        aria-label={`דירוג עבור ${current.fullName}`}
      >
        {RATING_ACTIONS.map((action) => (
          <button
            key={action.value}
            type="button"
            className={`lists-swipe-action lists-swipe-action--${action.value}`}
            aria-label={action.label}
            title={action.label}
            disabled={flyOut !== null}
            onClick={() => commitRating(action.value)}
          >
            <span className="lists-swipe-action__caption">{action.label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import type { ElectionCandidate } from '../../hooks/useElectionCandidates'
import { getInitials, tintColor } from '../../lib/hemicycle'

const INITIAL_VISIBLE_COUNT = 15

type CandidateListProps = {
  candidates: ElectionCandidate[]
  partyColor: string | null
  loading: boolean
}

function CandidateListSkeleton() {
  return (
    <div className="candidate-list__grid" aria-hidden="true">
      {Array.from({ length: 6 }, (_, index) => (
        <div key={index} className="candidate-card candidate-card--skeleton">
          <span className="candidate-card__position" />
          <span className="candidate-card__photo" />
          <span className="candidate-card__body">
            <span className="candidate-card__line candidate-card__line--title" />
            <span className="candidate-card__line" />
            <span className="candidate-card__line candidate-card__line--short" />
          </span>
        </div>
      ))}
    </div>
  )
}

export function CandidateList({ candidates, partyColor, loading }: CandidateListProps) {
  const [expanded, setExpanded] = useState(false)
  const partyId = candidates[0]?.partyId ?? null
  const accentColor = partyColor ?? '#4890fd'
  const style = {
    '--party-color': accentColor,
    '--party-soft': tintColor(accentColor, 0.18),
  } as CSSProperties

  useEffect(() => {
    setExpanded(false)
  }, [partyId])

  const visibleCandidates = useMemo(
    () => (expanded ? candidates : candidates.slice(0, INITIAL_VISIBLE_COUNT)),
    [candidates, expanded],
  )
  const hiddenCount = Math.max(candidates.length - INITIAL_VISIBLE_COUNT, 0)

  return (
    <section
      className="party-detail-card candidate-list"
      style={style}
      aria-labelledby="candidate-list-title"
    >
      <div className="party-detail-card__header">
        <p className="party-detail-card__eyebrow">הרשימה</p>
        <h2 id="candidate-list-title" className="party-detail-card__title">
          מועמדים לפי מיקום
        </h2>
      </div>

      {loading ? <CandidateListSkeleton /> : null}

      {!loading && candidates.length === 0 ? (
        <p className="candidate-list__empty">
          רשימת המועמדים עדיין לא פורסמה או לא עברה את צינור העיבוד.
        </p>
      ) : null}

      {!loading && candidates.length > 0 ? (
        <>
          <ol className="candidate-list__grid">
            {visibleCandidates.map((candidate) => (
              <li key={candidate.id} className="candidate-card">
                <span className="candidate-card__position">
                  {candidate.listPosition}
                </span>

                {candidate.imageUrl ? (
                  <img
                    className="candidate-card__photo"
                    src={candidate.imageUrl}
                    alt={candidate.fullName}
                    loading="lazy"
                  />
                ) : (
                  <span className="candidate-card__photo candidate-card__photo--initials">
                    {getInitials(candidate.fullName)}
                  </span>
                )}

                <span className="candidate-card__body">
                  <span className="candidate-card__name">{candidate.fullName}</span>
                  <span className="candidate-card__city">
                    {candidate.city ?? 'עיר מגורים לא פורסמה'}
                  </span>
                  {candidate.isNewMk ? (
                    <span className="candidate-card__tag">חדש/ה לכנסת</span>
                  ) : null}
                  {candidate.description ? (
                    <span className="candidate-card__description">
                      {candidate.description}
                    </span>
                  ) : null}
                </span>
              </li>
            ))}
          </ol>

          {hiddenCount > 0 ? (
            <button
              type="button"
              className="candidate-list__toggle"
              onClick={() => setExpanded((current) => !current)}
            >
              {expanded ? 'הצג פחות' : `ראה עוד ${hiddenCount} מועמדים`}
            </button>
          ) : null}
        </>
      ) : null}
    </section>
  )
}

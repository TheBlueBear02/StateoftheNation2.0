'use client'

import {
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import type { ElectionCandidate } from '../../../hooks/useElectionCandidates'
import { getInitials } from '../../../lib/hemicycle'
import { formatTenureYears } from '../../../lib/knessetTenure'
import type { CandidateRating } from '../../../lib/listFitScore'

type CandidateRateCardProps = {
  candidate: ElectionCandidate
  inBand: boolean
  flyOut: 'left' | 'right' | 'up' | null
  disabled?: boolean
  onSwipe: (rating: CandidateRating) => void
}

const SWIPE_THRESHOLD = 100
const DRAG_MAX = 180

const RATING_ACTIONS: {
  value: CandidateRating
  label: string
  icon: string
}[] = [
  { value: 'green', label: 'רוצה לראות בכנסת', icon: '♥' },
  { value: 'orange', label: 'לא יודע / לא אכפת', icon: '?' },
  { value: 'red', label: 'לא רוצה לראות בכנסת', icon: '✕' },
]

function ageFromBirthDate(birthDate: string | null): number | null {
  if (!birthDate) return null

  const [year, month, day] = birthDate.slice(0, 10).split('-').map(Number)
  if (!year || !month || !day) return null

  const today = new Date()
  let age = today.getFullYear() - year
  const currentMonth = today.getMonth() + 1
  const currentDay = today.getDate()

  if (currentMonth < month || (currentMonth === month && currentDay < day)) {
    age -= 1
  }

  return age >= 0 && age < 130 ? age : null
}

function buildMetaChips(candidate: ElectionCandidate): string[] {
  const chips: string[] = []

  if (candidate.city) chips.push(candidate.city)

  if (candidate.isNewMk) {
    chips.push('חדש/ה לכנסת')
  } else if (candidate.totalYearsInKnesset > 0) {
    chips.push(`${formatTenureYears(candidate.totalYearsInKnesset)} בכנסת`)
  }

  return chips
}

export function CandidateRateCard({
  candidate,
  inBand,
  flyOut,
  disabled = false,
  onSwipe,
}: CandidateRateCardProps) {
  const pointerIdRef = useRef<number | null>(null)
  const startRef = useRef({ x: 0, y: 0 })
  const [drag, setDrag] = useState({ x: 0, y: 0 })
  const [dragging, setDragging] = useState(false)

  const metaChips = buildMetaChips(candidate)
  const age = ageFromBirthDate(candidate.birthDate)
  const dragDistance = Math.hypot(drag.x, drag.y)
  const previewRating: CandidateRating | null =
    flyOut === 'right' || (!flyOut && drag.x > 48)
      ? 'green'
      : flyOut === 'left' || (!flyOut && drag.x < -48)
        ? 'red'
        : flyOut === 'up' || (!flyOut && drag.y < -48)
          ? 'orange'
          : null

  const rotation = flyOut
    ? flyOut === 'right'
      ? 18
      : flyOut === 'left'
        ? -18
        : 0
    : Math.max(-18, Math.min(18, drag.x / 14))

  const translate = flyOut
    ? flyOut === 'right'
      ? 'translate(140%, -8%) rotate(18deg)'
      : flyOut === 'left'
        ? 'translate(-140%, -8%) rotate(-18deg)'
        : 'translate(0, -140%) rotate(0deg)'
    : `translate(${drag.x}px, ${drag.y}px) rotate(${rotation}deg)`

  const resetDrag = () => {
    pointerIdRef.current = null
    setDragging(false)
    setDrag({ x: 0, y: 0 })
  }

  const finishSwipe = (rating: CandidateRating) => {
    resetDrag()
    onSwipe(rating)
  }

  const handlePointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    if (disabled || flyOut) return
    if (event.button !== 0) return

    pointerIdRef.current = event.pointerId
    startRef.current = { x: event.clientX, y: event.clientY }
    setDragging(true)
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const handlePointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    if (pointerIdRef.current !== event.pointerId || disabled || flyOut) return

    const rawX = event.clientX - startRef.current.x
    const rawY = event.clientY - startRef.current.y
    setDrag({
      x: Math.max(-DRAG_MAX, Math.min(DRAG_MAX, rawX)),
      y: Math.max(-DRAG_MAX, Math.min(DRAG_MAX, rawY)),
    })
  }

  const handlePointerUp = (event: ReactPointerEvent<HTMLElement>) => {
    if (pointerIdRef.current !== event.pointerId) return

    const { x, y } = drag
    if (x > SWIPE_THRESHOLD) {
      finishSwipe('green')
      return
    }
    if (x < -SWIPE_THRESHOLD) {
      finishSwipe('red')
      return
    }
    if (y < -SWIPE_THRESHOLD) {
      finishSwipe('orange')
      return
    }

    resetDrag()
  }

  const cardClassName = [
    'lists-swipe-card',
    inBand && !previewRating ? 'lists-swipe-card--in-band' : '',
    previewRating ? `lists-swipe-card--choice-${previewRating}` : '',
    dragging ? 'lists-swipe-card--dragging' : '',
    flyOut ? `lists-swipe-card--fly-${flyOut}` : '',
  ]
    .filter(Boolean)
    .join(' ')

  const choiceStrength =
    previewRating && !flyOut
      ? Math.min(1, dragDistance / SWIPE_THRESHOLD)
      : previewRating
        ? 1
        : 0

  return (
    <article
      className={cardClassName}
      style={
        {
          transform: translate,
          '--choice-strength': String(choiceStrength),
        } as CSSProperties
      }
      aria-label={`${candidate.listPosition}. ${candidate.fullName}`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={resetDrag}
    >
      <div className="lists-swipe-card__body">
        <div className="lists-swipe-card__media">
          {candidate.imageUrl ? (
            <img
              className="lists-swipe-card__photo"
              src={candidate.imageUrl}
              alt=""
              draggable={false}
            />
          ) : (
            <span className="lists-swipe-card__initials" aria-hidden="true">
              {getInitials(candidate.fullName)}
            </span>
          )}
          <span className="lists-swipe-card__gradient" aria-hidden="true" />
        </div>

        <span className="lists-swipe-card__position">
          מקום {candidate.listPosition}
        </span>

        <div className="lists-swipe-card__overlay">
          {inBand ? (
            <span className="lists-swipe-card__band">בטווח המנדטים הריאלי</span>
          ) : null}
          <div className="lists-swipe-card__meta">
            <div className="lists-swipe-card__heading">
              <h3 className="lists-swipe-card__name">{candidate.fullName}</h3>
              {age !== null ? (
                <span className="lists-swipe-card__age">{age}</span>
              ) : null}
            </div>
            {metaChips.length > 0 ? (
              <ul className="lists-swipe-card__chips">
                {metaChips.map((chip) => (
                  <li key={chip}>{chip}</li>
                ))}
              </ul>
            ) : null}
            {candidate.description || candidate.wikipediaUrl ? (
              <div className="lists-swipe-card__description">
                <p className="lists-swipe-card__description-text">
                  {candidate.description}
                  {candidate.wikipediaUrl ? (
                    <>
                      {candidate.description ? ' ' : null}
                      <a
                        className="lists-swipe-card__wiki"
                        href={candidate.wikipediaUrl}
                        target="_blank"
                        rel="noreferrer"
                        onPointerDown={(event) => event.stopPropagation()}
                        onClick={(event) => event.stopPropagation()}
                      >
                        קרא עוד
                      </a>
                    </>
                  ) : null}
                </p>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div
        className="lists-swipe-card__actions"
        role="group"
        aria-label={`דירוג עבור ${candidate.fullName}`}
      >
        {RATING_ACTIONS.map((action) => (
          <button
            key={action.value}
            type="button"
            className={`lists-swipe-action lists-swipe-action--${action.value}`}
            aria-label={action.label}
            title={action.label}
            disabled={disabled || flyOut !== null}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() => onSwipe(action.value)}
          >
            <span className="lists-swipe-action__icon" aria-hidden="true">
              {action.icon}
            </span>
          </button>
        ))}
      </div>
    </article>
  )
}

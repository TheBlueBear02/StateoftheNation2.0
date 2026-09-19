'use client'

import { useEffect, useId, useRef, useState, type CSSProperties } from 'react'
import { useElectionCandidates } from '../../../hooks/useElectionCandidates'
import { getInitials } from '../../../lib/hemicycle'
import type { DreamOffice } from '../../../lib/dreamGovernmentOffices'
import type { ElectionParty } from '../../../lib/supabase'
import type { ElectionCandidate } from '../../../hooks/useElectionCandidates'
import type { DreamOfficeSelection } from './DreamOfficeSquare'

type DreamOfficePickerModalProps = {
  office: DreamOffice
  parties: ElectionParty[]
  partiesLoading: boolean
  onSelect: (selection: DreamOfficeSelection) => void
  onClose: () => void
}

type PickerStep = 'party' | 'person'

export function DreamOfficePickerModal({
  office,
  parties,
  partiesLoading,
  onSelect,
  onClose,
}: DreamOfficePickerModalProps) {
  const titleId = useId()
  const dialogRef = useRef<HTMLDivElement>(null)
  const [step, setStep] = useState<PickerStep>('party')
  const [selectedParty, setSelectedParty] = useState<ElectionParty | null>(null)

  const {
    candidates,
    loading: candidatesLoading,
    error: candidatesError,
  } = useElectionCandidates(selectedParty?.id ?? null)

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    dialogRef.current?.focus()

    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [onClose])

  const handleSelectParty = (party: ElectionParty) => {
    setSelectedParty(party)
    setStep('person')
  }

  const handleBack = () => {
    setStep('party')
    setSelectedParty(null)
  }

  const handleSelectPerson = (candidate: ElectionCandidate) => {
    if (!selectedParty) return
    onSelect({ candidate, party: selectedParty })
  }

  const partyName = selectedParty?.shortName ?? selectedParty?.name ?? 'מפלגה'

  return (
    <div className="dream-modal" role="presentation">
      <button
        type="button"
        className="dream-modal__backdrop"
        aria-label="סגור"
        onClick={onClose}
      />
      <div
        ref={dialogRef}
        className="dream-modal__dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <header className="dream-modal__header">
          <div className="dream-modal__heading">
            {step === 'person' ? (
              <button
                type="button"
                className="dream-modal__back"
                onClick={handleBack}
              >
                → חזרה למפלגות
              </button>
            ) : null}
            <h2 id={titleId} className="dream-modal__title">
              {step === 'party'
                ? `בחרו מפלגה ל${office.label}`
                : `בחרו מועמד/ת מ${partyName}`}
            </h2>
          </div>
          <button
            type="button"
            className="dream-modal__close"
            onClick={onClose}
            aria-label="סגור"
          >
            ×
          </button>
        </header>

        <div className="dream-modal__body">
          {step === 'party' ? (
            <PartyStep
              parties={parties}
              loading={partiesLoading}
              onSelect={handleSelectParty}
            />
          ) : (
            <PersonStep
              candidates={candidates}
              loading={candidatesLoading}
              error={candidatesError}
              onSelect={handleSelectPerson}
            />
          )}
        </div>
      </div>
    </div>
  )
}

function PartyStep({
  parties,
  loading,
  onSelect,
}: {
  parties: ElectionParty[]
  loading: boolean
  onSelect: (party: ElectionParty) => void
}) {
  if (loading) {
    return (
      <div className="dream-modal__party-grid" aria-hidden="true">
        {Array.from({ length: 8 }, (_, index) => (
          <div
            key={index}
            className="dream-modal-party dream-modal-party--skeleton"
          />
        ))}
      </div>
    )
  }

  if (parties.length === 0) {
    return (
      <p className="dream-modal__empty">אין מפלגות מאושרות להצגה כרגע.</p>
    )
  }

  return (
    <ul className="dream-modal__party-grid">
      {parties.map((party) => {
        const hasList = Boolean(party.leader)
        const displayName = party.shortName ?? party.name
        const accentColor = party.color ?? '#4890fd'
        const style = { '--party-color': accentColor } as CSSProperties

        return (
          <li key={party.id}>
            <button
              type="button"
              className={
                hasList
                  ? 'dream-modal-party'
                  : 'dream-modal-party dream-modal-party--disabled'
              }
              style={style}
              disabled={!hasList}
              onClick={() => {
                if (hasList) onSelect(party)
              }}
              aria-label={
                hasList
                  ? `בחר את ${displayName}`
                  : `ל${displayName} עדיין אין רשימת מועמדים`
              }
            >
              <span className="dream-modal-party__media">
                {party.leader?.imageUrl ? (
                  <img
                    src={party.leader.imageUrl}
                    alt=""
                    loading="lazy"
                    className="dream-modal-party__photo"
                  />
                ) : (
                  <span className="dream-modal-party__initials" aria-hidden="true">
                    {getInitials(party.leader?.fullName ?? displayName)}
                  </span>
                )}
                <span className="dream-modal-party__gradient" aria-hidden="true" />
                {party.logoUrl ? (
                  <img
                    src={party.logoUrl}
                    alt=""
                    loading="lazy"
                    className="dream-modal-party__logo"
                  />
                ) : null}
                <span className="dream-modal-party__overlay">
                  <span className="dream-modal-party__name">{displayName}</span>
                </span>
              </span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}

function PersonStep({
  candidates,
  loading,
  error,
  onSelect,
}: {
  candidates: ElectionCandidate[]
  loading: boolean
  error: string | null
  onSelect: (candidate: ElectionCandidate) => void
}) {
  if (error) {
    return (
      <p className="dream-modal__error" role="alert">
        לא ניתן לטעון את רשימת המועמדים
      </p>
    )
  }

  if (loading) {
    return (
      <ul className="dream-modal__person-grid" aria-hidden="true">
        {Array.from({ length: 6 }, (_, index) => (
          <li key={index} className="dream-modal-person dream-modal-person--skeleton" />
        ))}
      </ul>
    )
  }

  if (candidates.length === 0) {
    return (
      <p className="dream-modal__empty">אין מועמדים ברשימה זו עדיין.</p>
    )
  }

  return (
    <ul className="dream-modal__person-grid">
      {candidates.map((candidate) => (
        <li key={candidate.id}>
          <button
            type="button"
            className="dream-modal-person"
            onClick={() => onSelect(candidate)}
            aria-label={`בחר את ${candidate.fullName}`}
          >
            <span className="dream-modal-person__media">
              {candidate.imageUrl ? (
                <img
                  className="dream-modal-person__photo"
                  src={candidate.imageUrl}
                  alt=""
                  loading="lazy"
                />
              ) : (
                <span className="dream-modal-person__initials" aria-hidden="true">
                  {getInitials(candidate.fullName)}
                </span>
              )}
              <span className="dream-modal-person__gradient" aria-hidden="true" />
              <span className="dream-modal-person__position" aria-hidden="true">
                {candidate.listPosition}
              </span>
              <span className="dream-modal-person__overlay">
                <span className="dream-modal-person__name">{candidate.fullName}</span>
              </span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  )
}

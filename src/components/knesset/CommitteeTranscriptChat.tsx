'use client'

import { useEffect, useRef } from 'react'
import type { CommitteeMember } from '../../lib/committeeTypes'
import type { CommitteeSession } from '../../lib/committeeTypes'
import type { CommitteeTranscriptPart } from '../../lib/committeeTypes'
import { initialsFromName } from '../../lib/committeeTableLayout'
import {
  isBareChairHeader,
  resolvePartPersonId,
  speakerHeaderToName,
} from '../../lib/committeeSpeakerMatch'

type CommitteeTranscriptChatProps = {
  parts: CommitteeTranscriptPart[]
  members: CommitteeMember[]
  session: CommitteeSession | null
  committeeName: string | null
  activeOrdinal: number
  playing: boolean
  selectedPersonId: number | null
  disabled?: boolean
  loading?: boolean
  onPlayPause: () => void
  onPrev: () => void
  onNext: () => void
  onJumpToOrdinal: (ordinal: number) => void
  onNextSelectedMemberMessage: () => void
  onClearMemberFilter: () => void
}

function formatChatHeaderTitle(committeeName: string | null): string {
  const name = committeeName?.trim()
  return name || 'תמליל הישיבה'
}

function formatChatHeaderSubtitle(session: CommitteeSession | null): string | null {
  if (!session) {
    return null
  }
  const parts: string[] = []
  if (session.sessionNumber != null) {
    parts.push(`ישיבה ${session.sessionNumber}`)
  }
  if (session.startAt) {
    parts.push(
      new Intl.DateTimeFormat('he-IL', {
        weekday: 'long',
        day: 'numeric',
        month: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }).format(new Date(session.startAt)),
    )
  }
  return parts.length > 0 ? parts.join(' · ') : null
}

function ChatIconPrev() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="committee-chat__icon">
      <path
        fill="currentColor"
        d="M16 6h2v12h-2V6zM6 18l8.5-6L6 6v12z"
      />
    </svg>
  )
}

function ChatIconNext() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="committee-chat__icon">
      <path
        fill="currentColor"
        d="M6 6h2v12H6V6zm3.5 6 8.5 6V6l-8.5 6z"
      />
    </svg>
  )
}

function ChatIconPlay() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="committee-chat__icon">
      <path fill="currentColor" d="M8 5v14l11-7L8 5z" />
    </svg>
  )
}

function ChatIconPause() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="committee-chat__icon">
      <path fill="currentColor" d="M6 5h4v14H6V5zm8 0h4v14h-4V5z" />
    </svg>
  )
}

function isStructuralMetaPart(part: CommitteeTranscriptPart): boolean {
  const header = (part.speakerHeader ?? '').trim()
  if (!header) {
    // Untitled protocol / preamble blocks
    return true
  }
  if (
    header === 'נכחו' ||
    header === 'סדר היום' ||
    header.startsWith('סדר היום') ||
    header.startsWith('חברי ') ||
    header.startsWith('חברות ')
  ) {
    return true
  }
  if (
    /^(מוזמנים|מוזמנות|ייעוץ משפטי|מנהל|מנהלת|רישום|קצרנ|יועץ משפטי|סגן מזכיר)/u.test(
      header,
    )
  ) {
    return true
  }
  // Numbered / lettered agenda headers (א. … / 1. …)
  if (/^[א-ת]\.\s/u.test(header) || /^\d+\.\s/u.test(header)) {
    return true
  }
  return false
}

function isLikelySpeechPart(part: CommitteeTranscriptPart): boolean {
  if (isStructuralMetaPart(part)) {
    return false
  }
  const header = (part.speakerHeader ?? '').trim()
  if (!header) {
    return false
  }
  if (part.personId != null || isBareChairHeader(header)) {
    return true
  }
  return speakerHeaderToName(header) != null
}

/** Attendance, agenda, staff, and all preamble before the first MK speech. */
function isMetaPart(
  part: CommitteeTranscriptPart,
  index: number,
  parts: CommitteeTranscriptPart[],
): boolean {
  if (isStructuralMetaPart(part)) {
    return true
  }
  const firstSpeechIdx = parts.findIndex((candidate) =>
    isLikelySpeechPart(candidate),
  )
  if (firstSpeechIdx === -1) {
    return true
  }
  return index < firstSpeechIdx
}

function metaTitle(part: CommitteeTranscriptPart): string {
  const header = (part.speakerHeader ?? '').trim()
  if (header) {
    return header
  }
  return 'פרוטוקול'
}

function speakerLabel(
  part: CommitteeTranscriptPart,
  members: CommitteeMember[],
): string {
  const personId = resolvePartPersonId(part, members)
  const member = personId != null
    ? members.find((m) => m.personId === personId)
    : null
  if (member?.fullName) {
    return member.fullName
  }
  if (part.fullName) {
    return part.fullName
  }
  if (isBareChairHeader(part.speakerHeader)) {
    return 'יו״ר'
  }
  return (
    speakerHeaderToName(part.speakerHeader) ??
    part.speakerHeader ??
    'דובר/ת לא מזוהה'
  )
}

function speakerFaction(
  part: CommitteeTranscriptPart,
  members: CommitteeMember[],
): string | null {
  const personId = resolvePartPersonId(part, members)
  if (personId == null) {
    return null
  }
  return members.find((m) => m.personId === personId)?.factionName ?? null
}

function speakerImage(
  part: CommitteeTranscriptPart,
  members: CommitteeMember[],
): string | null {
  const personId = resolvePartPersonId(part, members)
  if (personId == null) {
    return part.imageUrl
  }
  return (
    members.find((m) => m.personId === personId)?.imageUrl ?? part.imageUrl
  )
}

export function CommitteeTranscriptChat({
  parts,
  members,
  session,
  committeeName,
  activeOrdinal,
  playing,
  selectedPersonId,
  disabled = false,
  loading = false,
  onPlayPause,
  onPrev,
  onNext,
  onJumpToOrdinal,
  onNextSelectedMemberMessage,
  onClearMemberFilter,
}: CommitteeTranscriptChatProps) {
  const listRef = useRef<HTMLDivElement | null>(null)
  const activeRef = useRef<HTMLElement | null>(null)

  const bindActiveRef = (node: HTMLElement | null) => {
    activeRef.current = node
  }

  const selectedMember =
    selectedPersonId == null
      ? null
      : members.find((m) => m.personId === selectedPersonId) ?? null

  const selectedMessageCount =
    selectedPersonId == null
      ? 0
      : parts.filter(
          (part) => resolvePartPersonId(part, members) === selectedPersonId,
        ).length

  useEffect(() => {
    const node = activeRef.current
    if (!node || !listRef.current) {
      return
    }
    node.scrollIntoView({
      behavior: playing ? 'smooth' : 'smooth',
      block: 'nearest',
    })
  }, [activeOrdinal, playing, selectedPersonId])

  const progress =
    parts.length > 0 ? ((activeOrdinal + 1) / parts.length) * 100 : 0
  const headerSubtitle = formatChatHeaderSubtitle(session)
  const progressLabel =
    parts.length > 0
      ? `${activeOrdinal + 1} / ${parts.length} הודעות`
      : loading
        ? 'טוען תמליל…'
        : 'אין תמליל לישיבה זו'

  return (
    <section
      className="committee-chat"
      aria-label="תמליל הישיבה"
      aria-busy={loading || undefined}
    >
      <header className="committee-chat__header">
        <div className="committee-chat__header-text">
          <div className="committee-chat__header-main">
            <h2 className="committee-chat__title">
              {formatChatHeaderTitle(committeeName)}
            </h2>
            {headerSubtitle ? (
              <p className="committee-chat__session-when">{headerSubtitle}</p>
            ) : null}
          </div>
          <p className="committee-chat__subtitle">{progressLabel}</p>
        </div>
      </header>

      {selectedMember ? (
        <div className="committee-chat__filter">
          <div className="committee-chat__filter-info">
            {selectedMember.imageUrl ? (
              <img
                className="committee-chat__filter-photo"
                src={selectedMember.imageUrl}
                alt=""
              />
            ) : (
              <span className="committee-chat__filter-photo committee-chat__filter-photo--placeholder">
                {initialsFromName(selectedMember.fullName)}
              </span>
            )}
            <span>
              הודעות של {selectedMember.fullName}
              {selectedMessageCount > 0
                ? ` · ${selectedMessageCount}`
                : ' · אין הודעות'}
            </span>
          </div>
          <div className="committee-chat__filter-actions">
            <button
              type="button"
              className="committee-chat__btn committee-chat__btn--small"
              onClick={onNextSelectedMemberMessage}
              disabled={selectedMessageCount === 0}
            >
              להודעה הבאה שלו/ה
            </button>
            <button
              type="button"
              className="committee-chat__btn committee-chat__btn--small"
              onClick={onClearMemberFilter}
              aria-label="נקה סינון חבר כנסת"
            >
              נקה
            </button>
          </div>
        </div>
      ) : null}

      <div className="committee-chat__thread" ref={listRef}>
        {parts.length === 0 ? (
          <p className="committee-chat__empty">
            {loading ? 'טוען הודעות…' : 'אין הודעות להצגה'}
          </p>
        ) : (
          parts.map((part, index) => {
            const personId = resolvePartPersonId(part, members)
            const isActive = part.ordinal === activeOrdinal
            const isSelectedSpeaker =
              selectedPersonId != null && personId === selectedPersonId
            const meta = isMetaPart(part, index, parts)
            const dimmed =
              selectedPersonId != null && !isSelectedSpeaker && !meta
            const name = speakerLabel(part, members)
            const factionName = speakerFaction(part, members)
            const imageUrl = speakerImage(part, members)

            if (meta) {
              const body = part.body.trim()
              const title = metaTitle(part)
              return (
                <div
                  key={part.id}
                  className={[
                    'committee-chat__system',
                    isActive ? 'committee-chat__system--active' : '',
                    dimmed ? 'committee-chat__system--dimmed' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  <button
                    type="button"
                    className="committee-chat__system-btn"
                    onClick={() => onJumpToOrdinal(part.ordinal)}
                    ref={isActive ? bindActiveRef : undefined}
                  >
                    <strong>{title}</strong>
                    {body ? <span>{body}</span> : null}
                  </button>
                </div>
              )
            }

            return (
              <div
                key={part.id}
                className={[
                  'committee-chat__row',
                  isActive ? 'committee-chat__row--active' : '',
                  isSelectedSpeaker ? 'committee-chat__row--selected-speaker' : '',
                  dimmed ? 'committee-chat__row--dimmed' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                <div className="committee-chat__avatar" aria-hidden>
                  {imageUrl ? (
                    <img src={imageUrl} alt="" />
                  ) : (
                    <span>{initialsFromName(name)}</span>
                  )}
                </div>
                <button
                  type="button"
                  className="committee-chat__bubble"
                  onClick={() => onJumpToOrdinal(part.ordinal)}
                  ref={isActive ? bindActiveRef : undefined}
                  aria-current={isActive ? 'true' : undefined}
                >
                  <span className="committee-chat__bubble-meta">
                    <span className="committee-chat__bubble-name">{name}</span>
                    {factionName ? (
                      <span className="committee-chat__bubble-party">
                        {factionName}
                      </span>
                    ) : null}
                  </span>
                  <span className="committee-chat__bubble-body">{part.body}</span>
                </button>
              </div>
            )
          })
        )}
      </div>

      <footer className="committee-chat__footer">
        <div
          className="committee-chat__track"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress)}
        >
          <div
            className="committee-chat__fill"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="committee-chat__controls">
          <button
            type="button"
            className="committee-chat__btn committee-chat__btn--icon"
            onClick={onPrev}
            disabled={disabled || activeOrdinal <= 0}
            aria-label="הודעה קודמת"
            title="הודעה קודמת"
          >
            <ChatIconPrev />
          </button>
          <button
            type="button"
            className="committee-chat__btn committee-chat__btn--primary committee-chat__btn--icon committee-chat__btn--play"
            onClick={onPlayPause}
            disabled={disabled || parts.length === 0}
            aria-label={playing ? 'השהה' : 'נגן'}
            title={playing ? 'השהה' : 'נגן'}
          >
            {playing ? <ChatIconPause /> : <ChatIconPlay />}
          </button>
          <button
            type="button"
            className="committee-chat__btn committee-chat__btn--icon"
            onClick={onNext}
            disabled={disabled || activeOrdinal >= parts.length - 1}
            aria-label="הודעה הבאה"
            title="הודעה הבאה"
          >
            <ChatIconNext />
          </button>
        </div>
      </footer>
    </section>
  )
}

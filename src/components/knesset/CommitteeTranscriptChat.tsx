'use client'

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { CommitteeMember } from '../../lib/committeeTypes'
import type { CommitteeSession } from '../../lib/committeeTypes'
import type { CommitteeTranscriptPart } from '../../lib/committeeTypes'
import { formatCommitteeSessionWhen } from '../../hooks/useCommitteeSessions'
import { initialsFromName } from '../../lib/committeeTableLayout'
import {
  isAgendaSectionHeader,
  isAttendanceProtocolHeader,
  isBareChairHeader,
  isBareCounselHeader,
  isBareManagerHeader,
  normalizeProtocolSectionHeader,
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
  onBack?: () => void
  onPlayPause: () => void
  onPrev: () => void
  onNext: () => void
  onJumpToOrdinal: (ordinal: number) => void
  onClearMemberFilter: () => void
}

function formatChatHeaderTitle(committeeName: string | null): string {
  const name = committeeName?.trim()
  return name || 'תמליל הישיבה'
}

function formatChatHeaderSubtitle(session: CommitteeSession | null): {
  full: string | null
  short: string | null
} {
  if (!session) {
    return { full: null, short: null }
  }

  const when = session.startAt ? formatCommitteeSessionWhen(session) : null
  const protocolPart =
    session.sessionNumber != null
      ? `פרוטוקול ישיבה ${session.sessionNumber}`
      : 'פרוטוקול'

  const parts: string[] = []
  // Desktop RTL: day · time · date appears on the right, before protocol/session.
  if (when) {
    parts.push(when)
  }
  parts.push(protocolPart)

  return {
    full: parts.join(' · '),
    short: when,
  }
}

function ChatIconClose() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="committee-chat__icon">
      <path
        fill="currentColor"
        d="M18.3 5.71 12 12.01 5.7 5.7 4.29 7.11 10.59 13.4 4.29 19.7 5.7 21.11 12 14.81l6.3 6.3 1.41-1.41-6.3-6.3 6.3-6.29z"
      />
    </svg>
  )
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

function ChatIconAi() {
  // Two 4-point sparkles matching the AI mark; white via currentColor.
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="committee-chat__icon">
      <path
        fill="currentColor"
        d="M10.6 3.2c.22 3.05 1.2 5.3 2.95 6.8 1.75 1.5 4 2.35 6.75 2.5-2.75.15-5 1-6.75 2.5-1.75 1.5-2.73 3.75-2.95 6.8-.22-3.05-1.2-5.3-2.95-6.8C5.9 13.5 3.65 12.65.9 12.5c2.75-.15 5-1 6.75-2.5 1.75-1.5 2.73-3.75 2.95-6.8z"
      />
      <path
        fill="currentColor"
        d="M18.55 2.1c.12 1.55.62 2.7 1.5 3.45.88.75 2.03 1.18 3.45 1.25-1.42.07-2.57.5-3.45 1.25-.88.75-1.38 1.9-1.5 3.45-.12-1.55-.62-2.7-1.5-3.45-.88-.75-2.03-1.18-3.45-1.25 1.42-.07 2.57-.5 3.45-1.25.88-.75 1.38-1.9 1.5-3.45z"
      />
    </svg>
  )
}

function ChatIconSearch() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="committee-chat__search-icon"
    >
      <path
        fill="currentColor"
        d="M15.5 14h-.79l-.28-.27A6.47 6.47 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"
      />
    </svg>
  )
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function highlightSearchMatches(text: string, query: string): ReactNode {
  const trimmed = query.trim()
  if (!trimmed) {
    return text
  }
  const pattern = new RegExp(`(${escapeRegExp(trimmed)})`, 'gi')
  const chunks = text.split(pattern)
  if (chunks.length === 1) {
    return text
  }
  return chunks.map((chunk, index) =>
    index % 2 === 1 ? (
      <mark key={`hit-${index}`} className="committee-chat__search-hit">
        {chunk}
      </mark>
    ) : (
      <span key={`txt-${index}`}>{chunk}</span>
    ),
  )
}

function partMatchesSearch(
  part: CommitteeTranscriptPart,
  query: string,
  members: CommitteeMember[],
): boolean {
  const trimmed = query.trim()
  if (!trimmed) {
    return true
  }
  const haystack = [
    part.body,
    part.speakerHeader ?? '',
    speakerLabel(part, members),
    speakerFaction(part, members) ?? '',
  ]
    .join('\n')
    .toLowerCase()
  return haystack.includes(trimmed.toLowerCase())
}

/** Strip bidi marks / wrapping quotes so section labels like "סדר" still match. */
function normalizeSectionHeader(header: string): string {
  return normalizeProtocolSectionHeader(header)
}

function isStructuralMetaPart(part: CommitteeTranscriptPart): boolean {
  const header = (part.speakerHeader ?? '').trim()
  if (!header) {
    // Untitled protocol / preamble blocks
    return true
  }
  if (
    isAttendanceProtocolHeader(header) ||
    isAgendaSectionHeader(header) ||
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
  if (!header || isAgendaSectionHeader(header)) {
    return false
  }
  if (part.personId != null || isBareChairHeader(header)) {
    return true
  }
  return speakerHeaderToName(header) != null
}

/** Attendance, agenda, staff, and all preamble before the first MK speech. */
export function isMetaPart(
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

/** Index of the first real speech bubble; -1 if the transcript is only meta. */
export function getFirstSpeechIndex(
  parts: CommitteeTranscriptPart[],
): number {
  return parts.findIndex((part, index) => !isMetaPart(part, index, parts))
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
  // part.fullName comes from a people join on person_id — ignore it when that
  // person is not on the session roster (false global name matches).
  const linkedIsSeated =
    part.personId != null &&
    members.some((m) => m.personId === part.personId)
  if (linkedIsSeated && part.fullName) {
    return part.fullName
  }
  if (isBareChairHeader(part.speakerHeader)) {
    return 'יו״ר'
  }
  if (isBareCounselHeader(part.speakerHeader)) {
    const counsel = members.find((m) => m.seatRole === 'legal_counsel')
    return counsel?.fullName ?? 'יועמ״ש'
  }
  if (isBareManagerHeader(part.speakerHeader)) {
    const manager = members.find((m) => m.seatRole === 'committee_manager')
    return manager?.fullName ?? 'מנהל/ת'
  }
  return (
    speakerHeaderToName(part.speakerHeader) ??
    part.speakerHeader?.trim() ??
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
  const member = members.find((m) => m.personId === personId)
  if (
    member?.seatRole === 'legal_counsel' ||
    member?.seatRole === 'committee_manager'
  ) {
    return member.roleDesc
  }
  return member?.factionName ?? null
}

function speakerImage(
  part: CommitteeTranscriptPart,
  members: CommitteeMember[],
): string | null {
  const personId = resolvePartPersonId(part, members)
  if (personId == null) {
    return null
  }
  return members.find((m) => m.personId === personId)?.imageUrl ?? null
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
  onBack,
  onPlayPause,
  onPrev,
  onNext,
  onJumpToOrdinal,
  onClearMemberFilter,
}: CommitteeTranscriptChatProps) {
  const listRef = useRef<HTMLDivElement | null>(null)
  const activeRef = useRef<HTMLElement | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [scrollProgress, setScrollProgress] = useState(0)
  const [summaryText, setSummaryText] = useState<string | null>(null)
  const [summaryError, setSummaryError] = useState<string | null>(null)
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [summaryOpen, setSummaryOpen] = useState(false)
  const partsLengthRef = useRef(parts.length)
  partsLengthRef.current = parts.length

  const bindActiveRef = (node: HTMLElement | null) => {
    activeRef.current = node
  }

  const selectedMember =
    selectedPersonId == null
      ? null
      : members.find((m) => m.personId === selectedPersonId) ?? null

  const selectedMemberIndexes =
    selectedPersonId == null
      ? ([] as number[])
      : parts
          .map((part, index) => ({ part, index }))
          .filter(
            ({ part }) =>
              resolvePartPersonId(part, members) === selectedPersonId,
          )
          .map(({ index }) => index)

  const selectedMessageCount = selectedMemberIndexes.length
  const canGoPrev =
    selectedPersonId != null
      ? selectedMemberIndexes.some((index) => index < activeOrdinal)
      : activeOrdinal > 0
  const canGoNext =
    selectedPersonId != null
      ? selectedMemberIndexes.some((index) => index > activeOrdinal)
      : activeOrdinal < parts.length - 1

  const trimmedSearch = searchQuery.trim()
  const searchActive = trimmedSearch.length > 0

  useEffect(() => {
    setSearchQuery('')
    setSummaryText(null)
    setSummaryError(null)
    setSummaryLoading(false)
    setSummaryOpen(false)
  }, [session?.id])

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

  // Sample scroll position once per second (not on every scroll event).
  useEffect(() => {
    const readProgress = () => {
      const el = listRef.current
      if (!el) {
        setScrollProgress(0)
        return
      }
      const maxScroll = el.scrollHeight - el.clientHeight
      if (maxScroll <= 0) {
        setScrollProgress(partsLengthRef.current > 0 ? 100 : 0)
        return
      }
      setScrollProgress(
        Math.min(100, Math.max(0, (el.scrollTop / maxScroll) * 100)),
      )
    }

    readProgress()
    const id = window.setInterval(readProgress, 1000)
    return () => window.clearInterval(id)
  }, [session?.id])

  async function requestSessionSummary() {
    if (session?.id == null || summaryLoading) {
      return
    }
    if (summaryText) {
      setSummaryOpen((prev) => !prev)
      return
    }

    setSummaryLoading(true)
    setSummaryError(null)
    setSummaryOpen(true)
    try {
      const response = await fetch('/api/knesset/committee-session-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: session.id,
          committeeName,
          agenda: session.agenda,
        }),
      })
      const data = (await response.json().catch(() => null)) as {
        ok?: boolean
        summary?: string
        error?: string
      } | null
      if (!response.ok || !data?.ok || !data.summary) {
        throw new Error(data?.error || 'יצירת הסיכום נכשלה')
      }
      setSummaryText(data.summary)
    } catch (error) {
      setSummaryError(
        error instanceof Error ? error.message : 'יצירת הסיכום נכשלה',
      )
    } finally {
      setSummaryLoading(false)
    }
  }

  const headerSubtitle = formatChatHeaderSubtitle(session)
  const progressLabel =
    parts.length > 0
      ? `${activeOrdinal + 1} / ${parts.length}`
      : loading
        ? 'טוען תמליל…'
        : 'אין תמליל לישיבה זו'

  const searchMatchCount = useMemo(() => {
    if (!searchActive) {
      return 0
    }
    return parts.reduce(
      (count, part) =>
        partMatchesSearch(part, trimmedSearch, members) ? count + 1 : count,
      0,
    )
  }, [parts, members, searchActive, trimmedSearch])

  return (
    <section
      className="committee-chat"
      aria-label="תמליל הישיבה"
      aria-busy={loading || undefined}
    >
      <header className="committee-chat__header">
        <div className="committee-chat__header-bar">
          {onBack ? (
            <button
              type="button"
              className="committee-chat__back"
              onClick={onBack}
              aria-label="חזרה לישיבות"
              title="חזרה"
            >
              <svg
                viewBox="0 0 24 24"
                aria-hidden="true"
                className="committee-chat__back-icon"
              >
                <path
                  fill="currentColor"
                  d="M8.59 16.59 13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z"
                />
              </svg>
            </button>
          ) : null}
          <div className="committee-chat__header-text">
            <div className="committee-chat__header-main">
              <div className="committee-chat__title-row">
                <h2 className="committee-chat__title">
                  {formatChatHeaderTitle(committeeName)}
                </h2>
                <p className="committee-chat__subtitle">{progressLabel}</p>
              </div>
              {headerSubtitle.full || headerSubtitle.short ? (
                <p className="committee-chat__session-when">
                  {headerSubtitle.full ? (
                    <span className="committee-chat__session-when-full">
                      {headerSubtitle.full}
                    </span>
                  ) : null}
                  {headerSubtitle.short ? (
                    <span className="committee-chat__session-when-short">
                      {headerSubtitle.short}
                    </span>
                  ) : null}
                </p>
              ) : null}
            </div>
          </div>
        </div>
      </header>

      <div
        className="committee-chat__track"
        role="progressbar"
        aria-label="מיקום בגלילת התמליל"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(scrollProgress)}
      >
        <div
          className="committee-chat__fill"
          style={{ width: `${scrollProgress}%` }}
        />
      </div>

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
              className="committee-chat__btn committee-chat__btn--icon committee-chat__btn--filter-clear"
              onClick={onClearMemberFilter}
              aria-label="נקה סינון"
              title="נקה"
            >
              <ChatIconClose />
            </button>
          </div>
        </div>
      ) : null}

      <div className="committee-chat__body">
        <div className="committee-chat__thread" ref={listRef}>
          {parts.length === 0 ? (
            <p className="committee-chat__empty">
              {loading ? 'טוען הודעות…' : 'אין הודעות להצגה'}
            </p>
          ) : (
            parts.map((part, index) => {
              const meta = isMetaPart(part, index, parts)
              // During play: yellow protocol cards stay visible; only speech
              // messages after the active cursor stay hidden.
              if (playing && !meta && index > activeOrdinal) {
                return null
              }

              const personId = resolvePartPersonId(part, members)
              const isActive = index === activeOrdinal
              const justPopped = playing && isActive && !meta
              const isSelectedSpeaker =
                selectedPersonId != null && personId === selectedPersonId
              const matchesSearch = partMatchesSearch(
                part,
                trimmedSearch,
                members,
              )
              const dimmed =
                (selectedPersonId != null && !isSelectedSpeaker && !meta) ||
                (searchActive && !matchesSearch)
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
                      onClick={() => onJumpToOrdinal(index)}
                      ref={isActive ? bindActiveRef : undefined}
                    >
                      <strong>
                        {highlightSearchMatches(title, trimmedSearch)}
                      </strong>
                      {body ? (
                        <span>
                          {highlightSearchMatches(body, trimmedSearch)}
                        </span>
                      ) : null}
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
                    justPopped ? 'committee-chat__message--pop' : '',
                    isSelectedSpeaker
                      ? 'committee-chat__row--selected-speaker'
                      : '',
                    dimmed ? 'committee-chat__row--dimmed' : '',
                    searchActive && matchesSearch
                      ? 'committee-chat__row--search-match'
                      : '',
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
                    onClick={() => onJumpToOrdinal(index)}
                    ref={isActive ? bindActiveRef : undefined}
                    aria-current={isActive ? 'true' : undefined}
                  >
                    <span className="committee-chat__bubble-meta">
                      <span className="committee-chat__bubble-name">
                        {highlightSearchMatches(name, trimmedSearch)}
                      </span>
                      {factionName ? (
                        <span className="committee-chat__bubble-party">
                          {highlightSearchMatches(factionName, trimmedSearch)}
                        </span>
                      ) : null}
                    </span>
                    <span className="committee-chat__bubble-body">
                      {highlightSearchMatches(part.body, trimmedSearch)}
                    </span>
                  </button>
                </div>
              )
            })
          )}
        </div>

        <footer className="committee-chat__footer">
          {summaryOpen ? (
            <div
              className={[
                'committee-chat__summary',
                summaryError ? 'committee-chat__summary--error' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              role="status"
              aria-live="polite"
            >
              <div className="committee-chat__summary-head">
                <strong>סיכום הישיבה בAI</strong>
                <button
                  type="button"
                  className="committee-chat__summary-close"
                  onClick={() => setSummaryOpen(false)}
                  aria-label="סגור סיכום"
                  title="סגור"
                >
                  <ChatIconClose />
                </button>
              </div>
              {summaryLoading ? (
                <p className="committee-chat__summary-body">מייצר סיכום…</p>
              ) : summaryError ? (
                <p className="committee-chat__summary-body">{summaryError}</p>
              ) : summaryText ? (
                <p className="committee-chat__summary-body">{summaryText}</p>
              ) : null}
            </div>
          ) : null}

          <div className="committee-chat__composer">
            <div className="committee-chat__composer-bar">
              <label className="committee-chat__search">
                <span className="visually-hidden">חיפוש בתמליל</span>
                <ChatIconSearch />
                <input
                  type="search"
                  className="committee-chat__search-input"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="חיפוש בתמליל…"
                  disabled={disabled || parts.length === 0}
                  enterKeyHint="search"
                  autoComplete="off"
                />
                {searchActive ? (
                  <span className="committee-chat__search-count" aria-live="polite">
                    {searchMatchCount}
                  </span>
                ) : null}
              </label>

              <div className="committee-chat__controls">
                <button
                  type="button"
                  className="committee-chat__btn committee-chat__btn--icon"
                  onClick={onPrev}
                  disabled={disabled || !canGoPrev}
                  aria-label={
                    selectedPersonId != null
                      ? 'הודעה קודמת של הדובר/ת שנבחר/ה'
                      : 'הודעה קודמת'
                  }
                  title={
                    selectedPersonId != null
                      ? 'הודעה קודמת של הדובר/ת שנבחר/ה'
                      : 'הודעה קודמת'
                  }
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
                  disabled={disabled || !canGoNext}
                  aria-label={
                    selectedPersonId != null
                      ? 'הודעה הבאה של הדובר/ת שנבחר/ה'
                      : 'הודעה הבאה'
                  }
                  title={
                    selectedPersonId != null
                      ? 'הודעה הבאה של הדובר/ת שנבחר/ה'
                      : 'הודעה הבאה'
                  }
                >
                  <ChatIconNext />
                </button>
              </div>
            </div>

            <button
              type="button"
              className={[
                'committee-chat__ai',
                summaryOpen ? 'committee-chat__ai--active' : '',
                summaryLoading ? 'committee-chat__ai--loading' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={() => {
                void requestSessionSummary()
              }}
              disabled={disabled || parts.length === 0 || summaryLoading}
              aria-label="סיכום AI לישיבה"
              title="סיכום AI לישיבה"
              aria-pressed={summaryOpen}
            >
              <ChatIconAi />
            </button>
          </div>
        </footer>
      </div>
    </section>
  )
}

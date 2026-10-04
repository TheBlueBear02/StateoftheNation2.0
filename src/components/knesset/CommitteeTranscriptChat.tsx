'use client'

import { useVirtualizer } from '@tanstack/react-virtual'
import {
  memo,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from 'react'
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
  resolvePartPersonId,
  speakerHeaderToName,
} from '../../lib/committeeSpeakerMatch'
import {
  buildCommitteesSharePath,
  sharePageLink,
} from '../../lib/committeeShare'

type CommitteeTranscriptChatProps = {
  parts: CommitteeTranscriptPart[]
  members: CommitteeMember[]
  session: CommitteeSession | null
  committeeName: string | null
  committeeId?: number | null
  shareUrl?: string | null
  activeOrdinal: number | null
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

type VisibleItem = {
  part: CommitteeTranscriptPart
  ordinal: number
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

function ChatIconShare() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="committee-chat__icon">
      <path
        fill="currentColor"
        d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11A2.99 2.99 0 0 0 18 7.91c1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L7.04 9.81A2.99 2.99 0 0 0 6 9.09c-1.66 0-3 1.34-3 3s1.34 3 3 3c.76 0 1.44-.3 1.96-.77l7.12 4.16c-.05.21-.08.43-.08.61 0 1.61 1.31 2.92 2.92 2.92s2.92-1.31 2.92-2.92-1.31-2.92-2.92-2.92z"
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

/**
 * Attendance / agenda / staff, and all preamble before the first MK speech.
 * Pass `firstSpeechIndex` (from getFirstSpeechIndex) to avoid O(n²) scans.
 */
export function isMetaPart(
  part: CommitteeTranscriptPart,
  index: number,
  parts: CommitteeTranscriptPart[],
  firstSpeechIndex?: number,
): boolean {
  if (isStructuralMetaPart(part)) {
    return true
  }
  const first =
    firstSpeechIndex ?? parts.findIndex((candidate) => isLikelySpeechPart(candidate))
  if (first === -1) {
    return true
  }
  return index < first
}

/** Index of the first real speech bubble; -1 if the transcript is only meta. */
export function getFirstSpeechIndex(
  parts: CommitteeTranscriptPart[],
): number {
  return parts.findIndex((part) => isLikelySpeechPart(part))
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

type ChatMessageRowProps = {
  part: CommitteeTranscriptPart
  ordinal: number
  members: CommitteeMember[]
  meta: boolean
  isActive: boolean
  justPopped: boolean
  selectedPersonId: number | null
  searchQuery: string
  searchActive: boolean
  messageSharePath: string | null
  shareTitle: string
  onJumpToOrdinal: (ordinal: number) => void
}

const ChatMessageRow = memo(function ChatMessageRow({
  part,
  ordinal,
  members,
  meta,
  isActive,
  justPopped,
  selectedPersonId,
  searchQuery,
  searchActive,
  messageSharePath,
  shareTitle,
  onJumpToOrdinal,
}: ChatMessageRowProps) {
  const [shareStatus, setShareStatus] = useState<'idle' | 'copied' | 'failed'>(
    'idle',
  )
  const personId = resolvePartPersonId(part, members)
  const isSelectedSpeaker =
    selectedPersonId != null && personId === selectedPersonId
  const matchesSearch = partMatchesSearch(part, searchQuery, members)
  const dimmed =
    (selectedPersonId != null && !isSelectedSpeaker && !meta) ||
    (searchActive && !matchesSearch)
  const name = speakerLabel(part, members)
  const factionName = speakerFaction(part, members)
  const imageUrl = speakerImage(part, members)

  useEffect(() => {
    if (shareStatus === 'idle') {
      return
    }
    const timer = window.setTimeout(() => setShareStatus('idle'), 2000)
    return () => window.clearTimeout(timer)
  }, [shareStatus])

  async function handleMessageShare(
    event: ReactMouseEvent<HTMLButtonElement>,
  ) {
    event.preventDefault()
    event.stopPropagation()
    if (!messageSharePath) {
      return
    }
    const absoluteUrl = messageSharePath.startsWith('http')
      ? messageSharePath
      : `${window.location.origin}${messageSharePath}`
    const text = `${shareTitle} · ${name}`
    const result = await sharePageLink({
      url: absoluteUrl,
      title: shareTitle,
      text,
    })
    if (result === 'copied') {
      setShareStatus('copied')
    } else if (result === 'failed') {
      setShareStatus('failed')
    }
  }

  if (meta) {
    const body = part.body.trim()
    const title = metaTitle(part)
    return (
      <div
        className={[
          'committee-chat__system',
          isActive ? 'committee-chat__system--active' : '',
          dimmed ? 'committee-chat__system--dimmed' : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <div className="committee-chat__system-card">
          <strong>{highlightSearchMatches(title, searchQuery)}</strong>
          {body ? (
            <span>{highlightSearchMatches(body, searchQuery)}</span>
          ) : null}
        </div>
      </div>
    )
  }

  return (
    <div
      className={[
        'committee-chat__row',
        isActive ? 'committee-chat__row--active' : '',
        justPopped ? 'committee-chat__message--pop' : '',
        isSelectedSpeaker ? 'committee-chat__row--selected-speaker' : '',
        dimmed ? 'committee-chat__row--dimmed' : '',
        searchActive && matchesSearch ? 'committee-chat__row--search-match' : '',
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
      <div className="committee-chat__bubble-wrap">
        <button
          type="button"
          className="committee-chat__bubble"
          onClick={() => onJumpToOrdinal(ordinal)}
          aria-current={isActive ? 'true' : undefined}
        >
          <span className="committee-chat__bubble-meta">
            <span className="committee-chat__bubble-name">
              {highlightSearchMatches(name, searchQuery)}
            </span>
            {factionName ? (
              <span className="committee-chat__bubble-party">
                {highlightSearchMatches(factionName, searchQuery)}
              </span>
            ) : null}
          </span>
          <span className="committee-chat__bubble-body">
            {highlightSearchMatches(part.body, searchQuery)}
          </span>
        </button>
        {messageSharePath ? (
          <button
            type="button"
            className={[
              'committee-chat__msg-share',
              shareStatus === 'copied'
                ? 'committee-chat__msg-share--copied'
                : '',
              shareStatus === 'failed'
                ? 'committee-chat__msg-share--failed'
                : '',
            ]
              .filter(Boolean)
              .join(' ')}
            onClick={(event) => {
              void handleMessageShare(event)
            }}
            aria-label={
              shareStatus === 'copied'
                ? 'הקישור להודעה הועתק'
                : shareStatus === 'failed'
                  ? 'שיתוף ההודעה נכשל'
                  : 'שתפו את ההודעה'
            }
            title={
              shareStatus === 'copied'
                ? 'הועתק'
                : shareStatus === 'failed'
                  ? 'שגיאה'
                  : 'שתפו הודעה'
            }
          >
            {shareStatus === 'copied' ? (
              <span className="committee-chat__share-status" role="status">
                ✓
              </span>
            ) : shareStatus === 'failed' ? (
              <span className="committee-chat__share-status" role="status">
                !
              </span>
            ) : (
              <ChatIconShare />
            )}
          </button>
        ) : null}
      </div>
    </div>
  )
})

export function CommitteeTranscriptChat({
  parts,
  members,
  session,
  committeeName,
  committeeId = null,
  shareUrl = null,
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
  const [searchQuery, setSearchQuery] = useState('')
  const [summaryText, setSummaryText] = useState<string | null>(null)
  const [summaryError, setSummaryError] = useState<string | null>(null)
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [summaryOpen, setSummaryOpen] = useState(false)
  const [shareStatus, setShareStatus] = useState<
    'idle' | 'copied' | 'failed'
  >('idle')

  const firstSpeechIndex = useMemo(() => getFirstSpeechIndex(parts), [parts])

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
      ? selectedMemberIndexes.some(
          (index) => activeOrdinal != null && index < activeOrdinal,
        )
      : activeOrdinal != null && activeOrdinal > 0
  const canGoNext =
    selectedPersonId != null
      ? selectedMemberIndexes.some(
          (index) => activeOrdinal == null || index > activeOrdinal,
        )
      : parts.length > 0 &&
        (activeOrdinal == null || activeOrdinal < parts.length - 1)

  const trimmedSearch = searchQuery.trim()
  const searchActive = trimmedSearch.length > 0

  // Play: keep meta cards + speech up to the active cursor (hide future speech).
  // Before Play starts (no active message), show the full transcript.
  const visibleItems = useMemo((): VisibleItem[] => {
    const items: VisibleItem[] = []
    for (let index = 0; index < parts.length; index += 1) {
      const part = parts[index]!
      const meta = isMetaPart(part, index, parts, firstSpeechIndex)
      if (
        playing &&
        activeOrdinal != null &&
        !meta &&
        index > activeOrdinal
      ) {
        continue
      }
      items.push({ part, ordinal: index })
    }
    return items
  }, [parts, playing, activeOrdinal, firstSpeechIndex])

  const virtualizer = useVirtualizer({
    count: visibleItems.length,
    getScrollElement: () => listRef.current,
    estimateSize: () => 96,
    overscan: 14,
  })

  useEffect(() => {
    setSearchQuery('')
    setSummaryText(null)
    setSummaryError(null)
    setSummaryLoading(false)
    setSummaryOpen(false)
    setShareStatus('idle')
  }, [session?.id])

  useEffect(() => {
    if (shareStatus === 'idle') {
      return
    }
    const timer = window.setTimeout(() => setShareStatus('idle'), 2000)
    return () => window.clearTimeout(timer)
  }, [shareStatus])

  const headerSubtitle = formatChatHeaderSubtitle(session)
  const shareTitle = formatChatHeaderTitle(committeeName)
  const progressLabel =
    parts.length > 0
      ? `${activeOrdinal != null ? activeOrdinal + 1 : '—'} / ${parts.length}`
      : loading
        ? 'טוען תמליל…'
        : 'אין תמליל לישיבה זו'

  function messageSharePathFor(partId: number): string | null {
    if (committeeId == null || session?.id == null) {
      return null
    }
    return buildCommitteesSharePath(committeeId, session.id, partId)
  }

  async function handleShare() {
    if (!shareUrl) {
      return
    }
    const absoluteUrl = shareUrl.startsWith('http')
      ? shareUrl
      : `${window.location.origin}${shareUrl}`
    const when = headerSubtitle.short
    const text = when ? `${shareTitle} · ${when}` : shareTitle
    const result = await sharePageLink({
      url: absoluteUrl,
      title: shareTitle,
      text,
    })
    if (result === 'copied') {
      setShareStatus('copied')
    } else if (result === 'failed') {
      setShareStatus('failed')
    }
  }

  // Keep the active bubble in view without mounting every row.
  useEffect(() => {
    if (activeOrdinal == null || visibleItems.length === 0) {
      return
    }
    const visibleIndex = visibleItems.findIndex(
      (item) => item.ordinal === activeOrdinal,
    )
    if (visibleIndex < 0) {
      return
    }
    virtualizer.scrollToIndex(visibleIndex, {
      align: 'auto',
      behavior: 'smooth',
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- scroll when play/selection moves
  }, [activeOrdinal, playing, selectedPersonId, visibleItems])

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

  const virtualItems = virtualizer.getVirtualItems()

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
          {shareUrl ? (
            <button
              type="button"
              className={[
                'committee-chat__share',
                shareStatus === 'copied' ? 'committee-chat__share--copied' : '',
                shareStatus === 'failed' ? 'committee-chat__share--failed' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={() => {
                void handleShare()
              }}
              aria-label={
                shareStatus === 'copied'
                  ? 'הקישור הועתק'
                  : shareStatus === 'failed'
                    ? 'שיתוף נכשל'
                    : 'שתפו את הישיבה'
              }
              title={
                shareStatus === 'copied'
                  ? 'הועתק'
                  : shareStatus === 'failed'
                    ? 'שגיאה'
                    : 'שתפו'
              }
            >
              {shareStatus === 'copied' ? (
                <span className="committee-chat__share-status" role="status">
                  ✓
                </span>
              ) : shareStatus === 'failed' ? (
                <span className="committee-chat__share-status" role="status">
                  !
                </span>
              ) : (
                <ChatIconShare />
              )}
            </button>
          ) : null}
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
            <div
              className="committee-chat__virtual"
              style={{ height: `${virtualizer.getTotalSize()}px` }}
            >
              {virtualItems.map((virtualRow) => {
                const item = visibleItems[virtualRow.index]
                if (!item) {
                  return null
                }
                const meta = isMetaPart(
                  item.part,
                  item.ordinal,
                  parts,
                  firstSpeechIndex,
                )
                const isActive =
                  activeOrdinal != null && item.ordinal === activeOrdinal
                const justPopped = playing && isActive && !meta
                return (
                  <div
                    key={item.part.id}
                    className="committee-chat__virtual-item"
                    data-index={virtualRow.index}
                    ref={virtualizer.measureElement}
                    style={{
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                  >
                    <ChatMessageRow
                      part={item.part}
                      ordinal={item.ordinal}
                      members={members}
                      meta={meta}
                      isActive={isActive}
                      justPopped={justPopped}
                      selectedPersonId={selectedPersonId}
                      searchQuery={trimmedSearch}
                      searchActive={searchActive}
                      messageSharePath={messageSharePathFor(item.part.id)}
                      shareTitle={shareTitle}
                      onJumpToOrdinal={onJumpToOrdinal}
                    />
                  </div>
                )
              })}
            </div>
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

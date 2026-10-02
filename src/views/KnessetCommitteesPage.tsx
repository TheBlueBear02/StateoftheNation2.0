'use client'

import { useEffect, useMemo, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { PageBreadcrumb } from '../components/PageBreadcrumb'
import { SiteLayout } from '../components/SiteLayout'
import { CommitteeChatPicker } from '../components/knesset/CommitteeChatPicker'
import { CommitteeTable } from '../components/knesset/CommitteeTable'
import {
  CommitteeTranscriptChat,
  getFirstSpeechIndex,
  isMetaPart,
} from '../components/knesset/CommitteeTranscriptChat'
import { useCommitteeAttendance } from '../hooks/useCommitteeAttendance'
import { useCommitteeMemberships } from '../hooks/useCommitteeMemberships'
import { useCommitteeSessions } from '../hooks/useCommitteeSessions'
import { useCommitteeTranscript } from '../hooks/useCommitteeTranscript'
import { useKnessetCommittees } from '../hooks/useKnessetCommittees'
import { usePersonFactions } from '../hooks/usePersonFactions'
import { usePersonTenures } from '../hooks/usePersonTenures'
import type { CommitteeMember } from '../lib/committeeTypes'
import type { KnessetCommittee } from '../lib/committeeTypes'
import type { CommitteeSession } from '../lib/committeeTypes'
import { layoutCommitteeSeats } from '../lib/committeeTableLayout'
import {
  partBelongsToPerson,
  resolvePartPersonId,
  coalesceTranscriptParts,
  extractLegalCounselMember,
  extractCommitteeManagerMember,
  isAttendanceProtocolHeader,
  isStaffRosterProtocolHeader,
} from '../lib/committeeSpeakerMatch'
import './KnessetCommitteesPage.css'

const PLAY_INTERVAL_MS = 3000

type ChatNav = 'committees' | 'sessions' | 'transcript'

function parsePositiveInt(raw: string | null): number | null {
  if (!raw) {
    return null
  }
  const n = Number(raw)
  return Number.isInteger(n) && n > 0 ? n : null
}

function buildCommitteesQuery(
  committeeId: number | null,
  sessionId: number | null,
): string {
  const params = new URLSearchParams()
  if (committeeId != null) {
    params.set('committee', String(committeeId))
  }
  if (sessionId != null) {
    params.set('session', String(sessionId))
  }
  return params.toString()
}

export function KnessetCommitteesPage() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { committees, loading: committeesLoading, error: committeesError } =
    useKnessetCommittees()

  const [selectedCommittee, setSelectedCommittee] =
    useState<KnessetCommittee | null>(null)
  const [selectedSession, setSelectedSession] =
    useState<CommitteeSession | null>(null)
  const [chatNav, setChatNav] = useState<ChatNav>('committees')
  const [withTranscriptOnly] = useState(true)
  const [selectedPersonId, setSelectedPersonId] = useState<number | null>(null)
  const [activeOrdinal, setActiveOrdinal] = useState<number | null>(null)
  const [playing, setPlaying] = useState(false)
  const urlCommitteeId = parsePositiveInt(searchParams.get('committee'))
  const urlSessionId = parsePositiveInt(searchParams.get('session'))

  const {
    sessions,
    loading: sessionsLoading,
    error: sessionsError,
  } = useCommitteeSessions(selectedCommittee?.id ?? null, withTranscriptOnly)

  const {
    members,
    loading: membersLoading,
    error: membersError,
  } = useCommitteeMemberships(
    selectedCommittee?.id ?? null,
    selectedSession?.startAt ?? null,
  )

  const {
    attendees,
    attendeePersonIds,
    hasAttendanceData,
    loading: attendanceLoading,
    error: attendanceError,
  } = useCommitteeAttendance(selectedSession?.id ?? null)

  const {
    transcript,
    loading: transcriptLoading,
    error: transcriptError,
  } = useCommitteeTranscript(selectedSession?.id ?? null)

  const protocolParts = useMemo(() => {
    const raw = transcript?.parts ?? []
    // Drop the leading untitled "פרוטוקול" preamble and attendance blocks —
    // נכחו / חברי הכנסת are already reflected on the table seats.
    // Keep staff roster blocks here so seat names can still be extracted.
    return raw.filter((part, index) => {
      const header = (part.speakerHeader ?? '').trim()
      if (!header) {
        // Keep only if it is not the first untitled preamble card.
        const firstProtocolIdx = raw.findIndex(
          (candidate) => !(candidate.speakerHeader ?? '').trim(),
        )
        return index !== firstProtocolIdx
      }
      return !isAttendanceProtocolHeader(header)
    })
  }, [transcript?.parts])

  // Legal counsel + committee manager come from protocol staff blocks and
  // link to the flanking seats beside the chair.
  const legalCounsel = useMemo(() => {
    if (protocolParts.length === 0) {
      return null
    }
    return extractLegalCounselMember(protocolParts, selectedCommittee?.id ?? 0)
  }, [protocolParts, selectedCommittee?.id])

  const committeeManager = useMemo(() => {
    if (protocolParts.length === 0) {
      return null
    }
    return extractCommitteeManagerMember(
      protocolParts,
      selectedCommittee?.id ?? 0,
    )
  }, [protocolParts, selectedCommittee?.id])

  // Chat hides ייעוץ משפטי / מנהל/ת הוועדה roster cards (seats already show them).
  const rawParts = useMemo(
    () =>
      protocolParts.filter(
        (part) => !isStaffRosterProtocolHeader(part.speakerHeader),
      ),
    [protocolParts],
  )

  const seatsMembersBase = useMemo((): CommitteeMember[] => {
    const byPerson = new Map(members.map((m) => [m.personId, m]))
    const result: CommitteeMember[] = [...members]

    if (hasAttendanceData) {
      for (const attendee of attendees) {
        if (byPerson.has(attendee.personId)) {
          continue
        }
        result.push({
          id: -attendee.personId,
          committeeId: selectedCommittee?.id ?? 0,
          personId: attendee.personId,
          fullName: attendee.fullName,
          imageUrl: attendee.imageUrl,
          factionName: null,
          seatRole: 'member',
          roleDesc: 'חבר כנסת (לא חבר הוועדה)',
          isGuestMk: true,
          startDate: null,
          endDate: null,
        })
        byPerson.set(attendee.personId, result[result.length - 1]!)
      }
    }

    const withoutStaff = result.filter(
      (member) =>
        member.seatRole !== 'legal_counsel' &&
        member.seatRole !== 'committee_manager',
    )
    if (legalCounsel) {
      withoutStaff.push(legalCounsel)
    }
    if (committeeManager) {
      withoutStaff.push(committeeManager)
    }

    return withoutStaff.sort((a, b) => {
      const rank = (role: string) => {
        if (role === 'chair') return 0
        if (role === 'legal_counsel') return 1
        if (role === 'committee_manager') return 2
        return 3
      }
      const d = rank(a.seatRole) - rank(b.seatRole)
      if (d !== 0) {
        return d
      }
      return a.fullName.localeCompare(b.fullName, 'he')
    })
  }, [
    hasAttendanceData,
    members,
    attendees,
    selectedCommittee?.id,
    legalCounsel,
    committeeManager,
  ])

  const seatPersonIds = useMemo(
    () =>
      seatsMembersBase
        .map((member) => member.personId)
        .filter((personId) => personId > 0),
    [seatsMembersBase],
  )

  const { factionByPersonId } = usePersonFactions(
    seatPersonIds,
    selectedSession?.startAt ?? null,
  )

  const { tenureByPersonId } = usePersonTenures(seatPersonIds)

  const seatsMembers = useMemo(
    (): CommitteeMember[] =>
      seatsMembersBase.map((member) => {
        const tenure = tenureByPersonId.get(member.personId)
        return {
          ...member,
          factionName:
            factionByPersonId.get(member.personId) ?? member.factionName,
          firstElectedYear: tenure?.firstElectedYear ?? null,
          totalDaysInKnesset: tenure?.totalDaysInKnesset ?? 0,
          totalYearsInKnesset: tenure?.totalYearsInKnesset ?? 0,
        }
      }),
    [seatsMembersBase, factionByPersonId, tenureByPersonId],
  )

  // Fold false Hasadna splits (e.g. "ואני אומר לנתניהו") into the prior speech.
  const parts = useMemo(
    () => coalesceTranscriptParts(rawParts, seatsMembers),
    [rawParts, seatsMembers],
  )
  const firstSpeechIndex = useMemo(() => getFirstSpeechIndex(parts), [parts])
  const activePart =
    activeOrdinal != null ? (parts[activeOrdinal] ?? null) : null

  // Speech bubbles per seated person — drives orbit order (most → top-right).
  const messageCountByPersonId = useMemo(() => {
    const counts = new Map<number, number>()
    for (let index = 0; index < parts.length; index += 1) {
      const part = parts[index]!
      if (isMetaPart(part, index, parts, firstSpeechIndex)) {
        continue
      }
      const personId = resolvePartPersonId(part, seatsMembers)
      if (personId == null) {
        continue
      }
      counts.set(personId, (counts.get(personId) ?? 0) + 1)
    }
    return counts
  }, [parts, seatsMembers, firstSpeechIndex])

  const { seats, overflowCount } = useMemo(
    () =>
      layoutCommitteeSeats(
        seatsMembers,
        hasAttendanceData ? attendeePersonIds : null,
        messageCountByPersonId,
      ),
    [
      seatsMembers,
      hasAttendanceData,
      attendeePersonIds,
      messageCountByPersonId,
    ],
  )

  const speakingPersonId = useMemo(
    () =>
      activePart ? resolvePartPersonId(activePart, seatsMembers) : null,
    [activePart, seatsMembers],
  )

  const selectedMemberIndexes = useMemo(() => {
    if (selectedPersonId == null) {
      return [] as number[]
    }
    return parts
      .map((part, index) => ({ part, index }))
      .filter(({ part }) =>
        partBelongsToPerson(part, selectedPersonId, seatsMembers),
      )
      .map(({ index }) => index)
  }, [parts, selectedPersonId, seatsMembers])

  // Reset play state when session changes (no message highlighted on load).
  useEffect(() => {
    setActiveOrdinal(null)
    setPlaying(false)
    setSelectedPersonId(null)
  }, [selectedSession?.id])

  // When an MK is selected, jump to their first message in the chat.
  useEffect(() => {
    if (selectedPersonId == null) {
      return
    }
    const indexes = parts
      .map((part, index) => ({ part, index }))
      .filter(({ part }) =>
        partBelongsToPerson(part, selectedPersonId, seatsMembers),
      )
      .map(({ index }) => index)
    if (indexes.length === 0) {
      return
    }
    setActiveOrdinal(indexes[0]!)
    // Only re-run when the selected person changes, not on every play tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPersonId])

  // Play ticker — pops the next real speech every 3s (skips meta cards).
  useEffect(() => {
    if (!playing || parts.length === 0) {
      return
    }
    const id = window.setInterval(() => {
      setActiveOrdinal((prev) => {
        const start =
          prev == null
            ? firstSpeechIndex >= 0
              ? firstSpeechIndex
              : 0
            : prev + 1
        let next = start
        while (
          next < parts.length &&
          isMetaPart(parts[next]!, next, parts, firstSpeechIndex)
        ) {
          next += 1
        }
        if (next >= parts.length) {
          setPlaying(false)
          return prev == null ? null : Math.max(prev, parts.length - 1)
        }
        return next
      })
    }, PLAY_INTERVAL_MS)
    return () => window.clearInterval(id)
  }, [playing, parts, firstSpeechIndex])

  // Selection is driven by the URL so share links and back/forward stay in sync.
  useEffect(() => {
    if (committeesLoading) {
      return
    }

    if (urlCommitteeId == null) {
      setSelectedCommittee(null)
      setSelectedSession(null)
      setChatNav('committees')
      return
    }

    const committee =
      committees.find((item) => item.id === urlCommitteeId) ?? null
    if (!committee) {
      setSelectedCommittee(null)
      setSelectedSession(null)
      setChatNav('committees')
      return
    }

    setSelectedCommittee((prev) =>
      prev?.id === committee.id ? prev : committee,
    )

    if (urlSessionId == null) {
      setSelectedSession(null)
      setChatNav('sessions')
      return
    }

    // Sessions hook keys off selectedCommittee; wait until it matches the URL.
    if (selectedCommittee?.id !== committee.id || sessionsLoading) {
      setSelectedSession(null)
      setChatNav('sessions')
      return
    }

    const session = sessions.find((item) => item.id === urlSessionId) ?? null
    if (!session) {
      setSelectedSession(null)
      setChatNav('sessions')
      return
    }

    setSelectedSession((prev) => (prev?.id === session.id ? prev : session))
    setChatNav('transcript')
  }, [
    committees,
    committeesLoading,
    selectedCommittee?.id,
    sessions,
    sessionsLoading,
    urlCommitteeId,
    urlSessionId,
  ])

  // Drop invalid ids from the address bar once lists have loaded.
  useEffect(() => {
    if (committeesLoading) {
      return
    }

    if (
      urlCommitteeId != null &&
      !committees.some((item) => item.id === urlCommitteeId)
    ) {
      router.replace(pathname, { scroll: false })
      return
    }

    if (
      urlCommitteeId != null &&
      urlSessionId != null &&
      selectedCommittee?.id === urlCommitteeId &&
      !sessionsLoading &&
      !sessions.some((item) => item.id === urlSessionId)
    ) {
      router.replace(
        `${pathname}?${buildCommitteesQuery(urlCommitteeId, null)}`,
        { scroll: false },
      )
    }
  }, [
    committees,
    committeesLoading,
    pathname,
    router,
    selectedCommittee?.id,
    sessions,
    sessionsLoading,
    urlCommitteeId,
    urlSessionId,
  ])

  const pageError =
    committeesError ||
    sessionsError ||
    membersError ||
    attendanceError ||
    transcriptError
  const hasParts = parts.length > 0
  const loadingTable = membersLoading || attendanceLoading || committeesLoading
  const sessionOpen = chatNav === 'transcript' && selectedSession != null

  function selectPerson(personId: number | null) {
    setPlaying(false)
    setSelectedPersonId((prev) => (prev === personId ? null : personId))
  }

  function goToAdjacentMessage(direction: -1 | 1) {
    setPlaying(false)
    if (selectedPersonId != null && selectedMemberIndexes.length > 0) {
      if (direction > 0) {
        const next = selectedMemberIndexes.find(
          (index) => activeOrdinal == null || index > activeOrdinal,
        )
        if (next != null) {
          setActiveOrdinal(next)
        }
        return
      }
      if (activeOrdinal == null) {
        return
      }
      const prev = [...selectedMemberIndexes]
        .reverse()
        .find((index) => index < activeOrdinal)
      if (prev != null) {
        setActiveOrdinal(prev)
      }
      return
    }
    setActiveOrdinal((prev) => {
      if (prev == null) {
        return direction > 0 ? 0 : null
      }
      return direction > 0
        ? Math.min(parts.length - 1, prev + 1)
        : Math.max(0, prev - 1)
    })
  }

  function openCommittee(committee: KnessetCommittee) {
    setPlaying(false)
    setSelectedPersonId(null)
    router.replace(
      `${pathname}?${buildCommitteesQuery(committee.id, null)}`,
      { scroll: false },
    )
  }

  function openSession(session: CommitteeSession) {
    const committeeId = selectedCommittee?.id ?? urlCommitteeId
    setPlaying(false)
    setSelectedPersonId(null)
    if (committeeId == null) {
      return
    }
    router.replace(
      `${pathname}?${buildCommitteesQuery(committeeId, session.id)}`,
      { scroll: false },
    )
  }

  function backFromTranscript() {
    const committeeId = selectedCommittee?.id ?? urlCommitteeId
    setPlaying(false)
    setSelectedPersonId(null)
    if (committeeId != null) {
      router.replace(
        `${pathname}?${buildCommitteesQuery(committeeId, null)}`,
        { scroll: false },
      )
      return
    }
    router.replace(pathname, { scroll: false })
  }

  function backFromSessions() {
    setPlaying(false)
    setSelectedPersonId(null)
    router.replace(pathname, { scroll: false })
  }

  return (
    <SiteLayout className="committees-page">
      <main className="committees-page__main">
        <section className="committees-page__section">
          <div className="committees-page__inner container">
            <PageBreadcrumb
              items={[
                { label: 'הכנסת', to: '/knesset' },
                { label: 'ועדות הכנסת' },
              ]}
            />

            {pageError ? (
              <p className="committees-page__error" role="alert">
                לא ניתן לטעון את נתוני הוועדות
              </p>
            ) : null}

            <div
              className={[
                'committees-page__stage',
                sessionOpen ? '' : 'committees-page__stage--no-session',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              <div className="committees-page__stage-table">
                <div className="committees-page__table-stack">
                  <p
                    className={[
                      'committees-page__table-hint',
                      sessionOpen ? 'committees-page__table-hint--hidden' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    aria-hidden={sessionOpen || undefined}
                  >
                    בחרו ישיבת וועדה על מנת להראות את המשתתפים מסביב לשולחן
                  </p>
                  <CommitteeTable
                    seats={sessionOpen ? seats : []}
                    overflowCount={sessionOpen ? overflowCount : 0}
                    speakingPersonId={
                      sessionOpen && playing ? speakingPersonId : null
                    }
                    selectedPersonId={sessionOpen ? selectedPersonId : null}
                    onSelectPerson={selectPerson}
                    loading={sessionOpen ? loadingTable : false}
                  />
                </div>
              </div>

              <div className="committees-page__stage-chat">
                {chatNav === 'committees' ? (
                  <CommitteeChatPicker
                    mode="committees"
                    committees={committees}
                    loading={committeesLoading}
                    onSelectCommittee={openCommittee}
                  />
                ) : null}

                {chatNav === 'sessions' && selectedCommittee ? (
                  <CommitteeChatPicker
                    mode="sessions"
                    committeeName={selectedCommittee.name}
                    sessions={sessions}
                    loading={sessionsLoading}
                    onSelectSession={openSession}
                    onBack={backFromSessions}
                  />
                ) : null}

                {chatNav === 'transcript' ? (
                  <CommitteeTranscriptChat
                    parts={parts}
                    members={seatsMembers}
                    session={selectedSession}
                    committeeName={selectedCommittee?.name ?? null}
                    activeOrdinal={activeOrdinal}
                    playing={playing}
                    selectedPersonId={selectedPersonId}
                    disabled={!hasParts || transcriptLoading}
                    loading={transcriptLoading}
                    onBack={backFromTranscript}
                    onPlayPause={() => {
                      if (!hasParts) {
                        return
                      }
                      if (playing) {
                        setPlaying(false)
                        return
                      }
                      // Resume from the current message; only restart after finishing.
                      const firstSpeech = getFirstSpeechIndex(parts)
                      const atEnd =
                        activeOrdinal != null &&
                        activeOrdinal >= parts.length - 1
                      if (activeOrdinal == null || atEnd) {
                        setActiveOrdinal(firstSpeech >= 0 ? firstSpeech : 0)
                      } else if (
                        firstSpeech >= 0 &&
                        activeOrdinal < firstSpeech
                      ) {
                        setActiveOrdinal(firstSpeech)
                      }
                      setPlaying(true)
                    }}
                    onPrev={() => goToAdjacentMessage(-1)}
                    onNext={() => goToAdjacentMessage(1)}
                    onJumpToOrdinal={(ordinal) => {
                      setPlaying(false)
                      setActiveOrdinal(ordinal)
                    }}
                    onClearMemberFilter={() => setSelectedPersonId(null)}
                  />
                ) : null}
              </div>
            </div>
          </div>
        </section>
      </main>
    </SiteLayout>
  )
}

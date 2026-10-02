'use client'

import { useEffect, useMemo, useState } from 'react'
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
} from '../lib/committeeSpeakerMatch'
import './KnessetCommitteesPage.css'

const PLAY_INTERVAL_MS = 3000

type ChatNav = 'committees' | 'sessions' | 'transcript'

export function KnessetCommitteesPage() {
  const { committees, loading: committeesLoading, error: committeesError } =
    useKnessetCommittees()

  const [selectedCommittee, setSelectedCommittee] =
    useState<KnessetCommittee | null>(null)
  const [selectedSession, setSelectedSession] =
    useState<CommitteeSession | null>(null)
  const [chatNav, setChatNav] = useState<ChatNav>('committees')
  const [withTranscriptOnly] = useState(true)
  const [selectedPersonId, setSelectedPersonId] = useState<number | null>(null)
  const [activeOrdinal, setActiveOrdinal] = useState(0)
  const [playing, setPlaying] = useState(false)

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

  const rawParts = useMemo(() => {
    const raw = transcript?.parts ?? []
    // Drop the leading untitled "פרוטוקול" preamble card from every session.
    const firstProtocolIdx = raw.findIndex(
      (part) => !(part.speakerHeader ?? '').trim(),
    )
    if (firstProtocolIdx < 0) {
      return raw
    }
    return raw.filter((_, index) => index !== firstProtocolIdx)
  }, [transcript?.parts])

  // Full committee roster around the table. When protocol attendance exists,
  // guests listed in נכחו but not in memberships are still added; absentees
  // stay on the roster and render gray.
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
          roleDesc: 'חבר כנסת (לא חבר הועדה)',
          startDate: null,
          endDate: null,
        })
      }
    }

    return result.sort((a, b) => {
      const rank = (role: string) => (role === 'chair' ? 0 : 1)
      const d = rank(a.seatRole) - rank(b.seatRole)
      if (d !== 0) {
        return d
      }
      return a.fullName.localeCompare(b.fullName, 'he')
    })
  }, [hasAttendanceData, members, attendees, selectedCommittee?.id])

  const seatPersonIds = useMemo(
    () => seatsMembersBase.map((member) => member.personId),
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
  const activePart = parts[activeOrdinal] ?? null

  const { seats, overflowCount } = useMemo(
    () =>
      layoutCommitteeSeats(
        seatsMembers,
        hasAttendanceData ? attendeePersonIds : null,
      ),
    [seatsMembers, hasAttendanceData, attendeePersonIds],
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

  // Reset play state when session changes.
  useEffect(() => {
    setActiveOrdinal(0)
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
        let next = prev + 1
        while (
          next < parts.length &&
          isMetaPart(parts[next]!, next, parts)
        ) {
          next += 1
        }
        if (next >= parts.length) {
          setPlaying(false)
          return Math.max(prev, parts.length - 1)
        }
        return next
      })
    }, PLAY_INTERVAL_MS)
    return () => window.clearInterval(id)
  }, [playing, parts])

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

  function jumpToNextSelectedMemberMessage() {
    if (selectedMemberIndexes.length === 0) {
      return
    }
    setPlaying(false)
    const next =
      selectedMemberIndexes.find((index) => index > activeOrdinal) ??
      selectedMemberIndexes[0]!
    setActiveOrdinal(next)
  }

  function openCommittee(committee: KnessetCommittee) {
    setPlaying(false)
    setSelectedPersonId(null)
    setSelectedSession(null)
    setSelectedCommittee(committee)
    setChatNav('sessions')
  }

  function openSession(session: CommitteeSession) {
    setPlaying(false)
    setSelectedPersonId(null)
    setSelectedSession(session)
    setChatNav('transcript')
  }

  function backFromTranscript() {
    setPlaying(false)
    setSelectedPersonId(null)
    setSelectedSession(null)
    setChatNav('sessions')
  }

  function backFromSessions() {
    setPlaying(false)
    setSelectedPersonId(null)
    setSelectedSession(null)
    setSelectedCommittee(null)
    setChatNav('committees')
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
                    const atEnd = activeOrdinal >= parts.length - 1
                    if (atEnd) {
                      setActiveOrdinal(firstSpeech >= 0 ? firstSpeech : 0)
                    } else if (
                      firstSpeech >= 0 &&
                      activeOrdinal < firstSpeech
                    ) {
                      setActiveOrdinal(firstSpeech)
                    }
                    setPlaying(true)
                  }}
                  onPrev={() => {
                    setPlaying(false)
                    setActiveOrdinal((prev) => Math.max(0, prev - 1))
                  }}
                  onNext={() => {
                    setPlaying(false)
                    setActiveOrdinal((prev) =>
                      Math.min(parts.length - 1, prev + 1),
                    )
                  }}
                  onJumpToOrdinal={(ordinal) => {
                    setPlaying(false)
                    setActiveOrdinal(ordinal)
                  }}
                  onNextSelectedMemberMessage={jumpToNextSelectedMemberMessage}
                  onClearMemberFilter={() => setSelectedPersonId(null)}
                />
              ) : null}
            </div>
          </div>
        </section>
      </main>
    </SiteLayout>
  )
}

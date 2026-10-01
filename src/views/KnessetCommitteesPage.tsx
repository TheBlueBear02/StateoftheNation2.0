'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { SiteLayout } from '../components/SiteLayout'
import { CommitteeSelectMenu } from '../components/knesset/CommitteeSelectMenu'
import { CommitteeTable } from '../components/knesset/CommitteeTable'
import { CommitteeTranscriptChat } from '../components/knesset/CommitteeTranscriptChat'
import { useCommitteeAttendance } from '../hooks/useCommitteeAttendance'
import { useCommitteeMemberships } from '../hooks/useCommitteeMemberships'
import {
  formatCommitteeSessionLabel,
  useCommitteeSessions,
} from '../hooks/useCommitteeSessions'
import { useCommitteeTranscript } from '../hooks/useCommitteeTranscript'
import { useKnessetCommittees } from '../hooks/useKnessetCommittees'
import { usePersonFactions } from '../hooks/usePersonFactions'
import type { CommitteeMember } from '../lib/committeeTypes'
import type { KnessetCommittee } from '../lib/committeeTypes'
import type { CommitteeSession } from '../lib/committeeTypes'
import { layoutCommitteeSeats } from '../lib/committeeTableLayout'
import {
  partBelongsToPerson,
  resolvePartPersonId,
} from '../lib/committeeSpeakerMatch'
import './KnessetCommitteesPage.css'

const PLAY_INTERVAL_MS = 3000

export function KnessetCommitteesPage() {
  const { committees, loading: committeesLoading, error: committeesError } =
    useKnessetCommittees()

  const [selectedCommittee, setSelectedCommittee] =
    useState<KnessetCommittee | null>(null)
  const [selectedSession, setSelectedSession] =
    useState<CommitteeSession | null>(null)
  const [withTranscriptOnly, setWithTranscriptOnly] = useState(true)
  const [selectedPersonId, setSelectedPersonId] = useState<number | null>(null)
  const [activeOrdinal, setActiveOrdinal] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [bootstrapped, setBootstrapped] = useState(false)

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

  const parts = transcript?.parts ?? []
  const activePart = parts[activeOrdinal] ?? null

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
          roleDesc: 'חבר כנסת (לא חבר ועדה)',
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

  const seatsMembers = useMemo(
    (): CommitteeMember[] =>
      seatsMembersBase.map((member) => ({
        ...member,
        factionName:
          factionByPersonId.get(member.personId) ?? member.factionName,
      })),
    [seatsMembersBase, factionByPersonId],
  )

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

  const selectedMemberOrdinals = useMemo(() => {
    if (selectedPersonId == null) {
      return [] as number[]
    }
    return parts
      .filter((part) =>
        partBelongsToPerson(part, selectedPersonId, seatsMembers),
      )
      .map((part) => part.ordinal)
  }, [parts, selectedPersonId, seatsMembers])

  // Auto-select first committee that has a ready transcript.
  useEffect(() => {
    if (bootstrapped || committeesLoading || committees.length === 0) {
      return
    }
    if (!selectedCommittee) {
      setSelectedCommittee(committees[0] ?? null)
    }
    setBootstrapped(true)
  }, [bootstrapped, committees, committeesLoading, selectedCommittee])

  // When sessions load, auto-select newest.
  useEffect(() => {
    if (!selectedCommittee) {
      setSelectedSession(null)
      return
    }
    if (sessionsLoading) {
      return
    }
    if (sessions.length === 0) {
      setSelectedSession(null)
      return
    }
    setSelectedSession((prev) => {
      if (prev && sessions.some((s) => s.id === prev.id)) {
        return sessions.find((s) => s.id === prev.id) ?? sessions[0] ?? null
      }
      return sessions[0] ?? null
    })
  }, [selectedCommittee, sessions, sessionsLoading])

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
    const ordinals = parts
      .filter((part) =>
        partBelongsToPerson(part, selectedPersonId, seatsMembers),
      )
      .map((part) => part.ordinal)
    if (ordinals.length === 0) {
      return
    }
    setActiveOrdinal(ordinals[0]!)
    // Only re-run when the selected person changes, not on every play tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPersonId])

  // Play ticker — delivers the next message every 3s.
  useEffect(() => {
    if (!playing || parts.length === 0) {
      return
    }
    const id = window.setInterval(() => {
      setActiveOrdinal((prev) => {
        if (prev >= parts.length - 1) {
          setPlaying(false)
          return prev
        }
        return prev + 1
      })
    }, PLAY_INTERVAL_MS)
    return () => window.clearInterval(id)
  }, [playing, parts.length])

  const pageError =
    committeesError ||
    sessionsError ||
    membersError ||
    attendanceError ||
    transcriptError
  const hasParts = parts.length > 0
  const loadingTable = membersLoading || attendanceLoading || committeesLoading

  function selectPerson(personId: number | null) {
    setPlaying(false)
    setSelectedPersonId((prev) => (prev === personId ? null : personId))
  }

  function jumpToNextSelectedMemberMessage() {
    if (selectedMemberOrdinals.length === 0) {
      return
    }
    setPlaying(false)
    const next =
      selectedMemberOrdinals.find((ordinal) => ordinal > activeOrdinal) ??
      selectedMemberOrdinals[0]!
    setActiveOrdinal(next)
  }

  return (
    <SiteLayout className="committees-page">
      <main className="committees-page__main">
        <section
          className="committees-page__section"
          aria-labelledby="committees-title"
        >
          <div className="committees-page__inner container">
            <header className="committees-page__header">
              <div className="committees-page__title-row">
                <h1 id="committees-title" className="committees-page__title">
                  ועדות הכנסת
                </h1>
                <Link href="/knesset" className="committees-page__back">
                  ← חזרה לכנסת
                </Link>
              </div>
              <p className="committees-page__subtitle">
                בחרו ועדה וישיבה, צפו בחברי הוועדה סביב השולחן, והפעילו את
                התמליל כשיחה
              </p>

              <div className="committees-page__controls">
                <CommitteeSelectMenu
                  label="ועדה"
                  ariaLabel="בחירת ועדה"
                  value={selectedCommittee ? String(selectedCommittee.id) : ''}
                  disabled={committeesLoading || committees.length === 0}
                  placeholder={
                    committeesLoading
                      ? 'טוען ועדות…'
                      : 'אין ועדות עם תמליל'
                  }
                  options={committees.map((committee) => ({
                    value: String(committee.id),
                    label: committee.name,
                  }))}
                  onChange={(nextValue) => {
                    const next = committees.find(
                      (c) => c.id === Number(nextValue),
                    )
                    setSelectedCommittee(next ?? null)
                  }}
                />

                <CommitteeSelectMenu
                  label="ישיבה"
                  ariaLabel="בחירת ישיבה"
                  value={selectedSession ? String(selectedSession.id) : ''}
                  disabled={sessionsLoading || sessions.length === 0}
                  placeholder={
                    withTranscriptOnly
                      ? 'אין ישיבות עם תמליל'
                      : 'אין ישיבות'
                  }
                  options={sessions.map((session) => ({
                    value: String(session.id),
                    label: formatCommitteeSessionLabel(session),
                  }))}
                  onChange={(nextValue) => {
                    const next = sessions.find(
                      (s) => s.id === Number(nextValue),
                    )
                    setSelectedSession(next ?? null)
                  }}
                />

                <label className="committees-page__toggle">
                  <input
                    type="checkbox"
                    checked={withTranscriptOnly}
                    onChange={(event) =>
                      setWithTranscriptOnly(event.target.checked)
                    }
                  />
                  <span>רק ישיבות עם תמליל</span>
                </label>
              </div>
            </header>

            {pageError ? (
              <p className="committees-page__error" role="alert">
                לא ניתן לטעון את נתוני הוועדות
              </p>
            ) : null}

            <div className="committees-page__stage">
              <div className="committees-page__stage-table">
                <CommitteeTable
                  seats={seats}
                  overflowCount={overflowCount}
                  speakingPersonId={speakingPersonId}
                  selectedPersonId={selectedPersonId}
                  onSelectPerson={selectPerson}
                  loading={loadingTable}
                />
              </div>

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
                onPlayPause={() => {
                  if (!hasParts) {
                    return
                  }
                  setPlaying((prev) => !prev)
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
            </div>
          </div>
        </section>
      </main>
    </SiteLayout>
  )
}

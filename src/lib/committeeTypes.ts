export type CommitteeSeatRole =
  | 'chair'
  | 'member'
  | 'alternate'
  | 'observer'
  | 'legal_counsel'
  | 'committee_manager'

export type KnessetCommittee = {
  id: number
  knessetCommitteeId: number
  knessetId: number
  name: string
  committeeTypeId: number | null
  committeeTypeDesc: string | null
  isCurrent: boolean
  /** Ready-transcript sessions for this committee. */
  sessionCount: number
  /** Latest ready-transcript session start time (ISO), if any. */
  latestSessionAt: string | null
  /** Current chair full name, when membership data exists. */
  chairName: string | null
  /** Current chair photo URL for the committee list avatar. */
  chairImageUrl: string | null
}

export type KnessetCommitteeRow = {
  id: number
  knesset_committee_id: number
  knesset_id: number
  name: string
  committee_type_id: number | null
  committee_type_desc: string | null
  is_current: boolean
}

export type CommitteeSession = {
  id: number
  knessetSessionId: number
  committeeId: number
  sessionNumber: number | null
  sessionTypeDesc: string | null
  statusDesc: string | null
  location: string | null
  startAt: string | null
  finishAt: string | null
  hasTranscript: boolean
  /** Agenda text from protocol part header סדר היום, when available. */
  agenda: string | null
  /** Transcript parts count (chat messages), when known. */
  messageCount: number | null
}

export type CommitteeSessionRow = {
  id: number
  knesset_session_id: number
  committee_id: number
  session_number: number | null
  session_type_desc: string | null
  status_desc: string | null
  location: string | null
  start_at: string | null
  finish_at: string | null
}

export type CommitteeMember = {
  id: number
  committeeId: number
  personId: number
  fullName: string
  imageUrl: string | null
  factionName: string | null
  seatRole: CommitteeSeatRole
  roleDesc: string | null
  startDate: string | null
  endDate: string | null
  /** Guest MK from protocol attendance who is not a committee member. */
  isGuestMk?: boolean
  firstElectedYear?: number | null
  totalDaysInKnesset?: number
  totalYearsInKnesset?: number
}

export type CommitteeMembershipRow = {
  id: number
  committee_id: number
  person_id: number
  seat_role: CommitteeSeatRole
  role_desc: string | null
  start_date: string | null
  end_date: string | null
  person:
    | {
        full_name: string
        image_url: string | null
      }
    | {
        full_name: string
        image_url: string | null
      }[]
    | null
}

export type CommitteeTranscriptPart = {
  id: number
  transcriptId: number
  sessionId: number
  ordinal: number
  speakerHeader: string | null
  personId: number | null
  fullName: string | null
  imageUrl: string | null
  body: string
}

export type CommitteeTranscriptPartRow = {
  id: number
  transcript_id: number
  session_id: number
  ordinal: number
  speaker_header: string | null
  person_id: number | null
  body: string
  person:
    | {
        full_name: string
        image_url: string | null
      }
    | {
        full_name: string
        image_url: string | null
      }[]
    | null
}

export type CommitteeTranscript = {
  id: number
  sessionId: number
  parseStatus: string
  fullText: string | null
  parts: CommitteeTranscriptPart[]
}

export const COMMITTEES_KNESSET_NUMBER = 25

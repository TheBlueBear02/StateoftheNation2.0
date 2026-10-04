'use client'

import type { KnessetCommittee } from '../../lib/committeeTypes'
import type { CommitteeSession } from '../../lib/committeeTypes'
import {
  formatCommitteeDateOnly,
  formatCommitteeSessionWhen,
} from '../../hooks/useCommitteeSessions'
import { initialsFromName } from '../../lib/committeeTableLayout'

type CommitteeListProps = {
  mode: 'committees'
  committees: KnessetCommittee[]
  loading?: boolean
  onSelectCommittee: (committee: KnessetCommittee) => void
}

type SessionListProps = {
  mode: 'sessions'
  committeeName: string
  sessions: CommitteeSession[]
  loading?: boolean
  onSelectSession: (session: CommitteeSession) => void
  onBack: () => void
}

type CommitteeChatPickerProps = CommitteeListProps | SessionListProps

function committeeAvatarLabel(name: string): string {
  const cleaned = name.replace(/^ועדת\s+/u, '').trim()
  return initialsFromName(cleaned || name)
}

export function CommitteeChatPicker(props: CommitteeChatPickerProps) {
  const isSessions = props.mode === 'sessions'

  return (
    <section
      className="committee-chat committee-chat--picker"
      aria-label={isSessions ? 'בחירת ישיבה' : 'בחירת ועדה'}
    >
      <header className="committee-chat__header">
        <div className="committee-chat__header-bar">
          {isSessions ? (
            <button
              type="button"
              className="committee-chat__back"
              onClick={props.onBack}
              aria-label="חזרה לוועדות"
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
          <div className="committee-chat__header-main">
            <h2 className="committee-chat__title">
              {isSessions ? props.committeeName : 'ועדות הכנסת'}
            </h2>
            <p className="committee-chat__session-when">
              {isSessions
                ? 'בחרו ישיבה עם תמליל'
                : 'בחרו ועדה על מנת לצפות בישיבות שלה'}
            </p>
          </div>
        </div>
      </header>

      <div className="committee-chat-picker__list" role="list">
        {props.loading ? (
          <p className="committee-chat-picker__empty">טוען…</p>
        ) : isSessions ? (
          props.sessions.length === 0 ? (
            <p className="committee-chat-picker__empty">
              אין ישיבות עם תמליל לוועדה זו
            </p>
          ) : (
            props.sessions.map((session) => {
              const sessionLabel =
                session.sessionNumber != null
                  ? `ישיבה ${session.sessionNumber}`
                  : 'ישיבה'
              const title = session.agenda?.trim() || sessionLabel

              return (
                <button
                  key={session.id}
                  type="button"
                  className="committee-chat-picker__row committee-chat-picker__row--session"
                  role="listitem"
                  onClick={() => props.onSelectSession(session)}
                >
                  <span
                    className="committee-chat-picker__avatar committee-chat-picker__avatar--session"
                    aria-hidden
                  >
                    {session.sessionNumber != null
                      ? String(session.sessionNumber)
                      : 'י'}
                  </span>
                  <span className="committee-chat-picker__body">
                    <span className="committee-chat-picker__name">
                      {title}
                    </span>
                    <span className="committee-chat-picker__session-bottom">
                      <span className="committee-chat-picker__when">
                        {formatCommitteeSessionWhen(session)}
                      </span>
                      {session.messageCount != null ? (
                        <span
                          className="committee-chat-picker__msg-count"
                          aria-label={
                            session.messageCount === 1
                              ? 'הודעה אחת'
                              : `${session.messageCount} הודעות`
                          }
                        >
                          {session.messageCount.toLocaleString('he-IL')}
                        </span>
                      ) : null}
                    </span>
                  </span>
                </button>
              )
            })
          )
        ) : props.committees.length === 0 ? (
          <p className="committee-chat-picker__empty">אין ועדות עם תמליל</p>
        ) : (
          props.committees.map((committee) => (
            <button
              key={committee.id}
              type="button"
              className="committee-chat-picker__row committee-chat-picker__row--committee"
              role="listitem"
              onClick={() => props.onSelectCommittee(committee)}
            >
              <span className="committee-chat-picker__avatar" aria-hidden>
                {committee.chairImageUrl ? (
                  <img
                    className="committee-chat-picker__avatar-photo"
                    src={committee.chairImageUrl}
                    alt=""
                  />
                ) : (
                  committeeAvatarLabel(committee.name)
                )}
              </span>
              <span className="committee-chat-picker__body">
                <span className="committee-chat-picker__session-top">
                  <span className="committee-chat-picker__name-line">
                    <span className="committee-chat-picker__name">
                      {committee.name}
                    </span>
                    {committee.committeeTypeDesc?.trim() ? (
                      <span className="committee-chat-picker__type">
                        {committee.committeeTypeDesc.trim()}
                      </span>
                    ) : null}
                  </span>
                  <span
                    className="committee-chat-picker__count-badge"
                    aria-label={
                      committee.sessionCount === 1
                        ? 'ישיבה אחת עם תמליל'
                        : `${committee.sessionCount} ישיבות עם תמליל`
                    }
                  >
                    <span className="committee-chat-picker__count-badge-num">
                      {committee.sessionCount}
                    </span>
                  </span>
                </span>
                <span className="committee-chat-picker__when">
                  {`ישיבה אחרונה: ${formatCommitteeDateOnly(committee.latestSessionAt)}`}
                </span>
              </span>
            </button>
          ))
        )}
      </div>
    </section>
  )
}

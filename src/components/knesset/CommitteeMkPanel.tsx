'use client'

import type { CommitteeMember } from '../../lib/committeeTypes'
import type { CommitteeTranscriptPart } from '../../lib/committeeTypes'
import { initialsFromName } from '../../lib/committeeTableLayout'

type CommitteeMkPanelProps = {
  member: CommitteeMember | null
  parts: CommitteeTranscriptPart[]
  onClose: () => void
  onJumpToOrdinal: (ordinal: number) => void
}

export function CommitteeMkPanel({
  member,
  parts,
  onClose,
  onJumpToOrdinal,
}: CommitteeMkPanelProps) {
  if (!member) {
    return null
  }

  return (
    <aside
      className="committee-mk-panel"
      aria-label={`תמליל של ${member.fullName}`}
    >
      <header className="committee-mk-panel__header">
        <div className="committee-mk-panel__identity">
          {member.imageUrl ? (
            <img
              className="committee-mk-panel__photo"
              src={member.imageUrl}
              alt=""
            />
          ) : (
            <div className="committee-mk-panel__photo committee-mk-panel__photo--placeholder">
              {initialsFromName(member.fullName)}
            </div>
          )}
          <div>
            <h2 className="committee-mk-panel__name">{member.fullName}</h2>
            {member.roleDesc ? (
              <p className="committee-mk-panel__role">{member.roleDesc}</p>
            ) : null}
          </div>
        </div>
        <button
          type="button"
          className="committee-mk-panel__close"
          onClick={onClose}
          aria-label="סגור"
        >
          ✕
        </button>
      </header>

      <p className="committee-mk-panel__count">
        {parts.length === 0
          ? 'אין קטעי דיבור מזוהים לחבר/ת כנסת זה בישיבה'
          : `${parts.length} קטעים בישיבה זו`}
      </p>

      <ul className="committee-mk-panel__list">
        {parts.map((part) => (
          <li key={part.id}>
            <button
              type="button"
              className="committee-mk-panel__part"
              onClick={() => onJumpToOrdinal(part.ordinal)}
            >
              <span className="committee-mk-panel__ordinal">
                #{part.ordinal + 1}
              </span>
              <span className="committee-mk-panel__excerpt">
                {part.body.length > 180
                  ? `${part.body.slice(0, 180)}…`
                  : part.body}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </aside>
  )
}

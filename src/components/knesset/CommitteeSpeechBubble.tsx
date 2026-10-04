'use client'

import type { CommitteeTranscriptPart } from '../../lib/committeeTypes'

type CommitteeSpeechBubbleProps = {
  part: CommitteeTranscriptPart | null
}

export function CommitteeSpeechBubble({ part }: CommitteeSpeechBubbleProps) {
  if (!part) {
    return (
      <div className="committee-speech" aria-live="polite">
        <p className="committee-speech__empty">לחצו נגן כדי לשמוע את התמליל</p>
      </div>
    )
  }

  const speaker =
    part.fullName ?? part.speakerHeader ?? 'דובר/ת לא מזוהה'

  return (
    <div className="committee-speech" aria-live="polite">
      <p className="committee-speech__speaker">{speaker}</p>
      <p className="committee-speech__body">{part.body}</p>
    </div>
  )
}

import { useRef, useState } from 'react'
import { toPng } from 'html-to-image'
import type { ElectionCandidate } from '../../../hooks/useElectionCandidates'
import type { ElectionParty } from '../../../lib/supabase'
import { getInitials } from '../../../lib/hemicycle'
import type { CandidateRating } from '../../../lib/listFitScore'
import { ShareableListReport } from './ShareableListReport'

type ListFitReportProps = {
  party: ElectionParty
  candidates: ElectionCandidate[]
  ratings: Map<number, CandidateRating>
  score: number
  counts: { green: number; orange: number; red: number }
  onRestart: () => void
}

function downloadDataUrl(dataUrl: string, filename: string) {
  const link = document.createElement('a')
  link.download = filename
  link.href = dataUrl
  link.click()
}

async function shareOrDownload(
  dataUrl: string,
  filename: string,
): Promise<'shared' | 'downloaded'> {
  const response = await fetch(dataUrl)
  const blob = await response.blob()
  const file = new File([blob], filename, { type: 'image/png' })

  if (
    typeof navigator.canShare === 'function' &&
    navigator.canShare({ files: [file] })
  ) {
    try {
      await navigator.share({
        files: [file],
        title: 'משחק הרשימות · מצב האומה',
        text: 'בדקו עד כמה הרשימה מתאימה לכם',
      })
      return 'shared'
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return 'shared'
      }
    }
  }

  downloadDataUrl(dataUrl, filename)
  return 'downloaded'
}

export function ListFitReport({
  party,
  candidates,
  ratings,
  score,
  counts,
  onRestart,
}: ListFitReportProps) {
  const shareRef = useRef<HTMLDivElement>(null)
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)
  const displayName = party.shortName ?? party.name
  const filename = `lists-${party.shortName ?? party.id}-fit.png`

  const handleExport = async () => {
    const node = shareRef.current
    if (!node || exporting) return

    setExporting(true)
    setExportError(null)

    try {
      const dataUrl = await toPng(node, {
        cacheBust: true,
        pixelRatio: 2,
        backgroundColor: '#0a1628',
      })
      await shareOrDownload(dataUrl, filename)
    } catch {
      setExportError('לא ניתן לייצא את התמונה. נסו שוב או בדקו חיבור לתמונות.')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="lists-report">
      <article className="lists-report__card" aria-label="דוח התאמה">
        <button
          type="button"
          className="lists-report__share"
          onClick={() => {
            void handleExport()
          }}
          disabled={exporting}
          aria-label={exporting ? 'מייצא תמונה…' : 'הורד תמונה לשיתוף'}
          title="הורד תמונה לשיתוף"
        >
          <svg
            className="lists-report__share-icon"
            viewBox="0 0 24 24"
            width="22"
            height="22"
            aria-hidden="true"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="18" cy="5" r="3" />
            <circle cx="6" cy="12" r="3" />
            <circle cx="18" cy="19" r="3" />
            <path d="M8.59 13.51 15.42 17.49" />
            <path d="M15.41 6.51 8.59 10.49" />
          </svg>
        </button>

        <img
          className="lists-report__site-logo"
          src="/while-logo-nobg.svg"
          alt="מצב האומה"
          width={122}
          height={40}
        />

        <div className="lists-report__score">
          <p className="lists-report__score-value" aria-live="polite">
            {score}
            <span className="lists-report__score-suffix">/100</span>
          </p>
          <p className="lists-report__score-label">
            מידת ההתאמה של רשימת {displayName} אליכם
          </p>
          <ul className="lists-report__counts">
            <li className="lists-report__count lists-report__count--green">
              <strong>{counts.green}</strong> רוצה בכנסת
            </li>
            <li className="lists-report__count lists-report__count--orange">
              <strong>{counts.orange}</strong> לא יודע
            </li>
            <li className="lists-report__count lists-report__count--red">
              <strong>{counts.red}</strong> לא רוצה
            </li>
          </ul>
        </div>

        <ul className="lists-report__grid" aria-label="דירוגי מועמדים">
          {candidates.map((candidate) => {
            const rating = ratings.get(candidate.id) ?? 'orange'
            return (
              <li
                key={candidate.id}
                className={`lists-report__person lists-report__person--${rating}`}
                aria-label={`מקום ${candidate.listPosition}. ${candidate.fullName}`}
              >
                <span className="lists-report__position" aria-hidden="true">
                  {candidate.listPosition}
                </span>
                {candidate.imageUrl ? (
                  <img
                    className="lists-report__face"
                    src={candidate.imageUrl}
                    alt=""
                    loading="lazy"
                  />
                ) : (
                  <span
                    className="lists-report__face lists-report__face--initials"
                    aria-hidden="true"
                  >
                    {getInitials(candidate.fullName)}
                  </span>
                )}
              </li>
            )
          })}
        </ul>
      </article>

      <div className="lists-report__footer">
        <div className="lists-report__actions">
          <button type="button" className="lists-game__secondary" onClick={onRestart}>
            בחר מפלגה אחרת
          </button>
          {exportError ? (
            <p className="lists-game__error" role="alert">
              {exportError}
            </p>
          ) : null}
        </div>

        <p className="lists-report__score-note">
          איך מחושב הציון? לכל דירוג יש נקודות: רוצה בכנסת 1, לא יודע חצי
          נקודה, לא רוצה 0. מקומות גבוהים יותר ברשימה משקלים יותר, כי סביר
          יותר שיגיעו לכנסת. הציון הוא ממוצע משוקלל של כל הדירוגים, בין 0 ל 100.
        </p>
      </div>

      <div className="lists-share-card-host" aria-hidden="true">
        <ShareableListReport
          ref={shareRef}
          partyName={displayName}
          candidates={candidates}
          ratings={ratings}
          score={score}
          counts={counts}
        />
      </div>
    </div>
  )
}

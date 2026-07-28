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
        backgroundColor: '#ffffff',
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
      <header className="lists-report__header">
        <img
          className="lists-report__site-logo"
          src="/header-logo%203.svg"
          alt="מצב האומה"
          width={122}
          height={40}
        />
        <div className="lists-report__party">
          {party.logoUrl ? (
            <img
              className="lists-report__party-logo"
              src={party.logoUrl}
              alt=""
            />
          ) : (
            <span
              className="lists-report__party-swatch"
              style={{ background: party.color ?? '#4890fd' }}
              aria-hidden="true"
            />
          )}
          <div>
            <p className="lists-report__eyebrow">דוח התאמה</p>
            <h2 className="lists-report__title">{displayName}</h2>
            <p className="lists-report__subtitle">{party.name}</p>
          </div>
        </div>
      </header>

      <div className="lists-report__score-panel">
        <p className="lists-report__score-label">מידת ההתאמה של הרשימה אליכם</p>
        <p className="lists-report__score" aria-live="polite">
          {score}
          <span className="lists-report__score-suffix">/100</span>
        </p>
        <ul className="lists-report__counts">
          <li className="lists-report__count lists-report__count--green">
            <strong>{counts.green}</strong> רוצה לראות
          </li>
          <li className="lists-report__count lists-report__count--orange">
            <strong>{counts.orange}</strong> לא יודע
          </li>
          <li className="lists-report__count lists-report__count--red">
            <strong>{counts.red}</strong> לא רוצה
          </li>
        </ul>
      </div>

      <section className="lists-report__faces" aria-label="דירוגי מועמדים">
        <ul className="lists-report__grid">
          {candidates.map((candidate) => {
            const rating = ratings.get(candidate.id) ?? 'orange'
            return (
              <li
                key={candidate.id}
                className={`lists-report__person lists-report__person--${rating}`}
              >
                {candidate.imageUrl ? (
                  <img
                    className="lists-report__face"
                    src={candidate.imageUrl}
                    alt={candidate.fullName}
                    loading="lazy"
                  />
                ) : (
                  <span className="lists-report__face lists-report__face--initials">
                    {getInitials(candidate.fullName)}
                  </span>
                )}
                <span className="lists-report__person-pos">
                  {candidate.listPosition}
                </span>
                <span className="lists-report__person-name">
                  {candidate.fullName}
                </span>
              </li>
            )
          })}
        </ul>
      </section>

      <div className="lists-report__actions">
        <button
          type="button"
          className="lists-game__primary"
          onClick={() => {
            void handleExport()
          }}
          disabled={exporting}
        >
          {exporting ? 'מייצא תמונה…' : 'הורד תמונה לשיתוף'}
        </button>
        <button type="button" className="lists-game__secondary" onClick={onRestart}>
          בחר מפלגה אחרת
        </button>
        {exportError ? (
          <p className="lists-game__error" role="alert">
            {exportError}
          </p>
        ) : null}
      </div>

      {/* Offscreen card used for PNG export */}
      <div className="lists-share-card-host" aria-hidden="true">
        <ShareableListReport
          ref={shareRef}
          party={party}
          candidates={candidates}
          ratings={ratings}
          score={score}
          counts={counts}
        />
      </div>
    </div>
  )
}

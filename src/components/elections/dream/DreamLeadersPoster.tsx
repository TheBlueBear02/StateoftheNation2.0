'use client'

import { useEffect, useRef, useState } from 'react'
import { getInitials } from '../../../lib/hemicycle'
import {
  DREAM_MINISTER_OFFICES,
  DREAM_PM_OFFICE,
  type DreamOffice,
} from '../../../lib/dreamGovernmentOffices'
import type {
  DreamDashboardLeader,
  DreamDashboardOfficeBoard,
} from '../../../lib/fetchDreamCabinetDashboard'
import { exportNodeToPng } from '../../../lib/inlineImagesForExport'
import { getSiteUrl } from '../../../lib/runtimeEnv'
import { sharePngImage } from '../../../lib/sharePngImage'
import { getDreamPickPopularity } from './DreamOfficeSquare'

const TOP_N = 3

type DreamLeadersPosterProps = {
  offices: DreamDashboardOfficeBoard[]
  uniqueVoters: number
}

export function DreamLeadersPoster({
  offices,
  uniqueVoters,
}: DreamLeadersPosterProps) {
  const posterRef = useRef<HTMLDivElement>(null)
  const [exporting, setExporting] = useState(false)
  const [copiedFlash, setCopiedFlash] = useState(false)
  const [shareError, setShareError] = useState<string | null>(null)
  const byId = new Map(offices.map((office) => [office.officeId, office]))

  useEffect(() => {
    if (!copiedFlash) return
    const timer = window.setTimeout(() => {
      setCopiedFlash(false)
    }, 2500)
    return () => window.clearTimeout(timer)
  }, [copiedFlash])

  const handleShare = async () => {
    const node = posterRef.current
    if (!node || exporting || copiedFlash) return

    setExporting(true)
    setCopiedFlash(false)
    setShareError(null)

    try {
      const shareResult = await sharePngImage({
        filename: 'dream-government-leaders.png',
        shareTitle: 'המובילים בממשלת החלומות · מצב האומה',
        shareText: `שלושת המועמדים המובילים בכל משרד\n${getSiteUrl()}/elections/dream-government`,
        makeBlob: async () => {
          const dataUrl = await exportNodeToPng(node, {
            pixelRatio: 2,
            backgroundColor: '#040a14',
            skipAutoScale: true,
          })
          const response = await fetch(dataUrl)
          return response.blob()
        },
      })

      if (!shareResult.ok) {
        throw new Error(shareResult.error)
      }

      if (shareResult.method === 'clipboard') {
        setCopiedFlash(true)
      } else if (shareResult.method === 'download') {
        setShareError(
          'התמונה נפתחה או הורדה — במובייל לחצו לחיצה ארוכה כדי לשתף או לשמור',
        )
      }
    } catch (error) {
      console.error('[dream-government] leaders poster export failed', error)
      setShareError('לא ניתן לייצא את התמונה. נסו שוב או בדקו חיבור לתמונות.')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="dream-leaders-poster-shell">
      <button
        type="button"
        className={
          copiedFlash
            ? 'dream-leaders-poster__share dream-leaders-poster__share--copied'
            : 'dream-leaders-poster__share'
        }
        onClick={() => {
          void handleShare()
        }}
        disabled={exporting || copiedFlash}
        aria-label={
          copiedFlash
            ? 'הועתק ללוח'
            : exporting
              ? 'מייצא תמונה…'
              : 'שתפו את פוסטר המובילים'
        }
        title={
          copiedFlash ? 'הועתק ללוח' : 'שתפו את פוסטר המובילים'
        }
      >
        {copiedFlash ? (
          <span className="dream-leaders-poster__share-copied" role="status">
            הועתק ללוח
          </span>
        ) : (
          <svg
            className="dream-leaders-poster__share-icon"
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
            <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
            <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
          </svg>
        )}
      </button>

      <div ref={posterRef} className="dream-leaders-poster" dir="rtl">
        <img
          className="dream-leaders-poster__bg-art"
          src="/dream-government-bg.png?v=3"
          alt=""
          aria-hidden="true"
          draggable={false}
        />
        <img
          className="dream-leaders-poster__site-logo"
          src="/while-logo-nobg.svg"
          alt=""
          width={168}
          height={55}
        />

        <header className="dream-leaders-poster__header">
          <h3 className="dream-leaders-poster__title">
            המובילים בממשלת החלומות
          </h3>
          <p className="dream-leaders-poster__subtitle">
            שלושת המועמדים המובילים בכל משרד
          </p>
        </header>

        <div className="dream-leaders-poster__pm">
          <OfficeTopThree
            office={DREAM_PM_OFFICE}
            leaders={topLeaders(byId.get('pm'))}
          />
        </div>

        <ul className="dream-leaders-poster__grid">
          {DREAM_MINISTER_OFFICES.map((office) => (
            <li key={office.id}>
              <OfficeTopThree
                office={office}
                leaders={topLeaders(byId.get(office.id))}
              />
            </li>
          ))}
        </ul>

        <p className="dream-leaders-poster__cta">
          מבוסס על {formatNumber(uniqueVoters)} מצביעים ייחודיים
          <span className="dream-leaders-poster__cta-url">
            www.stateofthenation.co.il
          </span>
        </p>
      </div>

      {shareError ? (
        <p className="dream-leaders-poster__share-error" role="alert">
          {shareError}
        </p>
      ) : null}
    </div>
  )
}

function topLeaders(
  board: DreamDashboardOfficeBoard | undefined,
): Array<DreamDashboardLeader | null> {
  const leaders = board?.leaders.slice(0, TOP_N) ?? []
  const slots: Array<DreamDashboardLeader | null> = [...leaders]
  while (slots.length < TOP_N) slots.push(null)
  return slots
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('he-IL').format(value)
}

function OfficeTopThree({
  office,
  leaders,
}: {
  office: DreamOffice
  leaders: Array<DreamDashboardLeader | null>
}) {
  // Podium order: 2nd · 1st · 3rd (leader centered)
  const podium = [
    { leader: leaders[1] ?? null, rank: 2 },
    { leader: leaders[0] ?? null, rank: 1 },
    { leader: leaders[2] ?? null, rank: 3 },
  ]

  return (
    <div
      className={
        office.isPm
          ? 'dream-leaders-office dream-leaders-office--pm'
          : 'dream-leaders-office'
      }
    >
      <p className="dream-leaders-office__title">{office.label}</p>
      <ol className="dream-leaders-office__trio">
        {podium.map(({ leader, rank }) => (
          <li
            key={`${office.id}-${rank}`}
            className={
              rank === 1
                ? 'dream-leaders-face dream-leaders-face--leader'
                : 'dream-leaders-face'
            }
          >
            <div className="dream-leaders-face__portrait">
              {leader?.imageUrl ? (
                <img
                  src={leader.imageUrl}
                  alt=""
                  className="dream-leaders-face__photo"
                />
              ) : leader ? (
                <span className="dream-leaders-face__initials">
                  {getInitials(leader.fullName)}
                </span>
              ) : (
                <span className="dream-leaders-face__empty">—</span>
              )}
              {leader ? (
                <span
                  className={`dream-leaders-face__pct dream-leaders-face__pct--${getDreamPickPopularity(leader.percentage)}`}
                >
                  {leader.percentage}%
                </span>
              ) : null}
              <span className="dream-leaders-face__rank" aria-hidden="true">
                {rank}
              </span>
            </div>
            {leader ? (
              <>
                <p className="dream-leaders-face__name">{leader.fullName}</p>
                <p className="dream-leaders-face__party">
                  {leader.partyShortName || leader.partyName || '—'}
                </p>
              </>
            ) : (
              <p className="dream-leaders-face__name dream-leaders-face__name--empty">
                אין נתונים
              </p>
            )}
          </li>
        ))}
      </ol>
    </div>
  )
}

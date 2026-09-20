'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { SiteLayout } from '../components/SiteLayout'
import { PageBreadcrumb } from '../components/PageBreadcrumb'
import { DreamOfficePickerModal } from '../components/elections/dream/DreamOfficePickerModal'
import {
  DreamOfficeSquare,
  type DreamOfficeSelection,
} from '../components/elections/dream/DreamOfficeSquare'
import { ShareableGovernment } from '../components/elections/dream/ShareableGovernment'
import { useDreamCabinetStats } from '../hooks/useDreamCabinetStats'
import { useElectionParties } from '../hooks/useElectionParties'
import {
  getOrCreateDreamGovClientId,
  hasSharedDreamGovernment,
  markDreamGovernmentShared,
} from '../lib/dreamGovClientId'
import {
  loadDreamGovPicksFromCookie,
  saveDreamGovPicksToCookie,
} from '../lib/dreamGovPicksCookie'
import {
  DREAM_ALL_OFFICES,
  DREAM_MINISTER_OFFICES,
  DREAM_PM_OFFICE,
  type DreamOffice,
  type DreamOfficeId,
} from '../lib/dreamGovernmentOffices'
import { fetchElectionCandidates } from '../lib/fetchElectionCandidates'
import {
  getDreamPickStatForDisplay,
  submitDreamCabinetPicks,
} from '../lib/fetchDreamCabinetStats'
import {
  USE_DREAM_GOV_MOCK_STATS,
  buildMockDreamPickPercentages,
  mockDreamPickStat,
} from '../lib/dreamGovMockStats'
import { exportNodeToPng } from '../lib/inlineImagesForExport'
import { supabase } from '../lib/supabase'
import './DreamGovernmentPage.css'

function downloadDataUrl(dataUrl: string, filename: string) {
  const link = document.createElement('a')
  link.download = filename
  link.href = dataUrl
  link.click()
}

async function copyImageToClipboard(blob: Blob): Promise<boolean> {
  if (
    typeof navigator === 'undefined' ||
    !navigator.clipboard ||
    typeof ClipboardItem === 'undefined'
  ) {
    return false
  }

  try {
    await navigator.clipboard.write([
      new ClipboardItem({ 'image/png': blob }),
    ])
    return true
  } catch {
    return false
  }
}

export function DreamGovernmentPage() {
  const { parties, loading: partiesLoading, error: partiesError } =
    useElectionParties()
  const {
    stats,
    refetch: refetchStats,
    applyLocalPicks,
  } = useDreamCabinetStats()
  const shareRef = useRef<HTMLDivElement>(null)

  const [selections, setSelections] = useState<
    Partial<Record<DreamOfficeId, DreamOfficeSelection>>
  >({})
  const [picksReady, setPicksReady] = useState(false)
  const [activeOffice, setActiveOffice] = useState<DreamOffice | null>(null)
  const [exporting, setExporting] = useState(false)
  const [copiedFlash, setCopiedFlash] = useState(false)
  const [shareError, setShareError] = useState<string | null>(null)
  const [showPickStats, setShowPickStats] = useState(
    () => USE_DREAM_GOV_MOCK_STATS,
  )
  const [mockPercentages] = useState(buildMockDreamPickPercentages)

  const filledCount = useMemo(
    () => Object.keys(selections).length,
    [selections],
  )

  useEffect(() => {
    if (USE_DREAM_GOV_MOCK_STATS) {
      setShowPickStats(true)
      return
    }
    setShowPickStats(hasSharedDreamGovernment())
  }, [])

  // Restore cabinet picks from cookie once party list is available.
  useEffect(() => {
    if (picksReady) return
    if (partiesLoading) return
    if (partiesError) {
      setPicksReady(true)
      return
    }

    const stored = loadDreamGovPicksFromCookie()
    if (stored.length === 0 || !supabase) {
      setPicksReady(true)
      return
    }

    let cancelled = false

    void (async () => {
      const partyIds = [...new Set(stored.map((pick) => pick.partyId))]
      const candidatesByParty = new Map<
        number,
        Awaited<ReturnType<typeof fetchElectionCandidates>>['candidates']
      >()

      await Promise.all(
        partyIds.map(async (partyId) => {
          const result = await fetchElectionCandidates(supabase, partyId)
          candidatesByParty.set(partyId, result.candidates)
        }),
      )

      if (cancelled) return

      const next: Partial<Record<DreamOfficeId, DreamOfficeSelection>> = {}
      for (const pick of stored) {
        const party = parties.find((row) => row.id === pick.partyId)
        const candidate = candidatesByParty
          .get(pick.partyId)
          ?.find((row) => row.id === pick.candidateId)
        if (!party || !candidate) continue
        next[pick.officeId] = { candidate, party }
      }

      setSelections(next)
      setPicksReady(true)
    })()

    return () => {
      cancelled = true
    }
  }, [parties, partiesError, partiesLoading, picksReady])

  // Persist picks to cookie after hydration (and on every later change).
  useEffect(() => {
    if (!picksReady) return
    saveDreamGovPicksToCookie(selections)
  }, [selections, picksReady])

  const pickStatFor = (officeId: DreamOfficeId) => {
    if (!showPickStats) return null
    const selection = selections[officeId]
    if (!selection) return null
    if (USE_DREAM_GOV_MOCK_STATS) {
      return mockDreamPickStat(mockPercentages[officeId])
    }
    return getDreamPickStatForDisplay(
      stats.offices[officeId],
      selection.candidate.id,
    )
  }

  /** Always include % on the export card for filled seats (not gated by unlock). */
  const sharePickStats = useMemo(() => {
    const next: Partial<
      Record<DreamOfficeId, ReturnType<typeof getDreamPickStatForDisplay>>
    > = {}
    for (const office of DREAM_ALL_OFFICES) {
      const selection = selections[office.id]
      if (!selection) continue
      const stat = USE_DREAM_GOV_MOCK_STATS
        ? mockDreamPickStat(mockPercentages[office.id])
        : getDreamPickStatForDisplay(
            stats.offices[office.id],
            selection.candidate.id,
          )
      if (stat) next[office.id] = stat
    }
    return next
  }, [selections, stats, mockPercentages])

  useEffect(() => {
    if (!copiedFlash) return
    const timer = window.setTimeout(() => {
      setCopiedFlash(false)
    }, 2500)
    return () => window.clearTimeout(timer)
  }, [copiedFlash])

  const handleSelect = (selection: DreamOfficeSelection) => {
    if (!activeOffice) return
    setSelections((prev) => ({
      ...prev,
      [activeOffice.id]: selection,
    }))
    setActiveOffice(null)
  }

  const handleShare = async () => {
    const node = shareRef.current
    if (!node || exporting || filledCount === 0 || copiedFlash) return

    setExporting(true)
    setCopiedFlash(false)
    setShareError(null)

    const picks = (
      Object.entries(selections) as Array<
        [DreamOfficeId, DreamOfficeSelection]
      >
    ).map(([officeId, selection]) => ({
      officeId,
      candidateId: selection.candidate.id,
    }))

    try {
      // Fold this share into local aggregates before export so the PNG
      // includes up-to-date % badges (first sharer sees 100%, etc.).
      if (picks.length > 0) {
        flushSync(() => {
          applyLocalPicks(picks)
        })
      }

      // Clone + inline off-DOM so React re-renders (setExporting) cannot
      // reset portrait <img src> back to remote URLs mid-export.
      const dataUrl = await exportNodeToPng(node, {
        pixelRatio: 2,
        backgroundColor: '#040a14',
        skipAutoScale: true,
      })
      const response = await fetch(dataUrl)
      const blob = await response.blob()
      if (blob.size < 100) {
        throw new Error('Exported image was empty')
      }
      const copied = await copyImageToClipboard(blob)

      if (copied) {
        setCopiedFlash(true)
      } else {
        downloadDataUrl(dataUrl, 'dream-government.png')
        setShareError('התמונה הורדה — העלו אותה לרשת החברתית')
      }

      markDreamGovernmentShared()
      setShowPickStats(true)

      // Best-effort: persist picks after a successful share export.
      try {
        if (picks.length > 0) {
          await submitDreamCabinetPicks({
            clientId: getOrCreateDreamGovClientId(),
            electionId: stats.electionId,
            picks,
          })
          void refetchStats()
        }
      } catch (submitError) {
        console.error('[dream-government] pick submit failed', submitError)
      }
    } catch (error) {
      console.error('[dream-government] share export failed', error)
      setShareError('לא ניתן לייצא את התמונה. נסו שוב או בדקו חיבור לתמונות.')
    } finally {
      setExporting(false)
    }
  }

  return (
    <SiteLayout className="dream-gov-page">
      <main className="dream-gov-page__main">
        <div className="dream-gov-page__inner container">
          <header className="dream-gov-page__header">
            <PageBreadcrumb
              items={[
                { label: 'בחירות 2026', to: '/elections' },
                { label: 'ממשלת החלומות', to: '/elections/dream-government' },
              ]}
            />
            <h1 className="dream-gov-page__title">
              בחרו את ממשלת החלומות שלכם
            </h1>
            <p className="dream-gov-page__subtitle">
              אם יכולתם לבחור את השרים בבחירות ישירות איך הייתה נראת הממשלה
              שלכם? לאחר שתבחרו תוכלו לראות כמה אנשים בחרו כמוכם.
            </p>
          </header>

          {partiesError ? (
            <p className="dream-gov-page__error" role="alert">
              לא ניתן לטעון את נתוני הבחירות
            </p>
          ) : null}

          {!partiesError ? (
            <div className="dream-gov-report">
              <article
                className="dream-gov-report__card"
                aria-label="ממשלת החלומות"
              >
                <img
                  className="dream-gov-report__bg-art"
                  src="/dream-government-bg.png?v=3"
                  alt=""
                  aria-hidden="true"
                  draggable={false}
                />
                <button
                  type="button"
                  className={
                    copiedFlash
                      ? 'dream-gov-report__share dream-gov-report__share--copied'
                      : 'dream-gov-report__share'
                  }
                  onClick={() => {
                    void handleShare()
                  }}
                  disabled={exporting || filledCount === 0 || copiedFlash}
                  aria-label={
                    copiedFlash
                      ? 'הועתק ללוח'
                      : exporting
                        ? 'מייצא תמונה…'
                        : 'שתפו את ממשלת החלומות שלכם'
                  }
                  title={
                    copiedFlash
                      ? 'הועתק ללוח'
                      : 'שתפו את ממשלת החלומות שלכם'
                  }
                >
                  {copiedFlash ? (
                    <span className="dream-gov-report__share-copied" role="status">
                      הועתק ללוח
                    </span>
                  ) : (
                    <svg
                      className="dream-gov-report__share-icon"
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
                  )}
                </button>

                <img
                  className="dream-gov-report__site-logo"
                  src="/while-logo-nobg.svg"
                  alt="מצב האומה"
                  width={122}
                  height={40}
                />

                <div className="dream-gov-report__heading">
                  <p className="dream-gov-report__heading-title">
                    ממשלת החלומות שלי
                  </p>
                </div>

                <div className="dream-gov-board">
                  <div className="dream-gov-board__pm">
                    <DreamOfficeSquare
                      office={DREAM_PM_OFFICE}
                      selection={selections.pm ?? null}
                      pickStat={pickStatFor('pm')}
                      onClick={() => setActiveOffice(DREAM_PM_OFFICE)}
                    />
                  </div>

                  <div className="dream-gov-board__ministers">
                    {DREAM_MINISTER_OFFICES.map((office) => (
                      <DreamOfficeSquare
                        key={office.id}
                        office={office}
                        selection={selections[office.id] ?? null}
                        pickStat={pickStatFor(office.id)}
                        onClick={() => setActiveOffice(office)}
                      />
                    ))}
                  </div>
                </div>
              </article>

              <div className="dream-gov-report__actions">
                <button
                  type="button"
                  className={
                    copiedFlash
                      ? 'dream-gov-report__share-btn dream-gov-report__share-btn--copied'
                      : 'dream-gov-report__share-btn'
                  }
                  onClick={() => {
                    void handleShare()
                  }}
                  disabled={exporting || filledCount === 0 || copiedFlash}
                >
                  {copiedFlash
                    ? 'הועתק ללוח'
                    : exporting
                      ? 'מייצא תמונה…'
                      : 'שתפו את ממשלת החלומות שלכם'}
                </button>
                {shareError ? (
                  <p className="dream-gov-page__error" role="alert">
                    {shareError}
                  </p>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      </main>

      {activeOffice ? (
        <DreamOfficePickerModal
          office={activeOffice}
          parties={parties}
          partiesLoading={partiesLoading}
          onSelect={handleSelect}
          onClose={() => setActiveOffice(null)}
        />
      ) : null}

      <div className="dream-share-card-host" aria-hidden="true">
        <ShareableGovernment
          ref={shareRef}
          selections={selections}
          pickStats={sharePickStats}
        />
      </div>
    </SiteLayout>
  )
}

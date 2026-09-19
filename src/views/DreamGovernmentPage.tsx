'use client'

import { useMemo, useRef, useState } from 'react'
import { SiteLayout } from '../components/SiteLayout'
import { PageBreadcrumb } from '../components/PageBreadcrumb'
import { DreamOfficePickerModal } from '../components/elections/dream/DreamOfficePickerModal'
import {
  DreamOfficeSquare,
  type DreamOfficeSelection,
} from '../components/elections/dream/DreamOfficeSquare'
import { ShareableGovernment } from '../components/elections/dream/ShareableGovernment'
import { useElectionParties } from '../hooks/useElectionParties'
import {
  DREAM_MINISTER_OFFICES,
  DREAM_PM_OFFICE,
  type DreamOffice,
  type DreamOfficeId,
} from '../lib/dreamGovernmentOffices'
import { exportNodeToPng } from '../lib/inlineImagesForExport'
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
  const shareRef = useRef<HTMLDivElement>(null)

  const [selections, setSelections] = useState<
    Partial<Record<DreamOfficeId, DreamOfficeSelection>>
  >({})
  const [activeOffice, setActiveOffice] = useState<DreamOffice | null>(null)
  const [exporting, setExporting] = useState(false)
  const [shareMessage, setShareMessage] = useState<string | null>(null)
  const [shareError, setShareError] = useState<string | null>(null)

  const filledCount = useMemo(
    () => Object.keys(selections).length,
    [selections],
  )

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
    if (!node || exporting || filledCount === 0) return

    setExporting(true)
    setShareMessage(null)
    setShareError(null)

    try {
      // Clone + inline off-DOM so React re-renders (setExporting) cannot
      // reset portrait <img src> back to remote URLs mid-export.
      const dataUrl = await exportNodeToPng(node, {
        pixelRatio: 2,
        backgroundColor: '#0a1628',
        skipAutoScale: true,
      })
      const response = await fetch(dataUrl)
      const blob = await response.blob()
      if (blob.size < 100) {
        throw new Error('Exported image was empty')
      }
      const copied = await copyImageToClipboard(blob)

      if (copied) {
        setShareMessage('התמונה הועתקה — הדביקו אותה ברשת החברתית')
      } else {
        downloadDataUrl(dataUrl, 'dream-government.png')
        setShareMessage('התמונה הורדה — העלו אותה לרשת החברתית')
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
            <h1 className="dream-gov-page__title">ממשלת החלומות שלי</h1>
            <p className="dream-gov-page__subtitle">
              בחר לכל אחד מהמשרדים את שר החלומות שלך מבין המועמדים לכנסת
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
                <button
                  type="button"
                  className="dream-gov-report__share"
                  onClick={() => {
                    void handleShare()
                  }}
                  disabled={exporting || filledCount === 0}
                  aria-label={
                    exporting
                      ? 'מייצא תמונה…'
                      : 'שתף את ממשלת החלומות שלך'
                  }
                  title="שתף את ממשלת החלומות שלך"
                >
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
                      onClick={() => setActiveOffice(DREAM_PM_OFFICE)}
                    />
                  </div>

                  <div className="dream-gov-board__ministers">
                    {DREAM_MINISTER_OFFICES.map((office) => (
                      <DreamOfficeSquare
                        key={office.id}
                        office={office}
                        selection={selections[office.id] ?? null}
                        onClick={() => setActiveOffice(office)}
                      />
                    ))}
                  </div>
                </div>
              </article>

              {(shareMessage || shareError) && (
                <div className="dream-gov-report__footer">
                  {shareMessage ? (
                    <p className="dream-gov-page__share-ok" role="status">
                      {shareMessage}
                    </p>
                  ) : null}
                  {shareError ? (
                    <p className="dream-gov-page__error" role="alert">
                      {shareError}
                    </p>
                  ) : null}
                </div>
              )}
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
        <ShareableGovernment ref={shareRef} selections={selections} />
      </div>
    </SiteLayout>
  )
}

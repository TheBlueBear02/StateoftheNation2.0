'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { SiteLayout } from '../components/SiteLayout'
import { PageBreadcrumb } from '../components/PageBreadcrumb'
import { BordersBarsChart } from '../components/elections/borders/BordersBarsChart'
import { BordersRangePicker } from '../components/elections/borders/BordersRangePicker'
import { BordersSummaryBar } from '../components/elections/borders/BordersSummaryBar'
import { BordersToolbar } from '../components/elections/borders/BordersToolbar'
import { ShareableBordersPoster } from '../components/elections/borders/ShareableBordersPoster'
import {
  DEFAULT_BORDERS_TOPIC_ID,
  getBordersTopic,
} from '../content/governmentBordersTopics'
import { useGovernmentBordersData } from '../hooks/useGovernmentBordersData'
import { formatFieldwork } from '../lib/fetchPolls'
import {
  clampRange,
  defaultRange,
  sumRange,
  type BordersRange,
} from '../lib/governmentBorders'
import { exportNodeToPng } from '../lib/inlineImagesForExport'
import { getSiteUrl } from '../lib/runtimeEnv'
import { sharePngImage } from '../lib/sharePngImage'
import './GovernmentBordersPage.css'

const WIKI_SOURCE =
  'https://en.wikipedia.org/wiki/Opinion_polling_for_the_2026_Israeli_legislative_election'

function parseIntParam(value: string | null): number | null {
  if (value === null || value === '') return null
  const n = Number.parseInt(value, 10)
  return Number.isFinite(n) ? n : null
}

export function GovernmentBordersPage() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const urlChannel = searchParams.get('channel')
  const urlTopic = searchParams.get('topic') ?? DEFAULT_BORDERS_TOPIC_ID
  const urlFrom = parseIntParam(searchParams.get('from'))
  const urlTo = parseIntParam(searchParams.get('to'))

  const [channelKey, setChannelKey] = useState<string | null>(urlChannel)
  const [topicId, setTopicId] = useState(urlTopic)
  const [range, setRange] = useState<BordersRange>({ start: 0, end: 0 })
  const [exporting, setExporting] = useState(false)
  const [copiedFlash, setCopiedFlash] = useState(false)
  const [shareError, setShareError] = useState<string | null>(null)

  const posterRef = useRef<HTMLDivElement>(null)
  /** Prefer URL from/to only on the first columns load for a channel+topic pair. */
  const applyUrlRangeRef = useRef(true)
  const columnsKeyRef = useRef('')

  const { loading, error, channels, columns } = useGovernmentBordersData(
    channelKey,
    topicId,
  )

  const topic = getBordersTopic(topicId)
  const activeChannel =
    channels.find((c) => c.key === (channelKey ?? channels[0]?.key)) ?? null

  const syncUrl = useCallback(
    (next: {
      channel: string
      topic: string
      from: number
      to: number
    }) => {
      const params = new URLSearchParams()
      params.set('channel', next.channel)
      params.set('topic', next.topic)
      params.set('from', String(next.from))
      params.set('to', String(next.to))
      const qs = params.toString()
      const current = searchParams.toString()
      if (qs === current) return
      router.replace(`${pathname}?${qs}`, { scroll: false })
    },
    [router, pathname, searchParams],
  )

  // Default channel once polls load.
  useEffect(() => {
    if (channels.length === 0) return
    if (channelKey && channels.some((c) => c.key === channelKey)) return
    if (urlChannel && channels.some((c) => c.key === urlChannel)) {
      setChannelKey(urlChannel)
      return
    }
    setChannelKey(channels[0]!.key)
  }, [channelKey, channels, urlChannel])

  // Reset / restore range when columns change (topic or channel).
  useEffect(() => {
    const key = `${channelKey ?? ''}|${topicId}|${columns.map((c) => c.partyId).join(',')}`
    if (columns.length === 0) {
      setRange({ start: 0, end: 0 })
      columnsKeyRef.current = key
      return
    }

    if (key === columnsKeyRef.current) return
    columnsKeyRef.current = key

    if (
      applyUrlRangeRef.current &&
      urlFrom !== null &&
      urlTo !== null &&
      urlFrom >= 0 &&
      urlTo < columns.length
    ) {
      setRange(clampRange({ start: urlFrom, end: urlTo }, columns.length))
    } else {
      setRange(defaultRange(columns))
    }
    applyUrlRangeRef.current = false
  }, [columns, topicId, channelKey, urlFrom, urlTo])

  const governmentSeats = useMemo(
    () => sumRange(columns, range),
    [columns, range],
  )

  // Keep shareable query string in sync.
  useEffect(() => {
    if (!channelKey || columns.length === 0) return
    syncUrl({
      channel: channelKey,
      topic: topicId,
      from: range.start,
      to: range.end,
    })
  }, [channelKey, topicId, range, columns.length, syncUrl])

  useEffect(() => {
    if (!copiedFlash) return
    const timer = window.setTimeout(() => setCopiedFlash(false), 2500)
    return () => window.clearTimeout(timer)
  }, [copiedFlash])

  const handleChannelChange = (key: string) => {
    applyUrlRangeRef.current = false
    setChannelKey(key)
  }

  const handleTopicChange = (id: string) => {
    applyUrlRangeRef.current = false
    setTopicId(id)
  }

  const handleRangeChange = useCallback(
    (next: BordersRange) => {
      setRange(clampRange(next, columns.length))
    },
    [columns.length],
  )

  const handleShare = async () => {
    const node = posterRef.current
    if (!node || exporting || copiedFlash) return

    setExporting(true)
    setCopiedFlash(false)
    setShareError(null)

    try {
      const shareResult = await sharePngImage({
        filename: 'government-borders.png',
        shareTitle: 'ג"ג · גבולות גזרה לממשלה · מצב האומה',
        shareText: `גבולות הגזרה שלי לממשלה: ${governmentSeats} מנדטים\n${getSiteUrl()}/elections/government-borders`,
        makeBlob: async () => {
          const dataUrl = await exportNodeToPng(node, {
            pixelRatio: 2,
            backgroundColor: '#ffffff',
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
    } catch (shareErr) {
      console.error('[government-borders] poster export failed', shareErr)
      setShareError('לא ניתן לייצא את התמונה. נסו שוב או בדקו חיבור לתמונות.')
    } finally {
      setExporting(false)
    }
  }

  const pollDateLabel = activeChannel
    ? formatFieldwork(
        activeChannel.poll.fieldworkStart,
        activeChannel.poll.fieldworkEnd,
      )
    : ''

  return (
    <SiteLayout className="borders-page">
      <main className="borders-page__main">
        <div className="borders-page__inner container">
          <PageBreadcrumb
            items={[
              { label: 'בחירות 2026', to: '/elections' },
              { label: 'ג"ג · גבולות גזרה' },
            ]}
          />

          <header className="borders-page__header">
            <div className="borders-page__title-row">
              <h1 className="borders-page__title">
                ג&quot;ג · גבולות גזרה לממשלה
              </h1>
              <button
                type="button"
                className={
                  copiedFlash
                    ? 'borders-page__share borders-page__share--copied'
                    : 'borders-page__share'
                }
                onClick={() => {
                  void handleShare()
                }}
                disabled={
                  exporting || copiedFlash || columns.length === 0 || loading
                }
                aria-label={
                  copiedFlash
                    ? 'הועתק ללוח'
                    : exporting
                      ? 'מייצא תמונה…'
                      : 'שתפו את גבולות הגזרה'
                }
                title={copiedFlash ? 'הועתק ללוח' : 'שתפו פוסטר'}
              >
                {copiedFlash ? (
                  <span role="status">הועתק ללוח</span>
                ) : (
                  <svg
                    viewBox="0 0 24 24"
                    width="22"
                    height="22"
                    aria-hidden="true"
                  >
                    <path
                      fill="currentColor"
                      d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92s2.92-1.31 2.92-2.92-1.31-2.92-2.92-2.92z"
                    />
                  </svg>
                )}
              </button>
            </div>
            <p className="borders-page__lead">
              בחרו ציר פוליטי, סמנו רצף מפלגות על הקו — וקבלו את גבולות הגזרה
              לממשלה לפי הסקר האחרון בערוץ.
            </p>
            {shareError ? (
              <p className="borders-page__share-error" role="status">
                {shareError}
              </p>
            ) : null}
          </header>

          {loading ? (
            <p className="borders-page__status">טוען סקרים…</p>
          ) : error ? (
            <p className="borders-page__status borders-page__status--error">
              {error}
            </p>
          ) : channels.length === 0 ? (
            <p className="borders-page__status">אין סקרים זמינים כרגע.</p>
          ) : (
            <>
              <BordersToolbar
                channels={channels}
                selectedChannelKey={activeChannel?.key ?? null}
                onChannelChange={handleChannelChange}
                topic={topic}
                onTopicChange={handleTopicChange}
              />

              <BordersSummaryBar governmentSeats={governmentSeats} />

              <div className="borders-page__chart-scroll">
                <div
                  className="borders-page__chart-stack"
                  style={{
                    ['--borders-col-count' as string]: columns.length,
                  }}
                >
                  <BordersBarsChart
                    columns={columns}
                    range={range}
                    topicStartLabel={topic.startLabel}
                    topicEndLabel={topic.endLabel}
                  />
                  <BordersRangePicker
                    columnCount={columns.length}
                    range={range}
                    onChange={handleRangeChange}
                    governmentSeats={governmentSeats}
                  />
                </div>
              </div>
            </>
          )}

          <footer className="borders-page__footer">
            <p>
              נתוני הסקרים מבוססים על{' '}
              <a href={WIKI_SOURCE} target="_blank" rel="noopener noreferrer">
                ויקיפדיה
              </a>{' '}
              (CC BY-SA 4.0). סדר המפלגות על הצירים הוא הערכה ידנית של מצב האומה
              ואינו מייצג עמדה רשמית של המפלגות.
            </p>
          </footer>
        </div>
      </main>

      {columns.length > 0 && activeChannel ? (
        <div className="borders-page__poster-host" aria-hidden="true">
          <ShareableBordersPoster
            ref={posterRef}
            columns={columns}
            range={range}
            topic={topic}
            channelLabel={activeChannel.label}
            pollDateLabel={pollDateLabel}
            governmentSeats={governmentSeats}
          />
        </div>
      ) : null}
    </SiteLayout>
  )
}

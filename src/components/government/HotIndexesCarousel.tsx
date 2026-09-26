'use client'

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type TouchEvent as ReactTouchEvent,
} from 'react'
import { useRouter } from 'next/navigation'
import {
  CHART_MOBILE_MAX_WIDTH,
  chartUiScaleForWidth,
  IndexTrendChart,
  readChartLayoutWidth,
} from './IndexTrendChart'
import { OfficeErasBar } from './OfficeErasBar'
import { useOfficeDashboard } from '../../hooks/useOfficeDashboard'
import { exportOfficeChartImage } from '../../lib/exportOfficeChartImage'
import {
  HOT_INDEX_COUNT,
  pickHotOfficeIndexes,
  type HotOfficeIndexSlide,
} from '../../lib/hotOfficeIndexes'
import { getSiteUrl } from '../../lib/runtimeEnv'
import { sharePngImage } from '../../lib/sharePngImage'
import './HotIndexesCarousel.css'

const SLIDE_MS = 4000
const SWIPE_THRESHOLD_PX = 48

function useViewportWidth(): number {
  const [width, setWidth] = useState(CHART_MOBILE_MAX_WIDTH)

  useEffect(() => {
    let debounceId: number | null = null
    const update = () => {
      if (debounceId != null) window.clearTimeout(debounceId)
      debounceId = window.setTimeout(() => {
        setWidth(readChartLayoutWidth())
      }, 50)
    }
    setWidth(readChartLayoutWidth())
    window.addEventListener('resize', update)
    window.visualViewport?.addEventListener('resize', update)
    return () => {
      if (debounceId != null) window.clearTimeout(debounceId)
      window.removeEventListener('resize', update)
      window.visualViewport?.removeEventListener('resize', update)
    }
  }, [])

  return width
}

function buildDashboardHref(officeId: number, indexId: number): string {
  return `/government/dashboard?office=${officeId}&index=${indexId}`
}

function slideTitle(slide: HotOfficeIndexSlide): string {
  return slide.index.info?.trim() || slide.index.name
}

export function HotIndexesCarousel() {
  const router = useRouter()
  const { offices, loading, error } = useOfficeDashboard()
  const slides = pickHotOfficeIndexes(offices, HOT_INDEX_COUNT)
  const [active, setActive] = useState(0)
  const [paused, setPaused] = useState(false)
  const [reducedMotion, setReducedMotion] = useState(false)
  const [imageShareStatus, setImageShareStatus] = useState<
    'idle' | 'copying' | 'copied' | 'downloaded' | 'error'
  >('idle')
  const [chartMetrics, setChartMetrics] = useState<{
    uiScale: number
    width: number
  } | null>(null)
  const chartCaptureRef = useRef<HTMLElement | null>(null)
  const touchStartX = useRef<number | null>(null)
  /** True when the last gesture was a horizontal swipe (skip click→navigate). */
  const swipeConsumedClick = useRef(false)
  const viewportWidth = useViewportWidth()

  const count = slides.length
  const safeActive = count > 0 ? active % count : 0
  const current = count > 0 ? slides[safeActive]! : null

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const apply = () => setReducedMotion(mq.matches)
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [])

  useEffect(() => {
    setActive(0)
  }, [count])

  useEffect(() => {
    if (
      imageShareStatus === 'idle' ||
      imageShareStatus === 'copying'
    ) {
      return
    }
    const timer = window.setTimeout(() => setImageShareStatus('idle'), 2500)
    return () => window.clearTimeout(timer)
  }, [imageShareStatus])

  useEffect(() => {
    if (reducedMotion || paused || count < 2) return
    const timer = window.setTimeout(() => {
      setActive((prev) => (prev + 1) % count)
    }, SLIDE_MS)
    return () => window.clearTimeout(timer)
  }, [safeActive, count, paused, reducedMotion])

  const go = useCallback(
    (step: -1 | 1) => {
      if (count < 2) return
      setActive((prev) => (prev + step + count) % count)
    },
    [count],
  )

  const viewportChartWidth = Math.max(1, viewportWidth - 80)
  const viewportScale = chartUiScaleForWidth(viewportChartWidth)
  const uiScale = Math.max(viewportScale, chartMetrics?.uiScale ?? 1)
  // Keep the homepage carousel on the shorter (non-tall) chart proportions.

  const onChartMetricsChange = useCallback(
    (metrics: { uiScale: number; tall: boolean; width: number }) => {
      setChartMetrics((prev) => {
        if (
          prev &&
          Math.abs(prev.uiScale - metrics.uiScale) < 0.01 &&
          Math.abs(prev.width - metrics.width) < 0.5
        ) {
          return prev
        }
        return { uiScale: metrics.uiScale, width: metrics.width }
      })
    },
    [],
  )

  const copyChartImage = async () => {
    const node = chartCaptureRef.current
    if (!node || !current || imageShareStatus === 'copying') return

    setImageShareStatus('copying')
    setPaused(true)
    const safeName = current.index.name
      .replace(/[^\u0590-\u05FFa-zA-Z0-9-_]+/g, '-')
      .slice(0, 40)
    const chartUrl = `${getSiteUrl()}${buildDashboardHref(
      current.office.id,
      current.index.id,
    )}`
    const indexDescription = current.index.info?.trim() || ''
    const shareText = indexDescription
      ? `${indexDescription}\nמאתר מצב האומה\n${chartUrl}`
      : `מאתר מצב האומה\n${chartUrl}`

    try {
      const shareResult = await sharePngImage({
        filename: `hot-index-${safeName}.png`,
        shareTitle: `${current.index.name} · מצב האומה`,
        shareText,
        makeBlob: async () => {
          await new Promise<void>((resolve) => {
            window.requestAnimationFrame(() => {
              window.requestAnimationFrame(() => resolve())
            })
          })
          const dataUrl = await exportOfficeChartImage(node, {
            iconUrl: current.index.icon,
            iconTone: current.index.alert
              ? 'alert'
              : current.index.isKpi
                ? 'kpi'
                : 'policy',
            officeName: current.office.name,
          })
          const response = await fetch(dataUrl)
          return response.blob()
        },
      })

      if (!shareResult.ok) throw new Error(shareResult.error)

      if (shareResult.method === 'clipboard') {
        setImageShareStatus('copied')
      } else if (shareResult.method === 'download') {
        setImageShareStatus('downloaded')
      } else {
        setImageShareStatus('idle')
      }
    } catch (err) {
      console.error('[hot-indexes] chart image export failed', err)
      setImageShareStatus('error')
    } finally {
      setPaused(false)
    }
  }

  const onTouchStart = (event: ReactTouchEvent) => {
    touchStartX.current = event.changedTouches[0]?.clientX ?? null
    swipeConsumedClick.current = false
  }

  const onTouchEnd = (event: ReactTouchEvent) => {
    const startX = touchStartX.current
    touchStartX.current = null
    if (startX == null || count < 2) return
    const endX = event.changedTouches[0]?.clientX
    if (endX == null) return
    const delta = endX - startX
    if (Math.abs(delta) < SWIPE_THRESHOLD_PX) return
    swipeConsumedClick.current = true
    // Swipe left (finger moves left → negative delta) = next, like Instagram.
    go(delta < 0 ? 1 : -1)
  }

  const openDashboard = useCallback(() => {
    if (!current) return
    router.push(buildDashboardHref(current.office.id, current.index.id))
  }, [current, router])

  const onBoxClickCapture = (event: ReactMouseEvent<HTMLElement>) => {
    if (swipeConsumedClick.current) {
      swipeConsumedClick.current = false
      return
    }
    const target = event.target
    if (!(target instanceof Element)) return
    // Keep share / מקור / side arrows as their own actions.
    if (
      target.closest(
        '.hot-indexes__share, .hot-indexes__source, .hot-indexes__actions, .hot-indexes__nav',
      )
    ) {
      return
    }
    // Capture phase so chart bars/dots that stopPropagation still open the dashboard.
    openDashboard()
  }

  const onBoxKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    openDashboard()
  }

  if (loading) {
    return (
      <section
        id="hot-indexes"
        className="hot-indexes"
        aria-busy="true"
        aria-label="מדדים חמים"
      >
        <div className="container">
          <div className="hot-indexes__box hot-indexes__box--skeleton" />
        </div>
      </section>
    )
  }

  if (error || !current) {
    return null
  }

  const title = slideTitle(current)

  return (
    <section
      id="hot-indexes"
      className="hot-indexes"
      aria-roledescription="carousel"
      aria-label="מדדים חמים"
    >
      <div className="container">
        <div
          className="hot-indexes__frame"
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
        >
          <button
            type="button"
            className="hot-indexes__nav hot-indexes__nav--prev"
            onClick={() => go(-1)}
            aria-label="מדד קודם"
            disabled={count < 2}
          >
            ‹
          </button>

          <div
            className="hot-indexes__box"
            role="link"
            tabIndex={0}
            aria-label={`${current.office.name}: ${title} — פתיחה בדשבורד מדדים`}
            onClickCapture={onBoxClickCapture}
            onKeyDown={onBoxKeyDown}
          >
            <div
              className="hot-indexes__progress"
              aria-hidden="true"
            >
              {slides.map((slide, i) => {
                const state =
                  i < safeActive
                    ? 'done'
                    : i === safeActive
                      ? 'active'
                      : 'pending'
                return (
                  <span
                    key={slide.index.id}
                    className={`hot-indexes__progress-seg hot-indexes__progress-seg--${state}${
                      reducedMotion || paused
                        ? ' hot-indexes__progress-seg--static'
                        : ''
                    }`}
                  />
                )
              })}
            </div>

            <section
              ref={chartCaptureRef}
              className="office-dashboard__chart-block hot-indexes__chart-block"
              aria-labelledby="hot-indexes-title"
            >
              <div className="office-dashboard__chart-header hot-indexes__header">
                <p className="hot-indexes__office">{current.office.name}</p>
                <div className="hot-indexes__title-wrap">
                  <h2
                    className="office-dashboard__chart-title hot-indexes__title"
                    id="hot-indexes-title"
                  >
                    <span className="hot-indexes__title-text">{title}</span>
                  </h2>
                </div>
                <div
                  className="office-dashboard__chart-actions hot-indexes__actions"
                  dir="ltr"
                  onClick={(event) => event.stopPropagation()}
                  onKeyDown={(event) => event.stopPropagation()}
                >
                  <button
                    type="button"
                    className={`office-dashboard__chart-share hot-indexes__share${
                      imageShareStatus === 'copied' ||
                      imageShareStatus === 'downloaded'
                        ? ' office-dashboard__chart-share--done hot-indexes__share--done'
                        : ''
                    }`}
                    onClick={() => {
                      void copyChartImage()
                    }}
                    disabled={imageShareStatus === 'copying'}
                    aria-label={
                      imageShareStatus === 'copying'
                        ? 'מכין תמונה…'
                        : imageShareStatus === 'copied'
                          ? 'התמונה הועתקה'
                          : imageShareStatus === 'downloaded'
                            ? 'התמונה הורדה'
                            : imageShareStatus === 'error'
                              ? 'ייצוא התמונה נכשל'
                              : 'שתפו את הגרף'
                    }
                    title={
                      imageShareStatus === 'copied'
                        ? 'התמונה הועתקה'
                        : imageShareStatus === 'downloaded'
                          ? 'התמונה הורדה'
                          : imageShareStatus === 'error'
                            ? 'ייצוא התמונה נכשל'
                            : 'שתפו את הגרף'
                    }
                  >
                    {imageShareStatus === 'copied' ||
                    imageShareStatus === 'downloaded' ? (
                      <span
                        className="office-dashboard__chart-share-status hot-indexes__share-status"
                        role="status"
                      >
                        {imageShareStatus === 'copied' ? 'הועתק' : 'הורד'}
                      </span>
                    ) : imageShareStatus === 'copying' ? (
                      <span
                        className="office-dashboard__chart-share-status hot-indexes__share-status"
                        role="status"
                      >
                        …
                      </span>
                    ) : imageShareStatus === 'error' ? (
                      <span
                        className="office-dashboard__chart-share-status hot-indexes__share-status"
                        role="status"
                      >
                        !
                      </span>
                    ) : (
                      <svg
                        className="office-dashboard__chart-share-icon hot-indexes__share-icon"
                        viewBox="0 0 24 24"
                        width="24"
                        height="24"
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
                  {current.index.source ? (
                    <a
                      className="office-dashboard__chart-source hot-indexes__source"
                      href={current.index.source}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(event) => event.stopPropagation()}
                    >
                      מקור
                    </a>
                  ) : null}
                </div>
              </div>

              <IndexTrendChart
                key={current.index.id}
                index={current.index}
                uiScale={uiScale}
                tall={false}
                compact
                onMetricsChange={onChartMetricsChange}
              />
              <OfficeErasBar
                key={`eras-${current.index.id}`}
                eras={current.office.ministerHistory}
                points={current.index.points}
                chartType={current.index.chartType}
                uiScale={uiScale}
                higherIsBetter={current.index.higherIsBetter}
                selectedKeys={[]}
                selectionResetKey={current.office.id}
                showCompare={false}
              />
            </section>
          </div>

          <button
            type="button"
            className="hot-indexes__nav hot-indexes__nav--next"
            onClick={() => go(1)}
            aria-label="מדד הבא"
            disabled={count < 2}
          >
            ›
          </button>
        </div>
      </div>
    </section>
  )
}

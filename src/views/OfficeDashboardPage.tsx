'use client'

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { PageBreadcrumb } from '../components/PageBreadcrumb'
import { SiteLayout } from '../components/SiteLayout'
import {
  CHART_MOBILE_MAX_WIDTH,
  chartTallForWidth,
  chartUiScaleForWidth,
  getChartLayoutWidthDebug,
  IndexTrendChart,
  readChartLayoutWidth,
} from '../components/government/IndexTrendChart'
import { OfficeErasBar } from '../components/government/OfficeErasBar'
import { useOfficeDashboard } from '../hooks/useOfficeDashboard'
import { exportOfficeChartImage } from '../lib/exportOfficeChartImage'
import {
  type OfficeDashboardIndex,
  type OfficeDashboardOffice,
} from '../lib/fetchOfficeDashboard'
import { getSiteUrl } from '../lib/runtimeEnv'
import { sharePngImage } from '../lib/sharePngImage'
import './OfficeDashboardPage.css'

/**
 * Viewport width that tracks DevTools device mode.
 * Uses readChartLayoutWidth() so a spurious innerWidth jump (375 → ~800)
 * from Chrome device emulation does not flip the page to tablet/desktop.
 * Always starts at the desktop breakpoint so SSR + first client paint match
 * (avoids hydration mismatch on office-dashboard-page--mobile).
 */
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
    // Apply immediately after mount (no debounce) so mobile CSS kicks in fast.
    setWidth(readChartLayoutWidth())
    window.addEventListener('resize', update)
    window.visualViewport?.addEventListener('resize', update)
    const mq640 = window.matchMedia('(max-width: 640px)')
    const mq960 = window.matchMedia('(max-width: 960px)')
    mq640.addEventListener('change', update)
    mq960.addEventListener('change', update)
    return () => {
      if (debounceId != null) window.clearTimeout(debounceId)
      window.removeEventListener('resize', update)
      window.visualViewport?.removeEventListener('resize', update)
      mq640.removeEventListener('change', update)
      mq960.removeEventListener('change', update)
    }
  }, [])

  return width
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0]!.slice(0, 2)
  return `${parts[0]!.slice(0, 1)}${parts[parts.length - 1]!.slice(0, 1)}`
}

function bubbleClass(index: OfficeDashboardIndex): string {
  if (index.alert) return 'office-bubble office-bubble--alert'
  if (index.isKpi) return 'office-bubble office-bubble--kpi'
  return 'office-bubble office-bubble--policy'
}

function bubbleSizeClass(index: OfficeDashboardIndex, rank: number): string {
  if (index.alert || (index.isKpi && rank < 2)) return 'office-bubble--lg'
  if (index.isKpi || rank < 3) return 'office-bubble--md'
  return 'office-bubble--sm'
}

function parsePositiveInt(raw: string | null): number | null {
  if (!raw) return null
  const n = Number(raw)
  return Number.isInteger(n) && n > 0 ? n : null
}

function buildDashboardQuery(officeId: number, indexId: number | null): string {
  const params = new URLSearchParams()
  params.set('office', String(officeId))
  if (indexId != null) params.set('index', String(indexId))
  return params.toString()
}

function formatMinisterLine(
  minister: NonNullable<OfficeDashboardOffice['minister']>,
): string {
  return [minister.fullName, minister.dutyDesc, minister.partyName]
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part))
    .join(' · ')
}

function IndexLegend() {
  return (
    <ul className="office-dashboard__legend" aria-label="מקרא">
      <li>
        <span className="office-dashboard__legend-swatch office-dashboard__legend-swatch--kpi" />
        מדד
      </li>
      <li>
        <span className="office-dashboard__legend-swatch office-dashboard__legend-swatch--alert" />
        התראה
      </li>
    </ul>
  )
}

type OfficeClusterProps = {
  office: OfficeDashboardOffice
  selected: boolean
  onSelect: () => void
}

function OfficeCluster({ office, selected, onSelect }: OfficeClusterProps) {
  const bubbles = useMemo(() => {
    const ordered = [
      ...office.kpis,
      ...office.policies,
    ]
    return ordered.slice(0, 12)
  }, [office.kpis, office.policies])

  const minister = office.minister

  return (
    <button
      type="button"
      className={`office-cluster${selected ? ' office-cluster--selected' : ''}`}
      onClick={onSelect}
      aria-pressed={selected}
      aria-label={`${office.name}${minister ? `, ${minister.fullName}` : ''}`}
    >
      <div className="office-cluster__bubbles" aria-hidden="true">
        {bubbles.map((index, rank) => (
          <span
            key={index.id}
            className={`${bubbleClass(index)} ${bubbleSizeClass(index, rank)}`}
            title={index.name}
          >
            <img
              src={index.icon}
              alt=""
              className="office-bubble__icon"
              width={40}
              height={40}
              loading="lazy"
              decoding="async"
            />
          </span>
        ))}
        <span className="office-cluster__minister">
          {minister?.imageUrl ? (
            <img
              src={minister.imageUrl}
              alt=""
              className="office-cluster__minister-img"
              width={112}
              height={112}
            />
          ) : (
            <span className="office-cluster__minister-initials">
              {initials(minister?.fullName ?? office.name)}
            </span>
          )}
        </span>
      </div>
      <div className="office-cluster__meta">
        <h2 className="office-cluster__title">{office.name}</h2>
        {minister ? (
          <p className="office-cluster__minister-name">{minister.fullName}</p>
        ) : null}
        <p className="office-cluster__counts">
          {office.kpis.length} מדדים · {office.policies.length} מדיניות
        </p>
      </div>
    </button>
  )
}

type DetailPanelProps = {
  offices: OfficeDashboardOffice[]
  office: OfficeDashboardOffice
  selectedIndex: OfficeDashboardIndex | null
  onSelectOffice: (officeId: number) => void
  onSelectIndex: (index: OfficeDashboardIndex) => void
}

function DetailPanel({
  offices,
  office,
  selectedIndex,
  onSelectOffice,
  onSelectIndex,
}: DetailPanelProps) {
  const indexes = [...office.kpis, ...office.policies]
  const activeChipRef = useRef<HTMLButtonElement | null>(null)
  const stripTrackRef = useRef<HTMLDivElement | null>(null)
  const chipRefs = useRef<Map<number, HTMLButtonElement>>(new Map())
  const markerAnimatedRef = useRef(false)
  const [indexMarker, setIndexMarker] = useState<{
    left: number
    width: number
    visible: boolean
    animate: boolean
  }>({ left: 0, width: 0, visible: false, animate: false })
  const prevOfficeIdRef = useRef(office.id)
  const pendingSlideRef = useRef<'from-left' | 'from-right' | null>(null)
  const [slideDir, setSlideDir] = useState<'from-left' | 'from-right'>(
    'from-right',
  )
  const [imageShareStatus, setImageShareStatus] = useState<
    'idle' | 'copying' | 'copied' | 'downloaded' | 'error'
  >('idle')
  const [eraHighlightBands, setEraHighlightBands] = useState<
    Array<{
      leftPct: number
      widthPct: number
      color: string | null
      avg?: number | null
    }>
  >([])
  const [eraSelectedKeys, setEraSelectedKeys] = useState<string[]>([])
  const [chartMetrics, setChartMetrics] = useState<{
    uiScale: number
    tall: boolean
    width: number
  } | null>(null)
  const chartCaptureRef = useRef<HTMLElement | null>(null)
  /** Fixed desktop-layout chart used for PNG export (matches PC share). */
  const chartExportRef = useRef<HTMLElement | null>(null)
  const chartResizeObserverRef = useRef<ResizeObserver | null>(null)
  const viewportWidth = useViewportWidth()
  const officeIndex = offices.findIndex((item) => item.id === office.id)

  const bindChartCaptureRef = useCallback((node: HTMLElement | null) => {
    chartCaptureRef.current = node
    chartResizeObserverRef.current?.disconnect()
    chartResizeObserverRef.current = null
    if (!node) return

    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => {
      /* width tracked inside IndexTrendChart; keep ref for export */
    })
    ro.observe(node)
    chartResizeObserverRef.current = ro
  }, [])

  // Viewport-based scale so DevTools device mode works even before the chart mounts.
  const viewportChartWidth = Math.max(1, viewportWidth - 40)
  const viewportScale = chartUiScaleForWidth(viewportChartWidth)
  const viewportTall = chartTallForWidth(viewportChartWidth)
  const uiScale = Math.max(viewportScale, chartMetrics?.uiScale ?? 1)
  const tallChart = viewportTall || Boolean(chartMetrics?.tall)
  const layoutMode: 'mobile' | 'desktop' =
    tallChart || uiScale > 1.01 ? 'mobile' : 'desktop'

  const onChartMetricsChange = useCallback(
    (metrics: { uiScale: number; tall: boolean; width: number }) => {
      setChartMetrics((prev) => {
        if (
          prev &&
          Math.abs(prev.uiScale - metrics.uiScale) < 0.01 &&
          prev.tall === metrics.tall &&
          Math.abs(prev.width - metrics.width) < 0.5
        ) {
          return prev
        }
        return {
          uiScale: metrics.uiScale,
          tall: metrics.tall,
          width: metrics.width,
        }
      })
    },
    [],
  )

  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') return
    const debug = getChartLayoutWidthDebug()
    // eslint-disable-next-line no-console -- intentional layout debug in dev
    console.info(
      `%c[office-dashboard] layout: ${layoutMode.toUpperCase()}`,
      layoutMode === 'mobile'
        ? 'color:#0a7;font-weight:700'
        : 'color:#06c;font-weight:700',
      {
        mode: layoutMode,
        correctedWidth: debug.corrected,
        raw: {
          inner: debug.inner,
          client: debug.client,
          visual: debug.visual,
          screen: debug.screen,
        },
        viewportChartWidth,
        chartMeasuredWidth: chartMetrics?.width ?? null,
        uiScale: Number(uiScale.toFixed(2)),
        tall: tallChart,
        mobileBelowPx: CHART_MOBILE_MAX_WIDTH,
      },
    )
  }, [
    layoutMode,
    viewportWidth,
    viewportChartWidth,
    chartMetrics?.width,
    uiScale,
    tallChart,
  ])

  const goToAdjacentOffice = (step: -1 | 1) => {
    if (offices.length === 0 || officeIndex < 0) return
    pendingSlideRef.current = step === 1 ? 'from-right' : 'from-left'
    const next = (officeIndex + step + offices.length) % offices.length
    onSelectOffice(offices[next]!.id)
  }

  useEffect(() => {
    if (prevOfficeIdRef.current === office.id) return

    const from = offices.findIndex((item) => item.id === prevOfficeIdRef.current)
    const to = offices.findIndex((item) => item.id === office.id)
    prevOfficeIdRef.current = office.id

    if (pendingSlideRef.current) {
      setSlideDir(pendingSlideRef.current)
      pendingSlideRef.current = null
      return
    }

    if (from < 0 || to < 0 || offices.length === 0) return
    const forward = (to - from + offices.length) % offices.length
    const backward = (from - to + offices.length) % offices.length
    setSlideDir(forward <= backward ? 'from-right' : 'from-left')
  }, [office.id, offices])

  useEffect(() => {
    activeChipRef.current?.scrollIntoView({
      behavior: 'smooth',
      inline: 'nearest',
      block: 'nearest',
    })
  }, [selectedIndex?.id])

  useLayoutEffect(() => {
    const updateMarker = () => {
      const id = selectedIndex?.id
      const track = stripTrackRef.current
      if (id == null || !track) {
        setIndexMarker((prev) => ({ ...prev, visible: false }))
        return
      }
      const chip = chipRefs.current.get(id)
      if (!chip) {
        setIndexMarker((prev) => ({ ...prev, visible: false }))
        return
      }
      const padX = 6
      const width = chip.offsetWidth + padX * 2
      const left = chip.offsetLeft + (chip.offsetWidth - width) / 2
      const animate = markerAnimatedRef.current
      markerAnimatedRef.current = true
      setIndexMarker({ left, width, visible: true, animate })
    }

    updateMarker()

    const track = stripTrackRef.current
    const ro =
      typeof ResizeObserver !== 'undefined' && track
        ? new ResizeObserver(() => updateMarker())
        : null
    if (track && ro) ro.observe(track)
    window.addEventListener('resize', updateMarker)
    return () => {
      ro?.disconnect()
      window.removeEventListener('resize', updateMarker)
    }
  }, [selectedIndex?.id, office.id, office.kpis, office.policies])

  useEffect(() => {
    // New office strip: snap marker without sliding from the previous office.
    markerAnimatedRef.current = false
  }, [office.id])

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

  const copyChartImage = async () => {
    // Prefer the offscreen desktop-layout chart so mobile shares match PC.
    const node = chartExportRef.current ?? chartCaptureRef.current
    if (!node || imageShareStatus === 'copying') return

    setImageShareStatus('copying')
    const safeName = (selectedIndex?.name || 'chart')
      .replace(/[^\u0590-\u05FFa-zA-Z0-9-_]+/g, '-')
      .slice(0, 40)
    const indexName = selectedIndex?.name || 'מדד ממשלתי'
    const chartUrl = `${getSiteUrl()}/government/dashboard?${buildDashboardQuery(
      office.id,
      selectedIndex?.id ?? null,
    )}`
    const indexDescription = selectedIndex?.info?.trim() || ''
    const shareText = indexDescription
      ? `${indexDescription}\nמאתר מצב האומה\n${chartUrl}`
      : `מאתר מצב האומה\n${chartUrl}`

    try {
      // Same path as dream-government: Safari-safe clipboard Promise,
      // Android/Samsung prefer Web Share, then open-image / download.
      const shareResult = await sharePngImage({
        filename: `office-dashboard-${safeName}.png`,
        shareTitle: `${indexName} · מצב האומה`,
        shareText,
        makeBlob: async () => {
          // Let the offscreen desktop chart finish layout before capture.
          await new Promise<void>((resolve) => {
            window.requestAnimationFrame(() => {
              window.requestAnimationFrame(() => resolve())
            })
          })
          const dataUrl = await exportOfficeChartImage(node, {
            iconUrl: selectedIndex?.icon,
            iconTone: selectedIndex?.alert
              ? 'alert'
              : selectedIndex?.isKpi
                ? 'kpi'
                : 'policy',
            officeName: office.name,
          })
          const response = await fetch(dataUrl)
          return response.blob()
        },
      })

      if (!shareResult.ok) {
        throw new Error(shareResult.error)
      }

      if (shareResult.method === 'clipboard') {
        setImageShareStatus('copied')
      } else if (shareResult.method === 'download') {
        setImageShareStatus('downloaded')
      } else {
        // Native share sheet opened (or user aborted) — no toast needed.
        setImageShareStatus('idle')
      }
    } catch (error) {
      console.error('[office-dashboard] chart image export failed', error)
      setImageShareStatus('error')
    }
  }

  const slideClass = `office-dashboard__slide office-dashboard__slide--${slideDir}`

  return (
    <aside
      className="office-dashboard__panel"
      aria-label={`פירוט ${office.name}`}
    >
      <div className="office-dashboard__office-switcher" dir="ltr">
        <button
          type="button"
          className="office-dashboard__office-nav"
          onClick={() => goToAdjacentOffice(-1)}
          aria-label="משרד קודם"
          disabled={offices.length < 2}
        >
          ‹
        </button>

        <div
          key={office.id}
          className={`office-dashboard__office-current ${slideClass}`}
          dir="rtl"
        >
          <div className="office-dashboard__office-current-text">
            <h1 className="office-dashboard__title">{office.name}</h1>
            <div className="office-dashboard__office-current-meta" dir="rtl">
              {office.minister ? (
                <p className="office-dashboard__subtitle">
                  {formatMinisterLine(office.minister)}
                </p>
              ) : (
                <span className="office-dashboard__subtitle" />
              )}
              <IndexLegend />
            </div>
          </div>
        </div>

        <button
          type="button"
          className="office-dashboard__office-nav"
          onClick={() => goToAdjacentOffice(1)}
          aria-label="משרד הבא"
          disabled={offices.length < 2}
        >
          ›
        </button>
      </div>

      <div
        className="office-dashboard__index-strip"
        role="list"
        aria-label="מדדי המשרד"
      >
        <div
          key={office.id}
          className={`office-dashboard__index-strip-track ${slideClass}`}
          ref={stripTrackRef}
        >
          <span
            className={`office-dashboard__index-marker${
              indexMarker.visible ? ' office-dashboard__index-marker--visible' : ''
            }${
              indexMarker.animate ? ' office-dashboard__index-marker--animate' : ''
            }`}
            style={{
              width: indexMarker.width,
              transform: `translateX(${indexMarker.left}px)`,
            }}
            aria-hidden="true"
          />
          {indexes.map((index) => {
            const isActive = selectedIndex?.id === index.id
            return (
              <button
                key={index.id}
                ref={(node) => {
                  if (node) chipRefs.current.set(index.id, node)
                  else chipRefs.current.delete(index.id)
                  if (isActive) activeChipRef.current = node
                }}
                type="button"
                role="listitem"
                className={`office-dashboard__index-chip${
                  index.alert ? ' office-dashboard__index-chip--alert' : ''
                }${index.isKpi ? '' : ' office-dashboard__index-chip--policy'}${
                  isActive ? ' office-dashboard__index-chip--active' : ''
                }`}
                onClick={() => onSelectIndex(index)}
                aria-pressed={isActive}
                aria-label={index.name}
                title={index.name}
              >
                <span
                  className="office-dashboard__index-chip-circle"
                  aria-hidden="true"
                >
                  <img
                    src={index.icon}
                    alt=""
                    className="office-dashboard__index-chip-icon"
                        width={28}
                        height={28}
                    loading="lazy"
                    decoding="async"
                  />
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {selectedIndex ? (
        <>
          <section
            ref={bindChartCaptureRef}
            className="office-dashboard__chart-block"
            aria-labelledby="office-index-chart-title"
          >
            <div className="office-dashboard__chart-header">
              <div>
                <h3
                  id="office-index-chart-title"
                  className="office-dashboard__chart-title"
                >
                  {selectedIndex.name}
                </h3>
                {selectedIndex.info ? (
                  <p className="office-dashboard__chart-info">
                    {selectedIndex.info}
                  </p>
                ) : null}
              </div>
              <div className="office-dashboard__chart-actions" dir="ltr">
                <button
                  type="button"
                  className={`office-dashboard__chart-share${
                    imageShareStatus === 'copied' ||
                    imageShareStatus === 'downloaded'
                      ? ' office-dashboard__chart-share--done'
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
                    <span className="office-dashboard__chart-share-status" role="status">
                      {imageShareStatus === 'copied'
                        ? 'הועתק'
                        : 'הורד'}
                    </span>
                  ) : imageShareStatus === 'copying' ? (
                    <span className="office-dashboard__chart-share-status" role="status">
                      …
                    </span>
                  ) : imageShareStatus === 'error' ? (
                    <span className="office-dashboard__chart-share-status" role="status">
                      !
                    </span>
                  ) : (
                    <svg
                      className="office-dashboard__chart-share-icon"
                      viewBox="0 0 24 24"
                      width="26"
                      height="26"
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
                {selectedIndex.source ? (
                  <a
                    className="office-dashboard__chart-source"
                    href={selectedIndex.source}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    מקור
                  </a>
                ) : null}
              </div>
            </div>
            <IndexTrendChart
              index={selectedIndex}
              highlightBands={eraHighlightBands}
              uiScale={uiScale}
              tall={tallChart}
              onMetricsChange={onChartMetricsChange}
            />
            <OfficeErasBar
              eras={office.ministerHistory}
              points={selectedIndex.points}
              chartType={selectedIndex.chartType}
              uiScale={uiScale}
              higherIsBetter={selectedIndex.higherIsBetter}
              selectedKeys={eraSelectedKeys}
              onSelectedKeysChange={setEraSelectedKeys}
              selectionResetKey={office.id}
              onHoverBand={setEraHighlightBands}
            />
          </section>

          {/*
            Offscreen desktop layout for PNG share — always 960×400 chart +
            uiScale 1 so mobile shares match the PC export proportions.
          */}
          <section
            ref={chartExportRef}
            className="office-dashboard__chart-block office-dashboard__chart-block--export"
            aria-hidden="true"
          >
            <div className="office-dashboard__chart-header">
              <div>
                <h3 className="office-dashboard__chart-title">
                  {selectedIndex.name}
                </h3>
                {selectedIndex.info ? (
                  <p className="office-dashboard__chart-info">
                    {selectedIndex.info}
                  </p>
                ) : null}
              </div>
            </div>
            <IndexTrendChart
              index={selectedIndex}
              highlightBands={eraHighlightBands}
              uiScale={1}
              tall={false}
              fixedLayout
            />
            <OfficeErasBar
              eras={office.ministerHistory}
              points={selectedIndex.points}
              chartType={selectedIndex.chartType}
              uiScale={1}
              higherIsBetter={selectedIndex.higherIsBetter}
              selectedKeys={eraSelectedKeys}
              selectionResetKey={office.id}
            />
          </section>
        </>
      ) : (
        <p className="office-dashboard__chart-hint">
          בחרו מדד כדי לראות את הגרף לאורך זמן
        </p>
      )}
    </aside>
  )
}

function DetailPanelSkeleton() {
  return (
    <aside
      className="office-dashboard__panel office-dashboard__panel--skeleton"
      aria-hidden="true"
    >
      <div className="office-dashboard__office-switcher" dir="ltr">
        <span className="office-dashboard__office-nav office-dashboard__skel-nav">
          ‹
        </span>
        <div className="office-dashboard__office-current" dir="rtl">
          <div className="office-dashboard__office-current-text">
            <h1 className="office-dashboard__title office-dashboard__skel-text office-dashboard__skel-text--title">
              &nbsp;
            </h1>
            <div className="office-dashboard__office-current-meta" dir="rtl">
              <p className="office-dashboard__subtitle office-dashboard__skel-text office-dashboard__skel-text--minister">
                &nbsp;
              </p>
              <IndexLegend />
            </div>
          </div>
        </div>
        <span className="office-dashboard__office-nav office-dashboard__skel-nav">
          ›
        </span>
      </div>

      <div className="office-dashboard__index-strip">
        <div className="office-dashboard__index-strip-track">
          {Array.from({ length: 8 }, (_, i) => (
            <span key={i} className="office-dashboard__skel-circle" />
          ))}
        </div>
      </div>

      <section className="office-dashboard__chart-block">
        <div className="office-dashboard__chart-header">
          <div>
            <h3 className="office-dashboard__chart-title office-dashboard__skel-text office-dashboard__skel-text--chart-title">
              &nbsp;
            </h3>
            <p className="office-dashboard__chart-info office-dashboard__skel-text office-dashboard__skel-text--chart-info">
              &nbsp;
            </p>
          </div>
        </div>
        <div className="office-dashboard__skel-chart" />
        <div className="office-dashboard__skel-eras" />
      </section>
    </aside>
  )
}

export function OfficeDashboardPage() {
  const { offices, loading, error } = useOfficeDashboard()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [selectedOfficeId, setSelectedOfficeId] = useState<number | null>(null)
  const [selectedIndexId, setSelectedIndexId] = useState<number | null>(null)
  const hydratedFromUrlRef = useRef(false)
  const viewportWidth = useViewportWidth()
  const isMobileLayout = viewportWidth < CHART_MOBILE_MAX_WIDTH

  const selectedOffice =
    offices.find((o) => o.id === selectedOfficeId) ?? null

  const selectedIndex =
    selectedOffice?.indexes.find((i) => i.id === selectedIndexId) ?? null

  // Open office + index from ?office=&index= once data is ready.
  useEffect(() => {
    if (hydratedFromUrlRef.current) return
    if (offices.length === 0) return

    const officeFromUrl = parsePositiveInt(searchParams.get('office'))
    const indexFromUrl = parsePositiveInt(searchParams.get('index'))
    const office =
      (officeFromUrl != null
        ? offices.find((item) => item.id === officeFromUrl)
        : null) ?? offices[0]!

    const index =
      (indexFromUrl != null
        ? office.indexes.find((item) => item.id === indexFromUrl)
        : null) ??
      office.kpis[0] ??
      office.indexes[0] ??
      null

    hydratedFromUrlRef.current = true
    setSelectedOfficeId(office.id)
    setSelectedIndexId(index?.id ?? null)
  }, [offices, searchParams])

  // When switching offices after hydrate, keep a valid index for that office.
  useEffect(() => {
    if (!hydratedFromUrlRef.current) return
    if (!selectedOffice) {
      setSelectedIndexId(null)
      return
    }
    const stillValid = selectedOffice.indexes.some(
      (i) => i.id === selectedIndexId,
    )
    if (stillValid) return
    const first = selectedOffice.kpis[0] ?? selectedOffice.indexes[0] ?? null
    setSelectedIndexId(first?.id ?? null)
  }, [selectedOffice, selectedIndexId])

  // Keep the address bar in sync so the current chart is shareable.
  useEffect(() => {
    if (!hydratedFromUrlRef.current) return
    if (selectedOfficeId == null) return

    const currentOffice = parsePositiveInt(searchParams.get('office'))
    const currentIndex = parsePositiveInt(searchParams.get('index'))
    if (
      currentOffice === selectedOfficeId &&
      currentIndex === selectedIndexId
    ) {
      return
    }

    const nextQuery = buildDashboardQuery(selectedOfficeId, selectedIndexId)
    router.replace(`${pathname}?${nextQuery}`, { scroll: false })
  }, [
    pathname,
    router,
    searchParams,
    selectedIndexId,
    selectedOfficeId,
  ])

  return (
    <SiteLayout
      className={`office-dashboard-page${
        isMobileLayout ? ' office-dashboard-page--mobile' : ''
      }`}
    >
      <main className="office-dashboard__main">
        <div className="office-dashboard__inner container">
          <PageBreadcrumb
            items={[
              { label: 'הממשלה', to: '/government' },
              { label: 'דשבורד מדדים' },
            ]}
          />

          {error ? (
            <p className="office-dashboard__error" role="alert">
              לא ניתן לטעון את דשבורד הממשלה
            </p>
          ) : null}

          <div
            className={`office-dashboard__layout${
              selectedOffice || loading ? ' office-dashboard__layout--open' : ''
            }`}
          >
            {loading ? (
              <DetailPanelSkeleton />
            ) : selectedOffice && !error ? (
              <DetailPanel
                offices={offices}
                office={selectedOffice}
                selectedIndex={selectedIndex}
                onSelectOffice={setSelectedOfficeId}
                onSelectIndex={(index) => setSelectedIndexId(index.id)}
              />
            ) : null}

            <section
              className="office-dashboard__quadrant"
              aria-label="משרדים"
            >
              {!loading
                ? offices.map((office) => (
                    <OfficeCluster
                      key={office.id}
                      office={office}
                      selected={office.id === selectedOfficeId}
                      onSelect={() => setSelectedOfficeId(office.id)}
                    />
                  ))
                : null}
            </section>
          </div>
        </div>
      </main>
    </SiteLayout>
  )
}

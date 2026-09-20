'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { PageBreadcrumb } from '../components/PageBreadcrumb'
import { SiteLayout } from '../components/SiteLayout'
import { IndexTrendChart } from '../components/government/IndexTrendChart'
import { OfficeErasBar } from '../components/government/OfficeErasBar'
import { useOfficeDashboard } from '../hooks/useOfficeDashboard'
import {
  type OfficeDashboardIndex,
  type OfficeDashboardOffice,
} from '../lib/fetchOfficeDashboard'
import './OfficeDashboardPage.css'

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
  shareUrl: string
}

function DetailPanel({
  offices,
  office,
  selectedIndex,
  onSelectOffice,
  onSelectIndex,
  shareUrl,
}: DetailPanelProps) {
  const minister = office.minister
  const indexes = [...office.kpis, ...office.policies]
  const activeChipRef = useRef<HTMLButtonElement | null>(null)
  const prevOfficeIdRef = useRef(office.id)
  const pendingSlideRef = useRef<'from-left' | 'from-right' | null>(null)
  const [slideDir, setSlideDir] = useState<'from-left' | 'from-right'>(
    'from-right',
  )
  const [shareStatus, setShareStatus] = useState<'idle' | 'copied' | 'error'>(
    'idle',
  )
  const officeIndex = offices.findIndex((item) => item.id === office.id)

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

  useEffect(() => {
    if (shareStatus === 'idle') return
    const timer = window.setTimeout(() => setShareStatus('idle'), 2000)
    return () => window.clearTimeout(timer)
  }, [shareStatus])

  const copyShareLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl)
      setShareStatus('copied')
    } catch {
      setShareStatus('error')
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
          {minister?.imageUrl ? (
            <img
              src={minister.imageUrl}
              alt=""
              className="office-dashboard__panel-photo"
              width={96}
              height={96}
            />
          ) : (
            <span className="office-dashboard__panel-initials">
              {initials(minister?.fullName ?? office.name)}
            </span>
          )}
          <div className="office-dashboard__office-current-text">
            <h2 className="office-dashboard__panel-title">{office.name}</h2>
            {minister ? (
              <p className="office-dashboard__panel-minister">
                {minister.fullName}
                {minister.dutyDesc ? ` · ${minister.dutyDesc}` : ''}
              </p>
            ) : null}
            {office.info ? (
              <p className="office-dashboard__panel-info office-dashboard__panel-info--inline">
                {office.info}
              </p>
            ) : null}
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
        {indexes.map((index) => {
          const isActive = selectedIndex?.id === index.id
          return (
            <button
              key={index.id}
              ref={isActive ? activeChipRef : undefined}
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
                  width={36}
                  height={36}
                  loading="lazy"
                  decoding="async"
                />
              </span>
            </button>
          )
        })}
      </div>

      {selectedIndex ? (
        <section
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
            <div className="office-dashboard__chart-actions">
              <button
                type="button"
                className="office-dashboard__chart-share"
                onClick={() => {
                  void copyShareLink()
                }}
              >
                {shareStatus === 'copied'
                  ? 'הקישור הועתק'
                  : shareStatus === 'error'
                    ? 'ההעתקה נכשלה'
                    : 'העתק קישור'}
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
          <IndexTrendChart index={selectedIndex} />
          <OfficeErasBar
            eras={office.ministerHistory}
            points={selectedIndex.points}
            chartType={selectedIndex.chartType}
          />
        </section>
      ) : (
        <p className="office-dashboard__chart-hint">
          בחרו מדד כדי לראות את הגרף לאורך זמן
        </p>
      )}
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

  const selectedOffice =
    offices.find((o) => o.id === selectedOfficeId) ?? null

  const selectedIndex =
    selectedOffice?.indexes.find((i) => i.id === selectedIndexId) ?? null

  const shareUrl = useMemo(() => {
    if (selectedOfficeId == null) return ''
    const qs = buildDashboardQuery(selectedOfficeId, selectedIndexId)
    if (typeof window === 'undefined') {
      return `${pathname}?${qs}`
    }
    return `${window.location.origin}${pathname}?${qs}`
  }, [pathname, selectedOfficeId, selectedIndexId])

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
    <SiteLayout className="office-dashboard-page">
      <main className="office-dashboard__main">
        <div className="office-dashboard__inner container">
          <PageBreadcrumb
            items={[
              { label: 'הממשלה', to: '/government' },
              { label: 'דשבורד מדדים' },
            ]}
          />

          <header className="office-dashboard__header">
            <div>
              <h1 className="office-dashboard__title">דשבורד ממשלה</h1>
              <p className="office-dashboard__subtitle">
                מדדי ביצוע ומדיניות במשרדי הממשלה המרכזיים
              </p>
            </div>

            <ul className="office-dashboard__legend" aria-label="מקרא">
              <li>
                <span className="office-dashboard__legend-swatch office-dashboard__legend-swatch--kpi" />
                מדד
              </li>
              <li>
                <span className="office-dashboard__legend-swatch office-dashboard__legend-swatch--policy" />
                מדיניות
              </li>
              <li>
                <span className="office-dashboard__legend-swatch office-dashboard__legend-swatch--alert" />
                התראה
              </li>
            </ul>
          </header>

          {error ? (
            <p className="office-dashboard__error" role="alert">
              לא ניתן לטעון את דשבורד הממשלה
            </p>
          ) : null}

          <div
            className={`office-dashboard__layout${
              selectedOffice ? ' office-dashboard__layout--open' : ''
            }`}
          >
            {selectedOffice && !loading && !error ? (
              <DetailPanel
                offices={offices}
                office={selectedOffice}
                selectedIndex={selectedIndex}
                onSelectOffice={setSelectedOfficeId}
                onSelectIndex={(index) => setSelectedIndexId(index.id)}
                shareUrl={shareUrl}
              />
            ) : null}

            <section
              className="office-dashboard__quadrant"
              aria-label="משרדים"
            >
              {loading
                ? Array.from({ length: 4 }, (_, i) => (
                    <div
                      key={i}
                      className="office-cluster office-cluster--skeleton"
                      aria-hidden="true"
                    />
                  ))
                : offices.map((office) => (
                    <OfficeCluster
                      key={office.id}
                      office={office}
                      selected={office.id === selectedOfficeId}
                      onSelect={() => setSelectedOfficeId(office.id)}
                    />
                  ))}
            </section>
          </div>
        </div>
      </main>
    </SiteLayout>
  )
}

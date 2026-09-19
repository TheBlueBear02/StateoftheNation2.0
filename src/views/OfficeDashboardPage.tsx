'use client'

import { useEffect, useMemo, useState } from 'react'
import { PageBreadcrumb } from '../components/PageBreadcrumb'
import { SiteLayout } from '../components/SiteLayout'
import { IndexTrendChart } from '../components/government/IndexTrendChart'
import { useOfficeDashboard } from '../hooks/useOfficeDashboard'
import {
  formatIndexValue,
  formatPercentChange,
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
          />
        ))}
        <span className="office-cluster__minister">
          {minister?.imageUrl ? (
            <img
              src={minister.imageUrl}
              alt=""
              className="office-cluster__minister-img"
              width={88}
              height={88}
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
  office: OfficeDashboardOffice
  selectedIndex: OfficeDashboardIndex | null
  onSelectIndex: (index: OfficeDashboardIndex) => void
  onClose: () => void
}

function DetailPanel({
  office,
  selectedIndex,
  onSelectIndex,
  onClose,
}: DetailPanelProps) {
  const minister = office.minister
  const cards = [...office.kpis, ...office.policies]

  return (
    <aside
      className="office-dashboard__panel"
      aria-label={`פירוט ${office.name}`}
    >
      <div className="office-dashboard__panel-header">
        <div className="office-dashboard__panel-identity">
          {minister?.imageUrl ? (
            <img
              src={minister.imageUrl}
              alt=""
              className="office-dashboard__panel-photo"
              width={64}
              height={64}
            />
          ) : (
            <span className="office-dashboard__panel-initials">
              {initials(minister?.fullName ?? office.name)}
            </span>
          )}
          <div>
            <h2 className="office-dashboard__panel-title">{office.name}</h2>
            {minister ? (
              <p className="office-dashboard__panel-minister">
                {minister.fullName}
                {minister.dutyDesc ? ` · ${minister.dutyDesc}` : ''}
              </p>
            ) : null}
          </div>
        </div>
        <button
          type="button"
          className="office-dashboard__panel-close"
          onClick={onClose}
          aria-label="סגירת פירוט"
        >
          ×
        </button>
      </div>

      {office.info ? (
        <p className="office-dashboard__panel-info">{office.info}</p>
      ) : null}

      <div className="office-dashboard__cards" role="list">
        {cards.map((index) => {
          const isActive = selectedIndex?.id === index.id
          const change = formatPercentChange(index.percentChange)
          const changeTone =
            index.percentChange === null || index.percentChange === 0
              ? ''
              : index.percentChange > 0
                ? ' office-dashboard__card-change--up'
                : ' office-dashboard__card-change--down'

          return (
            <button
              key={index.id}
              type="button"
              role="listitem"
              className={`office-dashboard__card${
                index.alert ? ' office-dashboard__card--alert' : ''
              }${index.isKpi ? '' : ' office-dashboard__card--policy'}${
                isActive ? ' office-dashboard__card--active' : ''
              }`}
              onClick={() => onSelectIndex(index)}
              aria-pressed={isActive}
            >
              <span
                className={`office-dashboard__card-dot${
                  index.alert
                    ? ' office-dashboard__card-dot--alert'
                    : index.isKpi
                      ? ' office-dashboard__card-dot--kpi'
                      : ' office-dashboard__card-dot--policy'
                }`}
                aria-hidden="true"
              />
              <span className="office-dashboard__card-body">
                <span className="office-dashboard__card-name">{index.name}</span>
                <span className="office-dashboard__card-value">
                  {formatIndexValue(index.latestValue)}
                </span>
                {index.latestLabel ? (
                  <span className="office-dashboard__card-date">
                    {index.latestLabel}
                  </span>
                ) : null}
              </span>
              {change ? (
                <span className={`office-dashboard__card-change${changeTone}`}>
                  {change}
                </span>
              ) : null}
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
          <IndexTrendChart index={selectedIndex} />
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
  const [selectedOfficeId, setSelectedOfficeId] = useState<number | null>(null)
  const [selectedIndexId, setSelectedIndexId] = useState<number | null>(null)

  const selectedOffice =
    offices.find((o) => o.id === selectedOfficeId) ?? null

  const selectedIndex =
    selectedOffice?.indexes.find((i) => i.id === selectedIndexId) ?? null

  useEffect(() => {
    if (selectedOfficeId !== null) return
    if (offices.length === 0) return
    setSelectedOfficeId(offices[0]!.id)
  }, [offices, selectedOfficeId])

  useEffect(() => {
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

            {selectedOffice && !loading && !error ? (
              <DetailPanel
                office={selectedOffice}
                selectedIndex={selectedIndex}
                onSelectIndex={(index) => setSelectedIndexId(index.id)}
                onClose={() => {
                  setSelectedOfficeId(null)
                  setSelectedIndexId(null)
                }}
              />
            ) : null}
          </div>
        </div>
      </main>
    </SiteLayout>
  )
}

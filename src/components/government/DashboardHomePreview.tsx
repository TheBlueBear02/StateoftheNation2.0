'use client'

import { useMemo } from 'react'
import { useOfficeDashboard } from '../../hooks/useOfficeDashboard'
import type {
  OfficeDashboardIndex,
  OfficeDashboardOffice,
} from '../../lib/fetchOfficeDashboard'

const GRID_SIZE = 16
const MINISTER_PLACEHOLDER = '/images/offices/minister_placeholder.svg'

/**
 * Each 2×2 quarter of the 4×4 grid: three index cells + one minister cell.
 * Laid out LTR so quarters match office display order top-left → bottom-right.
 */
const QUARTERS = [
  { iconCells: [0, 1, 4], ministerCell: 5 },
  { iconCells: [2, 3, 7], ministerCell: 6 },
  { iconCells: [8, 12, 13], ministerCell: 9 },
  { iconCells: [11, 14, 15], ministerCell: 10 },
] as const

type PreviewCell =
  | {
      kind: 'icon'
      key: string
      icon: string
      alert: boolean
      isKpi: boolean
    }
  | {
      kind: 'minister'
      key: string
      imageUrl: string
      name: string
    }

function pickOfficeIndexes(office: OfficeDashboardOffice): OfficeDashboardIndex[] {
  const ordered = [...office.kpis, ...office.policies]
  return ordered.slice(0, 3)
}

function buildCells(offices: OfficeDashboardOffice[]): PreviewCell[] {
  const cells: Array<PreviewCell | null> = Array.from(
    { length: GRID_SIZE },
    () => null,
  )

  QUARTERS.forEach((quarter, officeIndex) => {
    const office = offices[officeIndex]
    if (!office) {
      for (const cellIndex of quarter.iconCells) {
        cells[cellIndex] = {
          kind: 'icon',
          key: `empty-icon-${officeIndex}-${cellIndex}`,
          icon: '/images/offices/white_bag.png',
          alert: false,
          isKpi: true,
        }
      }
      cells[quarter.ministerCell] = {
        kind: 'minister',
        key: `empty-minister-${officeIndex}`,
        imageUrl: MINISTER_PLACEHOLDER,
        name: 'שר/ה',
      }
      return
    }

    const indexes = pickOfficeIndexes(office)
    quarter.iconCells.forEach((cellIndex, i) => {
      const index = indexes[i]
      if (index) {
        cells[cellIndex] = {
          kind: 'icon',
          key: `icon-${office.id}-${index.id}`,
          icon: index.icon,
          alert: index.alert,
          isKpi: index.isKpi,
        }
      } else {
        cells[cellIndex] = {
          kind: 'icon',
          key: `icon-pad-${office.id}-${i}`,
          icon: '/images/offices/white_bag.png',
          alert: false,
          isKpi: true,
        }
      }
    })

    cells[quarter.ministerCell] = {
      kind: 'minister',
      key: `minister-${office.id}`,
      imageUrl: office.minister?.imageUrl || MINISTER_PLACEHOLDER,
      name: office.minister?.fullName || office.name,
    }
  })

  return cells.map(
    (cell, i) =>
      cell ?? {
        kind: 'icon' as const,
        key: `missing-${i}`,
        icon: '/images/offices/white_bag.png',
        alert: false,
        isKpi: true,
      },
  )
}

/**
 * Homepage teaser: 4×4 circles — each quadrant is one dashboard office
 * (3 index icons + that office’s minister in the inner cell).
 */
export function DashboardHomePreview() {
  const { offices, loading } = useOfficeDashboard()

  const cells = useMemo(
    () => (offices.length > 0 ? buildCells(offices) : null),
    [offices],
  )

  const showSkeleton = loading || !cells

  return (
    <div className="dashboard-preview" dir="ltr" aria-hidden="true">
      <div className="dashboard-preview__grid">
        {showSkeleton
          ? Array.from({ length: GRID_SIZE }, (_, index) => {
              const isMinister = QUARTERS.some((q) => q.ministerCell === index)
              return (
                <div
                  key={`skeleton-${index}`}
                  className={`dashboard-preview__cell dashboard-preview__cell--skeleton${
                    isMinister ? ' dashboard-preview__cell--minister' : ''
                  }`}
                />
              )
            })
          : cells.map((cell) =>
              cell.kind === 'minister' ? (
                <div
                  key={cell.key}
                  className="dashboard-preview__cell dashboard-preview__cell--minister"
                >
                  <img
                    src={cell.imageUrl}
                    alt=""
                    className="dashboard-preview__cell-img dashboard-preview__cell-img--photo"
                    width={96}
                    height={96}
                    loading="lazy"
                    decoding="async"
                  />
                </div>
              ) : (
                <div
                  key={cell.key}
                  className={`dashboard-preview__cell${
                    cell.alert
                      ? ' dashboard-preview__cell--alert'
                      : cell.isKpi
                        ? ' dashboard-preview__cell--kpi'
                        : ' dashboard-preview__cell--policy'
                  }`}
                >
                  <img
                    src={cell.icon}
                    alt=""
                    className="dashboard-preview__cell-img"
                    width={40}
                    height={40}
                    loading="lazy"
                    decoding="async"
                  />
                </div>
              ),
            )}
      </div>
      <div className="dashboard-preview__axis dashboard-preview__axis--vertical" />
      <div className="dashboard-preview__axis dashboard-preview__axis--horizontal" />
    </div>
  )
}

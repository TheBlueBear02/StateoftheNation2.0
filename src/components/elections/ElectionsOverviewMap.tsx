'use client'

import {
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type FocusEvent,
  type MouseEvent,
} from 'react'
import type { ElectionOverviewMapPin } from '../../hooks/useAllElectionMapPins'
import type { ElectionParty } from '../../lib/supabase'
import {
  MAP_IMAGE_SRC,
  MAP_VIEWBOX,
  buildProjectedPins,
  type ProjectedPin,
} from '../../lib/candidateMapProjection'
import { CandidateMapTooltip } from './CandidateMapTooltip'

type ElectionsOverviewMapProps = {
  parties: ElectionParty[]
  pins: ElectionOverviewMapPin[]
  loading: boolean
}

type OverviewProjectedPin = ProjectedPin<ElectionOverviewMapPin>

function getPartyPinCount(
  pins: ElectionOverviewMapPin[],
  partyId: number,
): number {
  return pins.filter((pin) => pin.partyId === partyId).length
}

export function ElectionsOverviewMap({
  parties,
  pins,
  loading,
}: ElectionsOverviewMapProps) {
  const [selectedPartyIds, setSelectedPartyIds] = useState<Set<number>>(
    () => new Set(),
  )
  const [hoveredPin, setHoveredPin] = useState<OverviewProjectedPin | null>(null)
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 })

  const partiesWithPins = useMemo(
    () =>
      parties.filter((party) => getPartyPinCount(pins, party.id) > 0),
    [parties, pins],
  )

  useEffect(() => {
    setSelectedPartyIds(new Set(partiesWithPins.map((party) => party.id)))
  }, [partiesWithPins])

  useEffect(() => {
    if (loading) {
      setHoveredPin(null)
    }
  }, [loading])

  const filteredPins = useMemo(
    () => pins.filter((pin) => selectedPartyIds.has(pin.partyId)),
    [pins, selectedPartyIds],
  )
  const projectedPins = buildProjectedPins(filteredPins)
  const allSelected =
    partiesWithPins.length > 0 &&
    partiesWithPins.every((party) => selectedPartyIds.has(party.id))
  const noneSelected = selectedPartyIds.size === 0

  function toggleParty(partyId: number) {
    setSelectedPartyIds((current) => {
      const next = new Set(current)

      if (next.has(partyId)) {
        next.delete(partyId)
      } else {
        next.add(partyId)
      }

      return next
    })
  }

  function selectAllParties() {
    setSelectedPartyIds(new Set(partiesWithPins.map((party) => party.id)))
  }

  function clearAllParties() {
    setSelectedPartyIds(new Set())
  }

  function handleMove(event: MouseEvent<SVGGElement>) {
    setTooltipPosition({ x: event.clientX, y: event.clientY })
  }

  function handleFocus(event: FocusEvent<SVGGElement>, pin: OverviewProjectedPin) {
    setHoveredPin(pin)
    const rect = event.currentTarget.getBoundingClientRect()
    setTooltipPosition({
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    })
  }

  return (
    <section
      className="party-detail-card elections-overview-map"
      aria-labelledby="elections-overview-map-title"
    >
      <div className="party-detail-card__header">
        <p className="party-detail-card__eyebrow">מפה</p>
        <h2 id="elections-overview-map-title" className="party-detail-card__title">
          איפה גרים המועמדים
        </h2>
      </div>

      {partiesWithPins.length > 0 ? (
        <div className="elections-overview-map__filters">
          <div className="elections-overview-map__filters-header">
            <p className="elections-overview-map__filters-label">סינון לפי מפלגה</p>
            <div className="elections-overview-map__filters-actions">
              <button
                type="button"
                className="elections-overview-map__filters-action"
                onClick={selectAllParties}
                disabled={allSelected || loading}
              >
                בחר הכל
              </button>
              <button
                type="button"
                className="elections-overview-map__filters-action"
                onClick={clearAllParties}
                disabled={noneSelected || loading}
              >
                נקה
              </button>
            </div>
          </div>

          <div
            className="elections-overview-map__party-list"
            role="group"
            aria-label="בחירת מפלגות להצגה על המפה"
          >
            {partiesWithPins.map((party) => {
              const partyName = party.shortName ?? party.name
              const accentColor = party.color ?? '#4890fd'
              const isSelected = selectedPartyIds.has(party.id)
              const pinCount = getPartyPinCount(pins, party.id)

              return (
                <label
                  key={party.id}
                  className={`elections-overview-map__party-option${
                    isSelected ? ' elections-overview-map__party-option--selected' : ''
                  }`}
                  style={{ '--party-color': accentColor } as CSSProperties}
                >
                  <input
                    type="checkbox"
                    className="elections-overview-map__party-checkbox"
                    checked={isSelected}
                    disabled={loading}
                    onChange={() => toggleParty(party.id)}
                  />
                  <span
                    className="elections-overview-map__party-swatch"
                    aria-hidden="true"
                  />
                  <span className="elections-overview-map__party-copy">
                    <span className="elections-overview-map__party-name">
                      {partyName}
                    </span>
                    <span className="elections-overview-map__party-count">
                      {pinCount} מועמדים
                    </span>
                  </span>
                </label>
              )
            })}
          </div>
        </div>
      ) : null}

      <div className="candidate-map__layout elections-overview-map__layout">
        <div className="candidate-map__canvas">
          <svg
            className={`candidate-map__svg${loading ? ' candidate-map__svg--loading' : ''}`}
            viewBox={`0 0 ${MAP_VIEWBOX.width} ${MAP_VIEWBOX.height}`}
            role="img"
            aria-label="מפת ישראל עם נקודות לפי עיר מגורי המועמדים"
          >
            <image
              className="candidate-map__image"
              href={MAP_IMAGE_SRC}
              width={MAP_VIEWBOX.width}
              height={MAP_VIEWBOX.height}
              preserveAspectRatio="xMidYMid meet"
            />

            <g className="candidate-map__pins" role="list">
              {projectedPins.map((pin) => {
                const accentColor = pin.partyColor ?? '#4890fd'

                return (
                  <g
                    key={pin.id}
                    className="candidate-map__pin-group"
                    style={{ '--party-color': accentColor } as CSSProperties}
                    role="listitem"
                    tabIndex={0}
                    aria-label={`${pin.fullName}, ${pin.partyName}, ${pin.city}`}
                    onMouseEnter={() => setHoveredPin(pin)}
                    onMouseLeave={() => setHoveredPin(null)}
                    onMouseMove={handleMove}
                    onFocus={(event) => handleFocus(event, pin)}
                    onBlur={() => setHoveredPin(null)}
                  >
                    <circle
                      className="candidate-map__pin-hit-area"
                      cx={pin.x}
                      cy={pin.y}
                      r={15}
                    />
                    <circle
                      className="candidate-map__pin"
                      cx={pin.x}
                      cy={pin.y}
                      r={pin.offsetIndex === 0 ? 7 : 5.8}
                    />
                  </g>
                )
              })}
            </g>
          </svg>

          {hoveredPin ? (
            <CandidateMapTooltip
              fullName={hoveredPin.fullName}
              city={hoveredPin.city}
              partyName={hoveredPin.partyName}
              imageUrl={hoveredPin.imageUrl}
              accentColor={hoveredPin.partyColor ?? '#4890fd'}
              totalYearsInKnesset={hoveredPin.totalYearsInKnesset}
              x={tooltipPosition.x}
              y={tooltipPosition.y}
            />
          ) : null}
        </div>

        <div className="candidate-map__copy">
          <p className="candidate-map__count elections-overview-map__count">
            {loading
              ? 'טוען נקודות...'
              : noneSelected
                ? 'בחרו מפלגה אחת לפחות כדי להציג נקודות'
                : `מציג ${filteredPins.length} מועמדים מ-${selectedPartyIds.size} מפלגות`}
          </p>
          <p className="candidate-map__note">
            נקודות מוצגות רק עבור מועמדים שעיר מגורם נמצאת במערכת.
          </p>
        </div>
      </div>

      {!loading && pins.length === 0 ? (
        <p className="candidate-map__empty">
          אין עדיין קואורדינטות זמינות למועמדי הבחירות.
        </p>
      ) : null}
    </section>
  )
}

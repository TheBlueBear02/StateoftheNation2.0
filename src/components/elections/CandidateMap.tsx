'use client'

import { useEffect, useState, type CSSProperties, type FocusEvent, type MouseEvent } from 'react'
import type { CandidateMapPin } from '../../hooks/useElectionCandidates'
import {
  MAP_IMAGE_SRC,
  MAP_VIEWBOX,
  buildProjectedPins,
  type ProjectedPin,
} from '../../lib/candidateMapProjection'
import { CandidateMapTooltip } from './CandidateMapTooltip'

type CandidateMapProps = {
  pins: CandidateMapPin[]
  partyName: string
  partyLogoUrl: string | null
  partyColor: string | null
  loading: boolean
}

type PartyProjectedPin = ProjectedPin<CandidateMapPin>

export function CandidateMap({
  pins,
  partyName,
  partyLogoUrl,
  partyColor,
  loading,
}: CandidateMapProps) {
  const accentColor = partyColor ?? '#4890fd'
  const style = { '--party-color': accentColor } as CSSProperties
  const projectedPins = buildProjectedPins(pins)
  const [hoveredPin, setHoveredPin] = useState<PartyProjectedPin | null>(null)
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 })

  useEffect(() => {
    if (loading) {
      setHoveredPin(null)
    }
  }, [loading])

  function handleMove(event: MouseEvent<SVGGElement>) {
    setTooltipPosition({ x: event.clientX, y: event.clientY })
  }

  function handleFocus(event: FocusEvent<SVGGElement>, pin: PartyProjectedPin) {
    setHoveredPin(pin)
    const rect = event.currentTarget.getBoundingClientRect()
    setTooltipPosition({
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    })
  }

  return (
    <section
      className="party-detail-card candidate-map"
      style={style}
      aria-labelledby="candidate-map-title"
    >
      {partyLogoUrl ? (
        <span className="candidate-map__logo-badge">
          <img className="candidate-map__logo" src={partyLogoUrl} alt="" />
        </span>
      ) : null}

      <div className="party-detail-card__header">
        <p className="party-detail-card__eyebrow">על המפה</p>
        <h2 id="candidate-map-title" className="party-detail-card__title">
          איפה גרים המועמדים
        </h2>
      </div>

      <div className="candidate-map__layout">
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
              {projectedPins.map((pin) => (
                <g
                  key={pin.id}
                  className="candidate-map__pin-group"
                  role="listitem"
                  tabIndex={0}
                  aria-label={`${pin.fullName}, ${pin.city}`}
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
              ))}
            </g>
          </svg>

          {hoveredPin ? (
            <CandidateMapTooltip
              fullName={hoveredPin.fullName}
              city={hoveredPin.city}
              imageUrl={hoveredPin.imageUrl}
              accentColor={accentColor}
              totalYearsInKnesset={hoveredPin.totalYearsInKnesset}
              x={tooltipPosition.x}
              y={tooltipPosition.y}
            />
          ) : null}
        </div>

        <div className="candidate-map__copy">
          <p className="candidate-map__count">
            {loading
              ? 'טוען נקודות...'
              : `מציג ${pins.length} מועמדים מרשימת ${partyName}`}
          </p>
          <p className="candidate-map__note">
            נקודות מוצגות רק עבור מועמדים שעיר מגורם נמצאת במערכת.
          </p>
        </div>
      </div>

      {!loading && pins.length === 0 ? (
        <p className="candidate-map__empty">
          אין עדיין קואורדינטות זמינות למועמדי המפלגה.
        </p>
      ) : null}
    </section>
  )
}

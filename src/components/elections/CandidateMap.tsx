'use client'

import {
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type FocusEvent,
  type MouseEvent,
} from 'react'
import type { CandidateMapPin } from '../../hooks/useElectionCandidates'
import {
  MAP_IMAGE_SRC,
  MAP_VIEWBOX,
  buildProjectedPins,
  groupPinsByCity,
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
  const projectedPins = useMemo(() => buildProjectedPins(pins), [pins])
  const pinsByCity = useMemo(
    () => groupPinsByCity(projectedPins),
    [projectedPins],
  )
  const [hoveredCity, setHoveredCity] = useState<string | null>(null)
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 })

  const hoveredPeople = hoveredCity
    ? (pinsByCity.get(hoveredCity.trim()) ?? [])
    : []

  useEffect(() => {
    if (loading) {
      setHoveredCity(null)
    }
  }, [loading])

  function handleMove(event: MouseEvent<SVGGElement>) {
    setTooltipPosition({ x: event.clientX, y: event.clientY })
  }

  function handleFocus(event: FocusEvent<SVGGElement>, pin: PartyProjectedPin) {
    setHoveredCity(pin.city.trim())
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
              {projectedPins.map((pin) => {
                const cityKey = pin.city.trim()
                const cityMates = pinsByCity.get(cityKey) ?? [pin]
                const isCityHovered = hoveredCity?.trim() === cityKey
                const ariaExtra =
                  cityMates.length > 1
                    ? `, ועוד ${cityMates.length - 1} מ${pin.city}`
                    : ''

                return (
                  <g
                    key={pin.id}
                    className={`candidate-map__pin-group${
                      isCityHovered ? ' candidate-map__pin-group--active' : ''
                    }`}
                    role="listitem"
                    tabIndex={0}
                    aria-label={`${pin.fullName}, ${pin.city}${ariaExtra}`}
                    onMouseEnter={() => setHoveredCity(cityKey)}
                    onMouseLeave={() => setHoveredCity(null)}
                    onMouseMove={handleMove}
                    onFocus={(event) => handleFocus(event, pin)}
                    onBlur={() => setHoveredCity(null)}
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

          {hoveredPeople.length > 0 && hoveredCity ? (
            <CandidateMapTooltip
              city={hoveredCity}
              people={hoveredPeople.map((pin) => ({
                id: pin.id,
                fullName: pin.fullName,
                imageUrl: pin.imageUrl,
                accentColor,
                totalYearsInKnesset: pin.totalYearsInKnesset,
              }))}
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

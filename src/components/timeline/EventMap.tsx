'use client'

import { useEffect, useRef } from 'react'
import type { Map as LeafletMap } from 'leaflet'
import 'leaflet/dist/leaflet.css'

interface EventMapProps {
  name: string
  country?: string
  lat: number
  lng: number
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function placeLabel(name: string, country?: string): string {
  if (country && country !== name) return `${name}, ${country}`
  return name
}

export function EventMap({ name, country, lat, lng }: EventMapProps) {
  const label = placeLabel(name, country)
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<LeafletMap | null>(null)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    let cancelled = false

    const setup = async () => {
      const L = (await import('leaflet')).default
      if (cancelled || !containerRef.current) return

      if (mapRef.current) {
        mapRef.current.remove()
        mapRef.current = null
      }

      const map = L.map(containerRef.current, {
        zoomControl: true,
        attributionControl: true,
        dragging: true,
        scrollWheelZoom: true,
        doubleClickZoom: true,
        boxZoom: true,
        keyboard: true,
        touchZoom: true,
      }).setView([lat, lng], 6)

      map.zoomControl.setPosition('bottomleft')

      L.tileLayer(
        'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}',
        {
          attribution:
            'Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ',
          maxZoom: 16,
        },
      ).addTo(map)

      const icon = L.divIcon({
        className: 'timeline-modal__map-marker',
        html: `
          <span class="timeline-modal__map-marker-label" dir="rtl">${escapeHtml(label)}</span>
          <span class="timeline-modal__map-marker-dot" aria-hidden="true"></span>
        `,
        iconSize: [0, 0],
        iconAnchor: [0, 0],
      })

      L.marker([lat, lng], {
        icon,
        interactive: false,
        keyboard: false,
      }).addTo(map)

      mapRef.current = map
      requestAnimationFrame(() => map.invalidateSize())
    }

    void setup()

    const onResize = () => mapRef.current?.invalidateSize()
    window.addEventListener('resize', onResize)

    return () => {
      cancelled = true
      window.removeEventListener('resize', onResize)
      mapRef.current?.remove()
      mapRef.current = null
    }
  }, [lat, lng, label])

  return (
    <div className="timeline-modal__map timeline-modal__map--live">
      <div
        ref={containerRef}
        className="timeline-modal__map-frame"
        role="img"
        aria-label={`מפה · ${label}`}
      />
      <a
        className="timeline-modal__map-link"
        href={`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=12/${lat}/${lng}`}
        target="_blank"
        rel="noreferrer"
      >
        מפה · {label}
      </a>
    </div>
  )
}

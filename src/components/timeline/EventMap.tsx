'use client'

import { useEffect, useRef } from 'react'
import type { Map as LeafletMap } from 'leaflet'
import 'leaflet/dist/leaflet.css'

interface EventMapProps {
  name: string
  lat: number
  lng: number
}

export function EventMap({ name, lat, lng }: EventMapProps) {
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
      }).setView([lat, lng], 8)

      map.zoomControl.setPosition('bottomleft')

      L.tileLayer(
        'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}',
        {
          attribution:
            'Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ',
          maxZoom: 16,
        },
      ).addTo(map)

      const marker = L.circleMarker([lat, lng], {
        radius: 7,
        color: '#1a1a1a',
        weight: 1.5,
        fillColor: '#3b7ae6',
        fillOpacity: 0.9,
      }).addTo(map)

      marker.bindTooltip(name, {
        direction: 'top',
        offset: [0, -8],
        opacity: 0.95,
      })

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
  }, [lat, lng, name])

  return (
    <div className="timeline-modal__map timeline-modal__map--live">
      <div
        ref={containerRef}
        className="timeline-modal__map-frame"
        role="img"
        aria-label={`מפה · ${name}`}
      />
      <a
        className="timeline-modal__map-link"
        href={`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=12/${lat}/${lng}`}
        target="_blank"
        rel="noreferrer"
      >
        מפה · {name}
      </a>
    </div>
  )
}

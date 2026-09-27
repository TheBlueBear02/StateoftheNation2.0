'use client'

import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'

export interface TimelineViewport {
  viewStart: number
  viewEnd: number
  zoomIn: () => void
  zoomOut: () => void
  showAll: () => void
  isFitted: boolean
}

const MIN_SPAN_YEARS = 1 / 12 // ~1 month
const ZOOM_FACTOR = 1.25

export function useTimelineViewport(
  containerRef: RefObject<HTMLElement | null>,
  dataMin: number,
  dataMax: number,
): TimelineViewport {
  const [viewStart, setViewStart] = useState(dataMin)
  const [viewEnd, setViewEnd] = useState(dataMax)
  const viewRef = useRef({ start: dataMin, end: dataMax })
  const dragRef = useRef<{
    pointerId: number
    startX: number
    startViewStart: number
    startViewEnd: number
  } | null>(null)
  const pinchRef = useRef<{
    distance: number
    midYear: number
    span: number
  } | null>(null)

  const fullSpan = Math.max(dataMax - dataMin, MIN_SPAN_YEARS)

  const clampView = useCallback(
    (start: number, end: number) => {
      let span = end - start
      if (span < MIN_SPAN_YEARS) {
        const mid = (start + end) / 2
        start = mid - MIN_SPAN_YEARS / 2
        end = mid + MIN_SPAN_YEARS / 2
        span = MIN_SPAN_YEARS
      }
      if (span > fullSpan) {
        return { start: dataMin, end: dataMax }
      }
      if (start < dataMin) {
        end += dataMin - start
        start = dataMin
      }
      if (end > dataMax) {
        start -= end - dataMax
        end = dataMax
      }
      if (start < dataMin) start = dataMin
      return { start, end }
    },
    [dataMin, dataMax, fullSpan],
  )

  const applyView = useCallback(
    (start: number, end: number) => {
      const next = clampView(start, end)
      viewRef.current = next
      setViewStart(next.start)
      setViewEnd(next.end)
    },
    [clampView],
  )

  // Reset when data range changes
  useEffect(() => {
    applyView(dataMin, dataMax)
  }, [dataMin, dataMax, applyView])

  const zoomAround = useCallback(
    (factor: number, anchorYear: number) => {
      const { start, end } = viewRef.current
      const span = end - start
      const newSpan = span * factor
      const t = span > 0 ? (anchorYear - start) / span : 0.5
      applyView(anchorYear - newSpan * t, anchorYear + newSpan * (1 - t))
    },
    [applyView],
  )

  const zoomIn = useCallback(() => {
    const { start, end } = viewRef.current
    zoomAround(1 / ZOOM_FACTOR, (start + end) / 2)
  }, [zoomAround])

  const zoomOut = useCallback(() => {
    const { start, end } = viewRef.current
    zoomAround(ZOOM_FACTOR, (start + end) / 2)
  }, [zoomAround])

  const showAll = useCallback(() => {
    applyView(dataMin, dataMax)
  }, [applyView, dataMin, dataMax])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const yearAtClientX = (clientX: number) => {
      const rect = el.getBoundingClientRect()
      const t = rect.width > 0 ? (clientX - rect.left) / rect.width : 0.5
      const { start, end } = viewRef.current
      return start + t * (end - start)
    }

    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      const factor = event.deltaY > 0 ? ZOOM_FACTOR : 1 / ZOOM_FACTOR
      zoomAround(factor, yearAtClientX(event.clientX))
    }

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return
      // Don't start pan if interacting with a button/event inside
      const target = event.target as HTMLElement | null
      if (target?.closest('[data-timeline-no-pan]')) return

      dragRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startViewStart: viewRef.current.start,
        startViewEnd: viewRef.current.end,
      }
      el.setPointerCapture(event.pointerId)
    }

    const onPointerMove = (event: PointerEvent) => {
      const drag = dragRef.current
      if (!drag || drag.pointerId !== event.pointerId) return
      const rect = el.getBoundingClientRect()
      if (rect.width <= 0) return
      const span = drag.startViewEnd - drag.startViewStart
      const dxYears = ((event.clientX - drag.startX) / rect.width) * span
      applyView(drag.startViewStart - dxYears, drag.startViewEnd - dxYears)
    }

    const onPointerUp = (event: PointerEvent) => {
      if (dragRef.current?.pointerId === event.pointerId) {
        dragRef.current = null
      }
    }

    const touchDistance = (touches: TouchList) => {
      const a = touches[0]
      const b = touches[1]
      const dx = a.clientX - b.clientX
      const dy = a.clientY - b.clientY
      return Math.hypot(dx, dy)
    }

    const onTouchStart = (event: TouchEvent) => {
      if (event.touches.length === 2) {
        dragRef.current = null
        const dist = touchDistance(event.touches)
        const midX =
          (event.touches[0].clientX + event.touches[1].clientX) / 2
        pinchRef.current = {
          distance: dist,
          midYear: yearAtClientX(midX),
          span: viewRef.current.end - viewRef.current.start,
        }
      }
    }

    const onTouchMove = (event: TouchEvent) => {
      const pinch = pinchRef.current
      if (!pinch || event.touches.length !== 2) return
      event.preventDefault()
      const dist = touchDistance(event.touches)
      if (pinch.distance <= 0) return
      const factor = pinch.distance / dist
      const newSpan = pinch.span * factor
      const midX =
        (event.touches[0].clientX + event.touches[1].clientX) / 2
      const midYear = yearAtClientX(midX)
      // Keep original midYear as zoom anchor for stability
      const t = 0.5
      void midYear
      applyView(
        pinch.midYear - newSpan * t,
        pinch.midYear + newSpan * (1 - t),
      )
    }

    const onTouchEnd = (event: TouchEvent) => {
      if (event.touches.length < 2) pinchRef.current = null
    }

    el.addEventListener('wheel', onWheel, { passive: false })
    el.addEventListener('pointerdown', onPointerDown)
    el.addEventListener('pointermove', onPointerMove)
    el.addEventListener('pointerup', onPointerUp)
    el.addEventListener('pointercancel', onPointerUp)
    el.addEventListener('touchstart', onTouchStart, { passive: true })
    el.addEventListener('touchmove', onTouchMove, { passive: false })
    el.addEventListener('touchend', onTouchEnd)
    el.addEventListener('touchcancel', onTouchEnd)

    return () => {
      el.removeEventListener('wheel', onWheel)
      el.removeEventListener('pointerdown', onPointerDown)
      el.removeEventListener('pointermove', onPointerMove)
      el.removeEventListener('pointerup', onPointerUp)
      el.removeEventListener('pointercancel', onPointerUp)
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchmove', onTouchMove)
      el.removeEventListener('touchend', onTouchEnd)
      el.removeEventListener('touchcancel', onTouchEnd)
    }
  }, [containerRef, applyView, zoomAround])

  const isFitted =
    Math.abs(viewStart - dataMin) < 0.01 && Math.abs(viewEnd - dataMax) < 0.01

  return {
    viewStart,
    viewEnd,
    zoomIn,
    zoomOut,
    showAll,
    isFitted,
  }
}

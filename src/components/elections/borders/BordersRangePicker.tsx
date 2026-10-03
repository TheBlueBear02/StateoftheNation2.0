'use client'

import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import {
  clampRange,
  type BordersRange,
} from '../../../lib/governmentBorders'

type BordersRangePickerProps = {
  columnCount: number
  range: BordersRange
  onChange: (range: BordersRange) => void
  governmentSeats: number
}

type DragMode = 'move' | 'start' | 'end'

function columnFromClientX(
  clientX: number,
  track: DOMRect,
  columnCount: number,
): number {
  if (columnCount <= 0) return 0
  // RTL track: inline-start is on the right.
  const ratio = (track.right - clientX) / track.width
  const index = Math.floor(ratio * columnCount)
  return Math.max(0, Math.min(columnCount - 1, index))
}

export function BordersRangePicker({
  columnCount,
  range,
  onChange,
  governmentSeats,
}: BordersRangePickerProps) {
  const trackRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{
    mode: DragMode
    originStart: number
    originEnd: number
    grabOffset: number
  } | null>(null)
  const [dragging, setDragging] = useState(false)

  const safe = clampRange(range, columnCount)
  const widthCols = columnCount > 0 ? safe.end - safe.start + 1 : 0
  const startPct = columnCount > 0 ? (safe.start / columnCount) * 100 : 0
  const widthPct = columnCount > 0 ? (widthCols / columnCount) * 100 : 0

  useEffect(() => {
    if (!dragging) return

    const onPointerMove = (event: PointerEvent) => {
      const drag = dragRef.current
      const track = trackRef.current
      if (!drag || !track || columnCount <= 0) return

      const col = columnFromClientX(event.clientX, track.getBoundingClientRect(), columnCount)

      if (drag.mode === 'move') {
        const span = drag.originEnd - drag.originStart
        let nextStart = col - drag.grabOffset
        nextStart = Math.max(0, Math.min(columnCount - 1 - span, nextStart))
        onChange({ start: nextStart, end: nextStart + span })
        return
      }

      if (drag.mode === 'start') {
        const nextStart = Math.min(col, drag.originEnd)
        onChange({ start: nextStart, end: drag.originEnd })
        return
      }

      const nextEnd = Math.max(col, drag.originStart)
      onChange({ start: drag.originStart, end: nextEnd })
    }

    const onPointerUp = () => {
      dragRef.current = null
      setDragging(false)
    }

    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
    window.addEventListener('pointercancel', onPointerUp)
    return () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('pointercancel', onPointerUp)
    }
  }, [dragging, columnCount, onChange])

  const beginDrag = (
    event: ReactPointerEvent,
    mode: DragMode,
  ) => {
    if (columnCount <= 0) return
    event.preventDefault()
    event.stopPropagation()
    const track = trackRef.current
    if (!track) return

    const col = columnFromClientX(
      event.clientX,
      track.getBoundingClientRect(),
      columnCount,
    )
    dragRef.current = {
      mode,
      originStart: safe.start,
      originEnd: safe.end,
      grabOffset: col - safe.start,
    }
    setDragging(true)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (columnCount <= 0) return
    const span = safe.end - safe.start
    const shift = event.shiftKey

    if (event.key === 'ArrowRight') {
      event.preventDefault()
      if (shift) {
        // Shrink from inline-start (right) — increase start.
        if (safe.start < safe.end) {
          onChange({ start: safe.start + 1, end: safe.end })
        }
      } else if (safe.start > 0) {
        onChange({ start: safe.start - 1, end: safe.end - 1 })
      }
      return
    }

    if (event.key === 'ArrowLeft') {
      event.preventDefault()
      if (shift) {
        // Grow toward inline-end (left) — increase end.
        if (safe.end < columnCount - 1) {
          onChange({ start: safe.start, end: safe.end + 1 })
        } else if (safe.start < safe.end) {
          // At edge: shrink from start instead when expanding isn't possible.
        }
      } else if (safe.end < columnCount - 1) {
        onChange({ start: safe.start + 1, end: safe.end + 1 })
      }
      return
    }

    if (event.key === 'Home') {
      event.preventDefault()
      onChange({ start: 0, end: span })
      return
    }

    if (event.key === 'End') {
      event.preventDefault()
      onChange({ start: columnCount - 1 - span, end: columnCount - 1 })
    }
  }

  if (columnCount === 0) {
    return null
  }

  return (
    <div className="borders-picker">
      <div
        ref={trackRef}
        className={
          dragging
            ? 'borders-picker__track borders-picker__track--dragging'
            : 'borders-picker__track'
        }
      >
        <div
          className="borders-picker__window"
          style={{
            insetInlineStart: `${startPct}%`,
            width: `${widthPct}%`,
          }}
          role="slider"
          tabIndex={0}
          aria-valuemin={0}
          aria-valuemax={columnCount - 1}
          aria-valuenow={safe.start}
          aria-valuetext={`מפלגות ${safe.start + 1} עד ${safe.end + 1} · ${governmentSeats} מנדטים`}
          aria-label="בחירת מפלגות לממשלה"
          onKeyDown={onKeyDown}
          onPointerDown={(event) => beginDrag(event, 'move')}
        >
          <button
            type="button"
            className="borders-picker__handle borders-picker__handle--start"
            aria-label="שינוי גבול ימני"
            tabIndex={-1}
            onPointerDown={(event) => beginDrag(event, 'start')}
          />
          <button
            type="button"
            className="borders-picker__handle borders-picker__handle--end"
            aria-label="שינוי גבול שמאלי"
            tabIndex={-1}
            onPointerDown={(event) => beginDrag(event, 'end')}
          />
        </div>
      </div>
      <p className="borders-picker__hint">
        גררו להזזה · משכו את הקצוות להרחבה או צמצום
      </p>
    </div>
  )
}

'use client'

import type { LaidOutEvent } from '@/content/timeline/types'
import { softenColor } from '@/lib/timeline/colors'
import { formatEventDateRange } from '@/lib/timeline/dates'
import { MIN_EVENT_WIDTH_PX, STATE_EMBLEM } from '@/lib/timeline/layout'

interface EventBlockProps {
  laid: LaidOutEvent
  left: number
  width: number
  top: number
  height: number
  onSelect: (laid: LaidOutEvent) => void
}

/** Rough width needed to show the full Hebrew title beside media. */
function titleFitsBesideMedia(
  title: string,
  blockWidth: number,
  mediaWidth: number,
): boolean {
  const padding = 16
  const gap = 8
  const charPx = 7.2
  const needed = mediaWidth + gap + title.length * charPx + padding
  return blockWidth >= needed
}

/** Only raster portraits are shown on event blocks (skip SVG placeholders). */
function isRasterPortrait(src: string): boolean {
  return /\.(png|jpe?g|webp|gif)(\?|$)/i.test(src)
}

export function EventBlock({
  laid,
  left,
  width,
  top,
  height,
  onSelect,
}: EventBlockProps) {
  const { event, colors, kind, portraits } = laid
  const resolvedWidth = Math.max(width, MIN_EVENT_WIDTH_PX)
  const isNarrow = resolvedWidth < 40
  const mediaSize = Math.max(18, Math.min(height - 4, 32))
  const isState = kind === 'state'
  const portraitUrls = isState ? [] : portraits.filter(isRasterPortrait)
  const showStateEmblem = isState && resolvedWidth >= 28
  const showPortraits = !isState && portraitUrls.length > 0 && resolvedWidth >= 28
  const showMedia = showStateEmblem || showPortraits
  const mediaClusterWidth =
    showPortraits && portraitUrls.length > 1
      ? mediaSize + (portraitUrls.length - 1) * Math.round(mediaSize * 0.55)
      : mediaSize
  const showFullTitle = showMedia
    ? titleFitsBesideMedia(event.title, resolvedWidth, mediaClusterWidth)
    : resolvedWidth >= 56
  const showTitle = showMedia ? showFullTitle : resolvedWidth >= 56
  const dateLabel = formatEventDateRange(event.startDate, event.endDate)
  const softColors = colors.map((c) => softenColor(c))

  const fillStyle =
    softColors.length === 1
      ? { backgroundColor: softColors[0] }
      : {
          backgroundColor: softColors[0],
          backgroundImage: `repeating-linear-gradient(135deg, ${softColors
            .map((c, i) => `${c} ${i * 8}px ${(i + 1) * 8}px`)
            .join(', ')})`,
        }

  const mediaLayoutClass = showMedia
    ? showFullTitle
      ? ' timeline-event--media-titled'
      : ' timeline-event--media-only'
    : ''

  return (
    <button
      type="button"
      className={`timeline-event timeline-event--${kind}${mediaLayoutClass}${isNarrow ? ' timeline-event--narrow' : ''}`}
      style={{
        left,
        width: resolvedWidth,
        top,
        height,
        ...fillStyle,
      }}
      title={`${event.title} · ${dateLabel}`}
      aria-label={`${event.title}, ${dateLabel}`}
      data-timeline-no-pan
      onClick={(e) => {
        e.stopPropagation()
        onSelect(laid)
      }}
    >
      {showStateEmblem ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={STATE_EMBLEM}
          alt=""
          className="timeline-event__emblem"
          width={mediaSize}
          height={mediaSize}
          draggable={false}
        />
      ) : null}

      {showPortraits ? (
        <span
          className={`timeline-event__portraits${portraitUrls.length > 1 ? ' timeline-event__portraits--stack' : ''}`}
          aria-hidden="true"
        >
          {portraitUrls.map((src, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={`${src}-${i}`}
              src={src}
              alt=""
              className="timeline-event__portrait"
              width={mediaSize}
              height={mediaSize}
              draggable={false}
              style={{ zIndex: portraitUrls.length - i }}
            />
          ))}
        </span>
      ) : null}

      {showTitle ? (
        <span className="timeline-event__title" dir="rtl">
          {event.title}
        </span>
      ) : null}
    </button>
  )
}

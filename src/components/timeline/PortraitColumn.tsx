'use client'

import type { TimelineRow } from '@/lib/timeline/layout'
import { STATE_EMBLEM } from '@/lib/timeline/layout'

interface PortraitColumnProps {
  rows: TimelineRow[]
  onTogglePerson: (id: string) => void
  onToggleState: () => void
}

export function PortraitColumn({
  rows,
  onTogglePerson,
  onToggleState,
}: PortraitColumnProps) {
  return (
    <aside className="timeline-portraits" aria-label="דמויות בציר הזמן">
      {rows.map((row) => {
        const hidden = Boolean(row.collapsed)

        if (row.kind === 'state') {
          return (
            <button
              key={row.id}
              type="button"
              className={`timeline-portrait timeline-portrait--state${hidden ? ' timeline-portrait--hidden' : ''}`}
              onClick={onToggleState}
              aria-pressed={!hidden}
              title={hidden ? 'הצג אירועי מדינה' : 'הסתר אירועי מדינה'}
              data-timeline-no-pan
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={STATE_EMBLEM}
                alt=""
                className="timeline-portrait__emblem"
                width={48}
                height={48}
                draggable={false}
              />
              <span className="timeline-portrait__name" dir="rtl">
                מדינה
              </span>
            </button>
          )
        }

        return (
          <button
            key={row.id}
            type="button"
            className={`timeline-portrait${hidden ? ' timeline-portrait--hidden' : ''}`}
            style={{
              ['--portrait-color' as string]: row.color,
            }}
            onClick={() => onTogglePerson(row.id)}
            aria-pressed={!hidden}
            title={
              hidden ? `הצג את ${row.label}` : `הסתר את ${row.label}`
            }
            data-timeline-no-pan
          >
            <span
              className="timeline-portrait__ring"
              style={{ borderColor: row.color }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={row.portrait}
                alt=""
                className="timeline-portrait__img"
                width={56}
                height={56}
                draggable={false}
              />
            </span>
            <span className="timeline-portrait__name" dir="rtl">
              {row.label}
            </span>
          </button>
        )
      })}
    </aside>
  )
}

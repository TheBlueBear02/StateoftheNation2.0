'use client'

import type { BordersChannel } from '../../../lib/governmentBorders'

type BordersToolbarProps = {
  channels: BordersChannel[]
  selectedChannelKey: string | null
  onChannelChange: (key: string) => void
}

export function BordersToolbar({
  channels,
  selectedChannelKey,
  onChannelChange,
}: BordersToolbarProps) {
  if (channels.length === 0) return null

  return (
    <div className="borders-toolbar">
      <div className="borders-toolbar__channels">
        <div
          className="borders-toolbar__channel-logos borders-toolbar__channel-logos--has-selection"
          role="group"
          aria-label="בחירת ערוץ"
        >
          {channels.map((channel) => {
            const isSelected = channel.key === selectedChannelKey
            return (
              <button
                key={channel.key}
                type="button"
                className={
                  isSelected
                    ? 'borders-toolbar__channel-btn borders-toolbar__channel-btn--selected'
                    : 'borders-toolbar__channel-btn'
                }
                aria-pressed={isSelected}
                aria-label={channel.label}
                title={channel.label}
                onClick={() => onChannelChange(channel.key)}
              >
                {channel.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    className="borders-toolbar__channel-logo"
                    src={channel.logoUrl}
                    alt=""
                    width={30}
                    height={30}
                    loading="lazy"
                    decoding="async"
                  />
                ) : (
                  <span className="borders-toolbar__channel-text">
                    {channel.label}
                  </span>
                )}
              </button>
            )
          })}
        </div>
        <p className="borders-toolbar__channel-hint">
          לבחירת סקר לפי ערוץ לחצו על הלוגו
        </p>
      </div>
    </div>
  )
}

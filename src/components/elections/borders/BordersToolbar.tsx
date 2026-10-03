'use client'

import {
  BORDERS_TOPICS,
  type BordersTopic,
} from '../../../content/governmentBordersTopics'
import type { BordersChannel } from '../../../lib/governmentBorders'
import { formatFieldwork } from '../../../lib/fetchPolls'

type BordersToolbarProps = {
  channels: BordersChannel[]
  selectedChannelKey: string | null
  onChannelChange: (key: string) => void
  topic: BordersTopic
  onTopicChange: (topicId: string) => void
}

export function BordersToolbar({
  channels,
  selectedChannelKey,
  onChannelChange,
  topic,
  onTopicChange,
}: BordersToolbarProps) {
  const selected = channels.find((c) => c.key === selectedChannelKey) ?? null

  return (
    <div className="borders-toolbar">
      <div className="borders-toolbar__topics" role="group" aria-label="ציר פוליטי">
        {BORDERS_TOPICS.map((item) => {
          const selectedTopic = item.id === topic.id
          return (
            <button
              key={item.id}
              type="button"
              className={
                selectedTopic
                  ? 'borders-toolbar__topic borders-toolbar__topic--selected'
                  : 'borders-toolbar__topic'
              }
              aria-pressed={selectedTopic}
              onClick={() => onTopicChange(item.id)}
            >
              {item.label}
            </button>
          )
        })}
      </div>

      {channels.length > 0 ? (
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
      ) : null}

      {selected ? (
        <p className="borders-toolbar__poll-meta">
          <span className="borders-toolbar__poll-channel">{selected.label}</span>
          <span className="borders-toolbar__poll-sep" aria-hidden="true">
            |
          </span>
          <span className="borders-toolbar__poll-date">
            {formatFieldwork(
              selected.poll.fieldworkStart,
              selected.poll.fieldworkEnd,
            )}
          </span>
        </p>
      ) : null}
    </div>
  )
}

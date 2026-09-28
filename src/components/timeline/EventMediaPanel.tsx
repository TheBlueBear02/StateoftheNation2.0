'use client'

interface EventMediaPanelProps {
  image?: string
  video?: string
  colors: string[]
}

function youtubeEmbedId(url: string): string | null {
  try {
    const parsed = new URL(url)
    if (parsed.hostname === 'youtu.be') {
      const id = parsed.pathname.replace(/^\//, '')
      return id || null
    }
    if (
      parsed.hostname === 'www.youtube.com' ||
      parsed.hostname === 'youtube.com' ||
      parsed.hostname === 'm.youtube.com'
    ) {
      return parsed.searchParams.get('v')
    }
  } catch {
    return null
  }
  return null
}

export function EventMediaPanel({ image, video, colors }: EventMediaPanelProps) {
  if (video) {
    const yt = youtubeEmbedId(video)
    if (yt) {
      return (
        <aside className="timeline-modal__media" aria-label="וידאו">
          <iframe
            className="timeline-modal__media-video"
            src={`https://www.youtube.com/embed/${yt}`}
            title="וידאו"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </aside>
      )
    }

    return (
      <aside className="timeline-modal__media" aria-label="וידאו">
        <video className="timeline-modal__media-video" src={video} controls playsInline />
      </aside>
    )
  }

  if (image) {
    return (
      <aside className="timeline-modal__media" aria-label="תמונה">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={image} alt="" className="timeline-modal__media-img" />
      </aside>
    )
  }

  return (
    <aside className="timeline-modal__media" aria-label="תמונה">
      <div
        className="timeline-modal__media-placeholder"
        style={{
          background:
            colors.length === 1
              ? colors[0]
              : `linear-gradient(135deg, ${colors.join(', ')})`,
        }}
      >
        <span>תמונה</span>
      </div>
    </aside>
  )
}

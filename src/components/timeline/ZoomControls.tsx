'use client'

interface ZoomControlsProps {
  onZoomIn: () => void
  onZoomOut: () => void
  onShowAll: () => void
  isFitted: boolean
}

export function ZoomControls({
  onZoomIn,
  onZoomOut,
  onShowAll,
  isFitted,
}: ZoomControlsProps) {
  return (
    <div className="timeline-zoom" data-timeline-no-pan>
      <button
        type="button"
        className="timeline-zoom__btn"
        onClick={onZoomIn}
        aria-label="התקרב"
      >
        +
      </button>
      <button
        type="button"
        className="timeline-zoom__btn"
        onClick={onZoomOut}
        aria-label="התרחק"
      >
        −
      </button>
      <button
        type="button"
        className="timeline-zoom__btn timeline-zoom__btn--all"
        onClick={onShowAll}
        disabled={isFitted}
      >
        הצג הכל
      </button>
    </div>
  )
}

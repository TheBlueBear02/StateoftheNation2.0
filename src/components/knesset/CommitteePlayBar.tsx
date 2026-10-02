'use client'

type CommitteePlayBarProps = {
  playing: boolean
  disabled: boolean
  ordinal: number
  total: number
  onPlayPause: () => void
  onPrev: () => void
  onNext: () => void
}

export function CommitteePlayBar({
  playing,
  disabled,
  ordinal,
  total,
  onPlayPause,
  onPrev,
  onNext,
}: CommitteePlayBarProps) {
  const progress = total > 0 ? ((ordinal + 1) / total) * 100 : 0

  return (
    <div className="committee-play-bar" aria-label="ניגון תמליל">
      <div className="committee-play-bar__controls">
        <button
          type="button"
          className="committee-play-bar__btn"
          onClick={onPrev}
          disabled={disabled || ordinal <= 0}
          aria-label="קטע קודם"
        >
          הקודם
        </button>
        <button
          type="button"
          className="committee-play-bar__btn committee-play-bar__btn--primary"
          onClick={onPlayPause}
          disabled={disabled}
          aria-label={playing ? 'השהה' : 'נגן'}
        >
          {playing ? 'השהה' : 'נגן'}
        </button>
        <button
          type="button"
          className="committee-play-bar__btn"
          onClick={onNext}
          disabled={disabled || ordinal >= total - 1}
          aria-label="קטע הבא"
        >
          הבא
        </button>
      </div>

      <div className="committee-play-bar__meta">
        {total > 0 ? (
          <span>
            {ordinal + 1} / {total}
          </span>
        ) : (
          <span>אין קטעים</span>
        )}
      </div>

      <div
        className="committee-play-bar__track"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progress)}
      >
        <div
          className="committee-play-bar__fill"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  )
}

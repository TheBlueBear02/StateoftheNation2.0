import { Link } from 'react-router-dom'
import { formatFieldwork, type PollWithResults } from '../../hooks/usePolls'
import {
  displayBlocBarGradientForParty,
  formatPollPublisher,
  type PartySeatAverage,
} from '../../lib/pollChartData'

export const LAST_N_POLL_OPTIONS = [3, 5, 7, 10, 15] as const

type LastPollsBarChartProps = {
  parties: PartySeatAverage[]
  pollCount: number
  lastN: number
  lastNOptions: readonly number[]
  onLastNChange: (n: number) => void
  sourcePolls: PollWithResults[]
  selectedPoll: PollWithResults | null
  selectedPollId: number | null
  onPollSelect: (pollId: number) => void
}

const PLOT_HEIGHT = 420
const MIN_BAR_HEIGHT = 56

function formatAveragePollDateRange(sourcePolls: PollWithResults[]): string | null {
  if (sourcePolls.length === 0) {
    return null
  }

  const sorted = [...sourcePolls].sort((a, b) =>
    a.fieldworkEnd.localeCompare(b.fieldworkEnd),
  )
  const earliest = sorted[0]
  const latest = sorted[sorted.length - 1]
  const earliestLabel = formatFieldwork(earliest.fieldworkStart, earliest.fieldworkEnd)

  if (sorted.length === 1 || earliest.fieldworkEnd === latest.fieldworkEnd) {
    return earliestLabel
  }

  const latestLabel = formatFieldwork(latest.fieldworkStart, latest.fieldworkEnd)
  return `${earliestLabel} – ${latestLabel}`
}

export function LastPollsBarChart({
  parties,
  pollCount,
  lastN,
  lastNOptions,
  onLastNChange,
  sourcePolls,
  selectedPoll,
  selectedPollId,
  onPollSelect,
}: LastPollsBarChartProps) {
  const visible = parties.filter((p) => p.seatsAvg >= 0.5)
  // Height uses rounded seats so parties showing the same label match visually
  // (raw averages like 4.6 vs 5.2 both display as 5 but would otherwise differ).
  const maxSeats = Math.max(...visible.map((p) => Math.round(p.seatsAvg)), 1)

  const publisherLogos = sourcePolls.flatMap((poll) => {
    if (!poll.publisherLogoUrl) {
      return []
    }

    const label = formatPollPublisher(poll)

    return [
      {
        pollId: poll.id,
        key: String(poll.id),
        logoUrl: poll.publisherLogoUrl,
        label,
      },
    ]
  })

  const chartAriaLabel = selectedPoll
    ? 'מנדטים לפי מפלגה בסקר נבחר'
    : 'ממוצע מנדטים לפי מפלגה'

  const averageDateRange = formatAveragePollDateRange(sourcePolls)

  return (
    <section className="polls-chart polls-chart--bars" aria-labelledby="last-polls-title">
      <div className="polls-chart__header">
        <div className="polls-chart__heading">
          <h2 id="last-polls-title" className="polls-chart__title">
            {selectedPoll ? (
              <>
                <span className="polls-chart__title-main">
                  סקר &ldquo;{formatPollPublisher(selectedPoll)}&rdquo;
                </span>
                <span className="polls-chart__title-sep" aria-hidden="true">
                  |
                </span>
                <span className="polls-chart__title-date">
                  {formatFieldwork(
                    selectedPoll.fieldworkStart,
                    selectedPoll.fieldworkEnd,
                  )}
                </span>
              </>
            ) : (
              <>
                <span className="polls-chart__title-main">
                  ממוצע {pollCount} הסקרים האחרונים
                </span>
                {averageDateRange && (
                  <>
                    <span className="polls-chart__title-sep" aria-hidden="true">
                      |
                    </span>
                    <span className="polls-chart__title-date">{averageDateRange}</span>
                  </>
                )}
              </>
            )}
          </h2>

          {publisherLogos.length > 0 && (
            <div className="polls-bar-chart__publisher-block">
              <div
                className={`polls-bar-chart__publisher-logos${
                  selectedPollId !== null
                    ? ' polls-bar-chart__publisher-logos--has-selection'
                    : ''
                }`}
                aria-label="בחירת סקר לפי ערוץ"
              >
                {publisherLogos.map((publisher) => {
                  const isSelected = selectedPollId === publisher.pollId

                  return (
                    <button
                      key={publisher.key}
                      type="button"
                      className={`polls-bar-chart__publisher-logo-btn${
                        isSelected ? ' polls-bar-chart__publisher-logo-btn--selected' : ''
                      }`}
                      onClick={() => onPollSelect(publisher.pollId)}
                      aria-pressed={isSelected}
                      title={publisher.label}
                    >
                      <img
                        className="polls-bar-chart__publisher-logo"
                        src={publisher.logoUrl}
                        alt={publisher.label}
                      />
                    </button>
                  )
                })}
              </div>
              <p className="polls-bar-chart__publisher-hint">
                לצפייה בסקר ספציפי לחצו על לוגו הערוץ
              </p>
            </div>
          )}
        </div>

        <label className="polls-chart__n-picker">
          <span className="visually-hidden">מספר סקרים לממוצע</span>
          <select
            className="polls-chart__n-select"
            value={lastN}
            onChange={(event) => onLastNChange(Number(event.target.value))}
            aria-label="מספר סקרים לחישוב הממוצע"
          >
            {lastNOptions.map((n) => (
              <option key={n} value={n}>
                {n} סקרים אחרונים
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="polls-bar-chart-wrap">
        <div
          className="polls-bar-chart"
          role="list"
          aria-label={chartAriaLabel}
          style={{ ['--poll-bar-columns' as string]: visible.length }}
        >
          {visible.map((party) => {
            const displaySeats = Math.round(party.seatsAvg)
            const height = Math.max(
              (displaySeats / maxSeats) * PLOT_HEIGHT,
              MIN_BAR_HEIGHT,
            )
            const mobileLabel = party.partyShortName ?? party.partyName

            return (
              <Link
                key={party.partyId}
                to={`/elections/${party.partyId}`}
                className="polls-bar-chart__column"
                role="listitem"
                aria-label={`לעמוד הבחירות של ${party.partyName}, ${displaySeats} מנדטים`}
              >
                <div
                  className="polls-bar-chart__plot"
                  style={{ height: PLOT_HEIGHT }}
                >
                  <div
                    className="polls-bar-chart__bar"
                    style={{
                      height: `${height}px`,
                      background: displayBlocBarGradientForParty(party),
                    }}
                  >
                    <span className="polls-bar-chart__value">{displaySeats}</span>
                  </div>
                </div>
                <p className="polls-bar-chart__label" aria-hidden="true">
                  <span className="polls-bar-chart__label-text polls-bar-chart__label-text--desktop">
                    {party.partyName}
                  </span>
                  <span className="polls-bar-chart__label-text polls-bar-chart__label-text--mobile">
                    {mobileLabel}
                  </span>
                </p>
              </Link>
            )
          })}
        </div>
      </div>
    </section>
  )
}

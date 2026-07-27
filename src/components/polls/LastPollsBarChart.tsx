import { useState } from 'react'
import { formatFieldwork, type PollWithResults } from '../../hooks/usePolls'
import {
  cleanPollPublisher,
  displayBlocColorForParty,
  type PartySeatAverage,
} from '../../lib/pollChartData'

type LastPollsBarChartProps = {
  parties: PartySeatAverage[]
  pollCount: number
  sourcePolls: PollWithResults[]
}

const PLOT_HEIGHT = 320
const MIN_BAR_HEIGHT = 48

export function LastPollsBarChart({
  parties,
  pollCount,
  sourcePolls,
}: LastPollsBarChartProps) {
  const [sourcesOpen, setSourcesOpen] = useState(false)
  const visible = parties.filter((p) => p.seatsAvg >= 0.5)
  const maxSeats = Math.max(...visible.map((p) => p.seatsAvg), 1)

  return (
    <section className="polls-chart polls-chart--bars" aria-labelledby="last-polls-title">
      <h2 id="last-polls-title" className="polls-chart__title">
        ממוצע {pollCount} הסקרים האחרונים
      </h2>

      <div className="polls-bar-chart-wrap">
        <div className="polls-bar-chart" role="img" aria-label="ממוצע מנדטים לפי מפלגה">
          {visible.map((party) => {
            const height = Math.max(
              (party.seatsAvg / maxSeats) * PLOT_HEIGHT,
              MIN_BAR_HEIGHT,
            )
            const displaySeats = Math.round(party.seatsAvg)

            return (
              <div key={party.partyId} className="polls-bar-chart__column">
                <div
                  className="polls-bar-chart__plot"
                  style={{ height: PLOT_HEIGHT }}
                >
                  <div
                    className="polls-bar-chart__bar"
                    style={{
                      height: `${height}px`,
                      backgroundColor: displayBlocColorForParty(party),
                    }}
                  >
                    <span className="polls-bar-chart__value">{displaySeats}</span>
                  </div>
                </div>
                <p className="polls-bar-chart__label">{party.partyName}</p>
              </div>
            )
          })}
        </div>
      </div>

      {sourcePolls.length > 0 && (
        <div className="polls-bar-chart__sources">
          <button
            type="button"
            className="polls-bar-chart__sources-toggle"
            aria-expanded={sourcesOpen}
            aria-controls="polls-sources-panel"
            onClick={() => setSourcesOpen((open) => !open)}
          >
            <span className="polls-bar-chart__sources-title">
              הסקרים ששימשו לחישוב הממוצע
            </span>
            <span className="polls-bar-chart__sources-chevron" aria-hidden="true">
              {sourcesOpen ? '▾' : '▸'}
            </span>
          </button>
          {sourcesOpen && (
            <ul
              id="polls-sources-panel"
              className="polls-bar-chart__sources-list"
            >
              {sourcePolls.map((poll) => (
                <li key={poll.id} className="polls-bar-chart__source">
                  <span className="polls-bar-chart__source-date">
                    {formatFieldwork(poll.fieldworkStart, poll.fieldworkEnd)}
                  </span>
                  <span className="polls-bar-chart__source-pollster">
                    {poll.pollsterHe ?? poll.pollster}
                  </span>
                  <span className="polls-bar-chart__source-publisher">
                    {cleanPollPublisher(poll.publisher)}
                  </span>
                  {poll.sampleSize !== null && (
                    <span className="polls-bar-chart__source-sample">
                      מדגם: {poll.sampleSize.toLocaleString('he-IL')}
                    </span>
                  )}
                  {poll.results.length > 0 && (
                    <span className="polls-bar-chart__source-parties">
                      {poll.results
                        .filter((r) => r.seats !== null && r.seats > 0)
                        .slice(0, 12)
                        .map((r) => `${r.partyName} ${r.seats}`)
                        .join(' · ')}
                    </span>
                  )}
                  {poll.sourceUrl && (
                    <a
                      className="polls-bar-chart__source-link"
                      href={poll.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      מקור
                    </a>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  )
}

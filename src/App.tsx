'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { SiteLayout } from './components/SiteLayout'
import { ListsGamePromo } from './components/elections/ListsGamePromo'
import { DreamGovernmentPromo } from './components/elections/DreamGovernmentPromo'
import { useSiteUpdates } from './hooks/useSiteUpdates'
import { useLatestPollDate } from './hooks/useLatestPollDate'

const HERO_BUTTONS = [
  { label: 'בחירות 2026', to: '/elections' },
  { label: 'סקרי מנדטים', to: '/elections/polls' },
  { label: 'ממשלת החלומות', to: '/elections/dream-government' },
  { label: 'מדדי הממשלה', to: '/government/dashboard' },
] as const

/** Homepage teaser for the office KPI dashboard. */
const SHOW_GOVERNMENT_DASHBOARD = true

const HERO_VIDEO_SRC =
  'https://tawfpzpikbxvgsqrtvpm.supabase.co/storage/v1/object/public/site-assets/bear-hero-video2.mp4'

function App() {
  const heroVideoRef = useRef<HTMLVideoElement>(null)
  const [heroVideoReady, setHeroVideoReady] = useState(false)
  const [heroVideoFailed, setHeroVideoFailed] = useState(false)
  const { items: newsItems } = useSiteUpdates()
  const { dateLabel: pollsUpdatedLabel } = useLatestPollDate()

  useEffect(() => {
    const video = heroVideoRef.current
    if (!video) return

    video.muted = true

    // Cached videos may already be past loadeddata before React listeners attach
    if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      setHeroVideoReady(true)
    }

    void video.play().catch(() => {})
  }, [])

  const revealHeroVideo = () => setHeroVideoReady(true)
  const tickerItems =
    newsItems.length > 0 ? [...newsItems, ...newsItems] : []

  return (
    <SiteLayout>
      <main>
        <section className="hero" aria-labelledby="hero-title">
          <div className="hero__inner container">
            <div className="hero__content">
              <h1 id="hero-title" className="hero__title">
                <img
                  src="/while-logo-nobg.svg"
                  alt="מצב האומה"
                  className="hero__title-logo"
                  width={777}
                  height={253}
                />
              </h1>
              <p className="hero__subtitle">
                הבית של המידע הפוליטי בישראל
              </p>
              <nav className="hero__nav" aria-label="פרויקטים עיקריים">
                <ul className="hero__buttons">
                  {HERO_BUTTONS.map((button) => (
                    <li key={button.to}>
                      <Link href={button.to} className="hero__button">
                        {button.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>
            </div>

            <div className="hero__visual">
              {heroVideoFailed ? (
                <img
                  className="hero__bear hero__bear--ready"
                  src="/hero-bear-image.svg"
                  alt="דוב מצב האומה מאחורי דוכן נאומים"
                  width={419}
                  height={320}
                />
              ) : (
                <video
                  ref={heroVideoRef}
                  className={`hero__bear${heroVideoReady ? ' hero__bear--ready' : ''}`}
                  src={HERO_VIDEO_SRC}
                  poster="/hero-bear-image.svg"
                  autoPlay
                  muted
                  playsInline
                  preload="auto"
                  aria-label="דוב מצב האומה מאחורי דוכן נאומים"
                  width={419}
                  height={320}
                  onLoadedData={(event) => {
                    revealHeroVideo()
                    void event.currentTarget.play().catch(() => {})
                  }}
                  onLoadedMetadata={revealHeroVideo}
                  onCanPlay={revealHeroVideo}
                  onPlaying={revealHeroVideo}
                  onError={() => {
                    setHeroVideoFailed(true)
                    setHeroVideoReady(true)
                  }}
                />
              )}
            </div>
          </div>
        </section>

        {tickerItems.length > 0 ? (
          <aside className="news-strip" aria-label="עדכונים">
            <div className="news-strip__track">
              {tickerItems.map((item, index) => (
                <Link
                  key={`${item.key}-${index}`}
                  href={item.href}
                  className="news-strip__item"
                >
                  {item.whenLabel ? (
                    <>
                      <span className="news-strip__when">{item.whenLabel}</span>
                      <span className="news-strip__sep" aria-hidden="true">
                        |
                      </span>
                    </>
                  ) : null}
                  <span className="news-strip__headline">{item.headline}</span>
                </Link>
              ))}
            </div>
          </aside>
        ) : null}

        <DreamGovernmentPromo />

        {SHOW_GOVERNMENT_DASHBOARD ? (
          <section
            id="government-dashboard"
            className="project-section"
            aria-labelledby="dashboard-title"
          >
            <Link href="/government/dashboard" className="project-section__link">
              <div className="container">
                <div className="project-section__inner">
                  <div className="project-section__content">
                    <h2 id="dashboard-title" className="project-section__title">
                      מצב האומה: מדדי משרדי הממשלה לאורך זמן
                    </h2>
                    <span className="project-section__tag">הממשלה</span>
                  </div>

                  <div className="project-section__media" aria-hidden="true">
                    <img
                      src="/government-offices-homepage.png"
                      alt=""
                      className="project-section__image"
                      width={384}
                      height={423}
                      loading="lazy"
                      decoding="async"
                    />
                  </div>
                </div>
              </div>
            </Link>
          </section>
        ) : null}

        <section
          id="mandate-polls"
          className="project-section"
          aria-labelledby="mandate-polls-title"
        >
          <Link href="/elections/polls" className="project-section__link">
            <div className="container">
              <div className="project-section__inner">
                <div className="project-section__content">
                  <h2 id="mandate-polls-title" className="project-section__title">
                    סקר הסקרים: סקרי המנדטים של כל הערוצים במקום אחד
                  </h2>
                  <span className="project-section__tag">בחירות 2026</span>
                  {pollsUpdatedLabel ? (
                    <p className="project-section__meta">
                      עודכן לאחרונה {pollsUpdatedLabel}
                    </p>
                  ) : null}
                </div>

                <div className="project-section__media" aria-hidden="true">
                  <img
                    src="/polls-page-homepage.png"
                    alt=""
                    className="project-section__image"
                    width={810}
                    height={375}
                    loading="lazy"
                    decoding="async"
                  />
                </div>
              </div>
            </div>
          </Link>
        </section>

        <ListsGamePromo />

        <section
          id="institutions"
          className="project-section project-section--alt"
          aria-label="הממשלה והכנסת"
        >
          <div className="container">
            <div className="institutions-pair">
              <Link
                href="/government"
                className="institutions-pair__card"
                aria-labelledby="government-title"
              >
                <div className="institutions-pair__media" aria-hidden="true">
                  <img
                    src="/government-building-homepage.svg?v=3"
                    alt=""
                    className="project-section__image project-section__image--illustration"
                    width={640}
                    height={420}
                    loading="lazy"
                    decoding="async"
                  />
                </div>
                <div className="institutions-pair__content">
                  <h2 id="government-title" className="project-section__title">
                    ממשלת ישראל: הרכב ממשלת ישראל כיום ובעבר
                  </h2>
                  <span className="project-section__tag">הממשלה</span>
                </div>
              </Link>

              <Link
                href="/knesset"
                className="institutions-pair__card"
                aria-labelledby="knesset-title"
              >
                <div className="institutions-pair__media" aria-hidden="true">
                  <img
                    src="/knesset-building-homepage.svg?v=5"
                    alt=""
                    className="project-section__image project-section__image--illustration"
                    width={640}
                    height={420}
                    loading="lazy"
                    decoding="async"
                  />
                </div>
                <div className="institutions-pair__content">
                  <h2 id="knesset-title" className="project-section__title">
                    כנסת ישראל: הרכב הכנסת כיום ולאורך ההיסטוריה
                  </h2>
                  <span className="project-section__tag">הכנסת</span>
                </div>
              </Link>
            </div>
          </div>
        </section>
      </main>
    </SiteLayout>
  )
}

export default App

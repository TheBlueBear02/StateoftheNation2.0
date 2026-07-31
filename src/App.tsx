'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { SiteLayout } from './components/SiteLayout'
import { useSiteUpdates } from './hooks/useSiteUpdates'

const HERO_BUTTONS = [
  { label: 'בחירות 2026', to: '/elections' },
  { label: 'הממשלה', to: '/government' },
  { label: 'סקרי מנדטים', to: '/elections/polls' },
  { label: 'הכנסת', to: '/knesset' },
] as const

const DASHBOARD_ICONS = [
  'justice', 'education', 'transport', 'health',
  'finance', 'defense', 'interior', 'foreign',
  'economy', 'welfare', 'environment', 'housing',
  'agriculture', 'energy', 'science', 'culture',
] as const

const HERO_VIDEO_SRC =
  'https://tawfpzpikbxvgsqrtvpm.supabase.co/storage/v1/object/public/site-assets/bear-hero-video2.mp4'

function App() {
  const heroVideoRef = useRef<HTMLVideoElement>(null)
  const [heroVideoReady, setHeroVideoReady] = useState(false)
  const [heroVideoFailed, setHeroVideoFailed] = useState(false)
  const { items: newsItems } = useSiteUpdates()

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
  const tickerItems = [...newsItems, ...newsItems]

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

        <section
          id="lists-game"
          className="project-section"
          aria-labelledby="lists-game-title"
        >
          <Link href="/elections/lists" className="project-section__link">
            <div className="container">
              <div className="project-section__inner">
                <div className="project-section__content">
                  <h2 id="lists-game-title" className="project-section__title">
                    משחק הרשימות: שחקו וגלו איזו רשימה הכי מתאימה לכם
                  </h2>
                  <span className="project-section__tag">בחירות 2026</span>
                </div>

                <div className="project-section__media" aria-hidden="true">
                  <img
                    src="/election-game-homepage.png"
                    alt=""
                    className="project-section__image"
                    width={906}
                    height={513}
                    loading="lazy"
                    decoding="async"
                  />
                </div>
              </div>
            </div>
          </Link>
        </section>

        <section
          id="mandate-polls"
          className="project-section project-section--alt"
          aria-labelledby="mandate-polls-title"
        >
          <Link href="/elections/polls" className="project-section__link">
            <div className="container">
              <div className="project-section__inner">
                <div className="project-section__content">
                  <h2 id="mandate-polls-title" className="project-section__title">
                    סקרי מנדטים
                  </h2>
                  <span className="project-section__tag">בחירות 2026</span>
                </div>

                <div className="project-section__media" aria-hidden="true">
                  <div className="polls-preview">
                    <div className="polls-preview__bars">
                      <span className="polls-preview__bar polls-preview__bar--1" />
                      <span className="polls-preview__bar polls-preview__bar--2" />
                      <span className="polls-preview__bar polls-preview__bar--3" />
                      <span className="polls-preview__bar polls-preview__bar--4" />
                      <span className="polls-preview__bar polls-preview__bar--5" />
                      <span className="polls-preview__bar polls-preview__bar--6" />
                      <span className="polls-preview__bar polls-preview__bar--7" />
                      <span className="polls-preview__bar polls-preview__bar--8" />
                    </div>
                    <div className="polls-preview__baseline" />
                  </div>
                </div>
              </div>
            </div>
          </Link>
        </section>

        <section
          id="government-dashboard"
          className="project-section"
          aria-labelledby="dashboard-title"
        >
          <Link href="/government" className="project-section__link">
            <div className="container">
              <div className="project-section__inner">
                <div className="project-section__content">
                  <h2 id="dashboard-title" className="project-section__title">
                    דשבורד ממשלה
                  </h2>
                  <span className="project-section__tag">הממשלה</span>
                </div>

                <div className="project-section__media" aria-hidden="true">
                  <div className="dashboard-preview">
                    <div className="dashboard-preview__grid">
                      {DASHBOARD_ICONS.map((icon, index) => (
                        <div
                          key={icon}
                          className={`dashboard-preview__cell dashboard-preview__cell--${icon}${
                            index % 7 === 3 ? ' dashboard-preview__cell--alert' : ''
                          }`}
                        />
                      ))}
                    </div>
                    <div className="dashboard-preview__axis dashboard-preview__axis--vertical" />
                    <div className="dashboard-preview__axis dashboard-preview__axis--horizontal" />
                    <div className="dashboard-preview__center">
                      <span className="dashboard-preview__portrait" />
                      <span className="dashboard-preview__portrait" />
                      <span className="dashboard-preview__portrait" />
                      <span className="dashboard-preview__portrait" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </Link>
        </section>
      </main>
    </SiteLayout>
  )
}

export default App

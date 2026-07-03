import { Link } from 'react-router-dom'
import { SiteLayout } from './components/SiteLayout'

const HERO_BUTTONS = [
  { label: 'בחירות 2026', href: '#elections-2026' },
  { label: 'דשבורד ממשלה', href: '#government-dashboard' },
  { label: 'ציר זמן', href: '#timeline' },
  { label: 'מיפוי סוגיות פוליטיות', href: '#political-issues' },
  { label: 'הכנסת', to: '/knesset' },
] as const

const NEWS_ITEMS = [
  'נתניהו: "הממשלה פועלת למען ביטחון האזרחים"',
  'N12: סקר חדש מצביע על שינוי במפה הפוליטית',
  'C14: דיון סוער בכנסת על תקציב המדינה',
  'מצב האומה: דשבורד ממשלה מציג נתונים עדכניים מכל המשרדים',
] as const

const DASHBOARD_ICONS = [
  'justice', 'education', 'transport', 'health',
  'finance', 'defense', 'interior', 'foreign',
  'economy', 'welfare', 'environment', 'housing',
  'agriculture', 'energy', 'science', 'culture',
] as const

function App() {
  return (
    <SiteLayout>
      <main>
        <section className="hero" aria-labelledby="hero-title">
          <div className="hero__inner container">
            <div className="hero__content">
              <h1 id="hero-title" className="hero__title">
                מצב האומה
              </h1>
              <p className="hero__subtitle">
                להבין מה באמת המצב של ישראל באמצעות טכנולוגיה
              </p>
              <nav className="hero__nav" aria-label="פרויקטים עיקריים">
                <ul className="hero__buttons">
                  {HERO_BUTTONS.map((button) => (
                    <li key={'to' in button ? button.to : button.href}>
                      {'to' in button ? (
                        <Link to={button.to} className="hero__button">
                          {button.label}
                        </Link>
                      ) : (
                        <a href={button.href} className="hero__button">
                          {button.label}
                        </a>
                      )}
                    </li>
                  ))}
                </ul>
              </nav>
            </div>

            <div className="hero__visual">
              <img
                src="/hero-bear-image.svg"
                alt="דוב מצב האומה מאחורי דוכן נאומים"
                className="hero__bear"
                width={419}
                height={320}
              />
            </div>
          </div>
        </section>

        <aside className="news-strip" aria-label="חדשות">
          <div className="news-strip__track">
            {[...NEWS_ITEMS, ...NEWS_ITEMS].map((headline, index) => (
              <span key={`${headline}-${index}`} className="news-strip__item">
                {headline}
              </span>
            ))}
          </div>
        </aside>

        <section
          id="government-dashboard"
          className="project-section"
          aria-labelledby="dashboard-title"
        >
          <div className="project-section__inner container">
            <div className="project-section__content">
              <h2 id="dashboard-title" className="project-section__title">
                דשבורד ממשלה
              </h2>
              <p className="project-section__description">
                הדשבורד אוסף את המדדים המרכזיים ממשרדי הממשלה במקום אחד — כדי
                לעזור להבין את מצב המדינה ואת ביצועי המשרדים השונים.
              </p>
              <a href="#government-dashboard" className="project-section__cta">
                לדשבורד &gt;&gt;
              </a>
            </div>

            <div className="dashboard-preview" aria-hidden="true">
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
        </section>
      </main>
    </SiteLayout>
  )
}

export default App

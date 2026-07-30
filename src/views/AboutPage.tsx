import { PageBreadcrumb } from '../components/PageBreadcrumb'
import { SiteLayout } from '../components/SiteLayout'
import './StaticInfoPage.css'

const AUTHOR_SOCIALS = [
  {
    href: 'https://x.com/GabbaiAmir',
    label: 'אמיר גבאי ב-X',
    icon: 'x-icon',
    viewBox: '0 0 19 19',
    className: 'about-author__social-link--x',
  },
  {
    href: 'https://www.linkedin.com/in/amir-gabbai-2ab485219',
    label: 'אמיר גבאי בלינקדאין',
    icon: 'linkedin-icon',
    viewBox: '0 0 24 24',
    className: 'about-author__social-link--linkedin',
  },
] as const

export function AboutPage() {
  return (
    <SiteLayout className="static-info-page about-page">
      <main className="static-info-page__main">
        <section
          className="static-info-page__section"
          aria-labelledby="about-title"
        >
          <div className="static-info-page__inner container">
            <PageBreadcrumb items={[{ label: 'אודות' }]} />
            <h1 id="about-title" className="static-info-page__title">
              אודות
            </h1>

            <div className="static-info-page__body">
              <p>
                בעולם שבו ערוצי טלוויזיה משדרים חדשות ופרשנויות שסותרות אחת את
                השנייה, אלגוריטמים חכמים ברשתות החברתיות קובעים לאיזה מידע
                ניחשף ולאיזה לא, ופוליטיקאים שמנסים לשכנע אותנו שהמצב מצויין או
                גרוע לפי האינטרס האישי שלהם, קשה לדעת מה באמת המצב של המדינה
              </p>
              <p>
                בדיוק בגלל זה החלטתי להקים את &quot;מצב האומה&quot;, פלטפורמה
                שבאמצעותה ניתן להבין מה המצב של המדינה ישירות מהנתונים וללא
                פרשנויות ואינטרסים חבויים. באתר ניתן למצוא שלל מדדים ונתונים
                עדכניים על משרדי הממשלה השונים, על הדמוגרפיה והכלכלה של ישראל
                ביחס לנתוני העבר וגם צ&apos;אט של כל ההודעות של חברי הכנסת במקום
                אחד, הכנסצ&apos;אט!
              </p>
            </div>

            <aside className="about-author" aria-label="על יוצר האתר">
              <p className="about-author__bio">
                קוראים לי אמיר גבאי, אני סטודנט לכלכלה ומדע המדינה ואני יזמתי,
                עיצבתי ובניתי את האתר לבד (ללא מימון של גורמים זרים, מבטיח)
                מתוך סקרנות ורצון לשפר את האופן שבו אנחנו האזרחים, מנתחים את
                המצב של המדינה, מסיקים מסקנות ומגבשים את דעתנו הפוליטית, כדי
                נוכל להפוך את המקום הזה למקום טוב יותר.
              </p>

              <div className="about-author__profile">
                <img
                  src="/images/my_image.png"
                  alt="אמיר גבאי"
                  className="about-author__photo"
                  width={140}
                  height={140}
                />
                <ul className="about-author__socials">
                  {AUTHOR_SOCIALS.map((link) => (
                    <li key={link.href}>
                      <a
                        href={link.href}
                        className={`about-author__social-link ${link.className}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={link.label}
                      >
                        <svg
                          className="about-author__social-icon"
                          viewBox={link.viewBox}
                          width={16}
                          height={16}
                          aria-hidden="true"
                        >
                          <use href={`/icons.svg#${link.icon}`} />
                        </svg>
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            </aside>
          </div>
        </section>
      </main>
    </SiteLayout>
  )
}

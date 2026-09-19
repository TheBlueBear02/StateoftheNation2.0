import Link from 'next/link'

type DreamGovernmentPromoProps = {
  titleId?: string
}

export function DreamGovernmentPromo({
  titleId = 'dream-gov-title',
}: DreamGovernmentPromoProps) {
  return (
    <section
      id="dream-government"
      className="project-section"
      aria-labelledby={titleId}
    >
      <Link href="/elections/dream-government" className="project-section__link">
        <div className="container">
          <div className="project-section__inner">
            <div className="project-section__content">
              <h2 id={titleId} className="project-section__title">
                ממשלת החלומות: בחרו שר לכל משרד מבין המועמדים לכנסת
              </h2>
              <span className="project-section__tag">בחירות 2026</span>
            </div>
          </div>
        </div>
      </Link>
    </section>
  )
}

import Link from 'next/link'

type ListsGamePromoProps = {
  titleId?: string
}

export function ListsGamePromo({ titleId = 'lists-game-title' }: ListsGamePromoProps) {
  return (
    <section
      id="lists-game"
      className="project-section"
      aria-labelledby={titleId}
    >
      <Link href="/elections/lists" className="project-section__link">
        <div className="container">
          <div className="project-section__inner">
            <div className="project-section__content">
              <h2 id={titleId} className="project-section__title">
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
  )
}

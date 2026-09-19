import { forwardRef } from 'react'
import { getInitials } from '../../../lib/hemicycle'
import {
  DREAM_MINISTER_OFFICES,
  DREAM_PM_OFFICE,
  getDreamOfficeLabel,
  type DreamOffice,
  type DreamOfficeId,
} from '../../../lib/dreamGovernmentOffices'
import type { DreamOfficeSelection } from './DreamOfficeSquare'

type ShareableGovernmentProps = {
  selections: Partial<Record<DreamOfficeId, DreamOfficeSelection>>
}

export const ShareableGovernment = forwardRef<
  HTMLDivElement,
  ShareableGovernmentProps
>(function ShareableGovernment({ selections }, ref) {
  const pmSelection = selections.pm ?? null

  return (
    <div ref={ref} className="dream-share-card" dir="rtl">
      <img
        className="dream-share-card__bg-art"
        src="/dream-government-bg.png?v=3"
        alt=""
        aria-hidden="true"
        draggable={false}
        width={1080}
        height={1350}
      />
      <img
        className="dream-share-card__site-logo"
        src="/while-logo-nobg.svg"
        alt="מצב האומה"
        width={190}
        height={62}
      />

      <header className="dream-share-card__header">
        <h2 className="dream-share-card__title">ממשלת החלומות שלי</h2>
      </header>

      <div className="dream-share-card__pm">
        <ShareSlot office={DREAM_PM_OFFICE} selection={pmSelection} />
      </div>

      <ul className="dream-share-card__grid">
        {DREAM_MINISTER_OFFICES.map((office) => (
          <li key={office.id}>
            <ShareSlot
              office={office}
              selection={selections[office.id] ?? null}
            />
          </li>
        ))}
      </ul>

      <p className="dream-share-card__cta">
        הרכיבו ושתפו את ממשלת החלומות שלכם באתר מצב האומה
        <span className="dream-share-card__cta-url">
          www.stateofthenation.co.il
        </span>
      </p>
    </div>
  )
})

function ShareSlot({
  office,
  selection,
}: {
  office: DreamOffice
  selection: DreamOfficeSelection | null
}) {
  const officeLabel = getDreamOfficeLabel(office, selection?.candidate.gender)

  return (
    <div className="dream-share-slot">
      <p className="dream-share-slot__office">{officeLabel}</p>
      <div className="dream-share-slot__face">
        {selection?.candidate.imageUrl ? (
          <img
            src={selection.candidate.imageUrl}
            alt=""
            data-initials={getInitials(selection.candidate.fullName)}
            className="dream-share-slot__photo"
          />
        ) : selection ? (
          <span className="dream-share-slot__initials">
            {getInitials(selection.candidate.fullName)}
          </span>
        ) : (
          <span className="dream-share-slot__empty">+</span>
        )}
      </div>
      {selection ? (
        <>
          <p className="dream-share-slot__name">{selection.candidate.fullName}</p>
          <p className="dream-share-slot__party">
            {selection.party.shortName ?? selection.party.name}
          </p>
        </>
      ) : null}
    </div>
  )
}

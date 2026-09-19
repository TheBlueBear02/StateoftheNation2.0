import { forwardRef } from 'react'
import { getInitials } from '../../../lib/hemicycle'
import {
  DREAM_MINISTER_OFFICES,
  DREAM_PM_OFFICE,
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
        <ShareSlot officeLabel={DREAM_PM_OFFICE.label} selection={pmSelection} />
      </div>

      <ul className="dream-share-card__grid">
        {DREAM_MINISTER_OFFICES.map((office) => (
          <li key={office.id}>
            <ShareSlot
              officeLabel={office.label}
              selection={selections[office.id] ?? null}
            />
          </li>
        ))}
      </ul>
    </div>
  )
})

function ShareSlot({
  officeLabel,
  selection,
}: {
  officeLabel: string
  selection: DreamOfficeSelection | null
}) {
  const partyLogoUrl = selection?.party.logoUrl ?? null

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
        {partyLogoUrl ? (
          <img
            className="dream-share-slot__party-logo"
            src={partyLogoUrl}
            alt=""
            width={40}
            height={40}
          />
        ) : null}
      </div>
      {selection ? (
        <p className="dream-share-slot__name">{selection.candidate.fullName}</p>
      ) : null}
    </div>
  )
}

export type DreamOfficeId =
  | 'pm'
  | 'defense'
  | 'foreign'
  | 'finance'
  | 'justice'
  | 'education'
  | 'national_security'

export type DreamOffice = {
  id: DreamOfficeId
  /** Neutral slash form for empty slots and the picker. */
  label: string
  labelMale: string
  labelFemale: string
  isPm?: boolean
}

export const DREAM_PM_OFFICE: DreamOffice = {
  id: 'pm',
  label: 'ראש/ת הממשלה',
  labelMale: 'ראש הממשלה',
  labelFemale: 'ראשת הממשלה',
  isPm: true,
}

export const DREAM_MINISTER_OFFICES: DreamOffice[] = [
  {
    id: 'defense',
    label: 'שר/ת הביטחון',
    labelMale: 'שר הביטחון',
    labelFemale: 'שרת הביטחון',
  },
  {
    id: 'foreign',
    label: 'שר/ת החוץ',
    labelMale: 'שר החוץ',
    labelFemale: 'שרת החוץ',
  },
  {
    id: 'finance',
    label: 'שר/ת האוצר',
    labelMale: 'שר האוצר',
    labelFemale: 'שרת האוצר',
  },
  {
    id: 'justice',
    label: 'שר/ת המשפטים',
    labelMale: 'שר המשפטים',
    labelFemale: 'שרת המשפטים',
  },
  {
    id: 'education',
    label: 'שר/ת החינוך',
    labelMale: 'שר החינוך',
    labelFemale: 'שרת החינוך',
  },
  {
    id: 'national_security',
    label: 'השר/ה לביטחון לאומי',
    labelMale: 'השר לביטחון לאומי',
    labelFemale: 'השרה לביטחון לאומי',
  },
]

export const DREAM_ALL_OFFICES: DreamOffice[] = [
  DREAM_PM_OFFICE,
  ...DREAM_MINISTER_OFFICES,
]

/** Resolve the office title from `people.gender` (`זכר` / `נקבה`). */
export function getDreamOfficeLabel(
  office: DreamOffice,
  gender: string | null | undefined,
): string {
  if (gender === 'נקבה') return office.labelFemale
  if (gender === 'זכר') return office.labelMale
  return office.label
}

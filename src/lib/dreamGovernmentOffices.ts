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
  label: string
  isPm?: boolean
}

export const DREAM_PM_OFFICE: DreamOffice = {
  id: 'pm',
  label: 'ראש/ת הממשלה',
  isPm: true,
}

export const DREAM_MINISTER_OFFICES: DreamOffice[] = [
  { id: 'defense', label: 'שר/ת הביטחון' },
  { id: 'foreign', label: 'שר/ת החוץ' },
  { id: 'finance', label: 'שר/ת האוצר' },
  { id: 'justice', label: 'שר/ת המשפטים' },
  { id: 'education', label: 'שר/ת החינוך' },
  { id: 'national_security', label: 'שר/ת לביטחון לאומי' },
]

export const DREAM_ALL_OFFICES: DreamOffice[] = [
  DREAM_PM_OFFICE,
  ...DREAM_MINISTER_OFFICES,
]

export type MemberSortMode =
  | 'parties'
  | 'tenure'
  | 'name'
  | 'firstElected'
  | 'bloc'

export const MEMBER_SORT_OPTIONS: Array<{ value: MemberSortMode; label: string }> = [
  { value: 'parties', label: 'לפי סיעות' },
  { value: 'tenure', label: 'לפי ותק בכנסת' },
  { value: 'name', label: 'לפי שם' },
  { value: 'firstElected', label: 'לפי שנה ראשונה' },
  { value: 'bloc', label: 'קואליציה / אופוזיציה' },
]

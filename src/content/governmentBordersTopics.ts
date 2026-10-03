/**
 * Hand-curated party orders for ג"ג (government borders).
 * `order` is RTL: first short_name = rightmost column.
 * Matching uses normalizePartyShortName (quote/dash variants collapse).
 */

export type BordersTopic = {
  id: string
  label: string
  /** Label for the rightmost (start) end of the spectrum. */
  startLabel: string
  /** Label for the leftmost (end) end of the spectrum. */
  endLabel: string
  /** Party short_names, rightmost → leftmost. */
  order: string[]
}

/**
 * Shared party universe used across topic drafts.
 * Includes confirmed + commonly polled short_names.
 */
const RELIGION_ORDER = [
  'עוצמה יהודית',
  'נועם',
  'הציונות הדתית',
  'יהדות התורה',
  'הציבור החרדי',
  'ש"ס',
  'זהות',
  'הליכוד',
  'עמך ישראל',
  'המילואימניקים',
  'בית ציוני',
  'ישראל ביתנו',
  'כחול לבן',
  'ישר',
  'בנט 2026',
  'ביחד',
  'יש עתיד',
  'הדמוקרטים',
  'וינטר',
  'רע"ם',
  'חד"ש תע"ל',
  'בל"ד',
  'הרשימה המשותפת',
]

const ECONOMY_ORDER = [
  'עוצמה יהודית',
  'הציונות הדתית',
  'זהות',
  'הליכוד',
  'ישראל ביתנו',
  'ש"ס',
  'יהדות התורה',
  'הציבור החרדי',
  'עמך ישראל',
  'המילואימניקים',
  'בית ציוני',
  'כחול לבן',
  'ישר',
  'בנט 2026',
  'ביחד',
  'יש עתיד',
  'הדמוקרטים',
  'וינטר',
  'רע"ם',
  'חד"ש תע"ל',
  'בל"ד',
  'הרשימה המשותפת',
]

const SECURITY_ORDER = [
  'עוצמה יהודית',
  'נועם',
  'הציונות הדתית',
  'הליכוד',
  'ישראל ביתנו',
  'זהות',
  'המילואימניקים',
  'בית ציוני',
  'עמך ישראל',
  'ש"ס',
  'יהדות התורה',
  'הציבור החרדי',
  'כחול לבן',
  'ישר',
  'בנט 2026',
  'ביחד',
  'יש עתיד',
  'הדמוקרטים',
  'וינטר',
  'רע"ם',
  'חד"ש תע"ל',
  'בל"ד',
  'הרשימה המשותפת',
]

const JUDICIARY_ORDER = [
  'עוצמה יהודית',
  'נועם',
  'הציונות הדתית',
  'הליכוד',
  'זהות',
  'ש"ס',
  'יהדות התורה',
  'הציבור החרדי',
  'ישראל ביתנו',
  'עמך ישראל',
  'המילואימניקים',
  'בית ציוני',
  'כחול לבן',
  'ישר',
  'בנט 2026',
  'ביחד',
  'יש עתיד',
  'הדמוקרטים',
  'וינטר',
  'רע"ם',
  'חד"ש תע"ל',
  'בל"ד',
  'הרשימה המשותפת',
]

export const BORDERS_TOPICS: BordersTopic[] = [
  {
    id: 'religion',
    label: 'דת ומדינה',
    startLabel: 'דתי',
    endLabel: 'חילוני',
    order: RELIGION_ORDER,
  },
  {
    id: 'economy',
    label: 'כלכלה',
    startLabel: 'שוק חופשי',
    endLabel: 'סוציאלי',
    order: ECONOMY_ORDER,
  },
  {
    id: 'security',
    label: 'מדיני-ביטחוני',
    startLabel: 'ניצי',
    endLabel: 'יוני',
    order: SECURITY_ORDER,
  },
  {
    id: 'judiciary',
    label: 'מערכת המשפט',
    startLabel: 'רפורמה',
    endLabel: 'שימור',
    order: JUDICIARY_ORDER,
  },
]

export const DEFAULT_BORDERS_TOPIC_ID = BORDERS_TOPICS[0]!.id

export function getBordersTopic(id: string | null | undefined): BordersTopic {
  return (
    BORDERS_TOPICS.find((topic) => topic.id === id) ?? BORDERS_TOPICS[0]!
  )
}

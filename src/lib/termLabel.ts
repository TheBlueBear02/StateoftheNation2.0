/** Header line for the active government and Knesset. Numbers come from the DB. */
export function formatCurrentTermLabel(
  governmentNumber: number | null,
  knessetNumber: number | null,
): string {
  const parts: string[] = []
  if (governmentNumber != null) {
    parts.push(`ממשלת ישראל ה${governmentNumber}`)
  }
  if (knessetNumber != null) {
    parts.push(`הכנסת ה${knessetNumber}`)
  }
  return parts.join(' | ')
}

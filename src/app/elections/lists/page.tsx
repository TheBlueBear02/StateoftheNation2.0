import type { Metadata } from 'next'
import { ElectionListsGamePage } from '@/views/ElectionListsGamePage'

export const metadata: Metadata = {
  title: 'משחק הרשימות',
  description:
    'דרגו את מועמדי המפלגות וקבלו ציון התאמה אישי לרשימה לקראת בחירות 2026.',
  alternates: { canonical: '/elections/lists' },
}

export default function Page() {
  return <ElectionListsGamePage />
}

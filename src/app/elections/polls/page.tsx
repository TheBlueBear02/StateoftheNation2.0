import type { Metadata } from 'next'
import { ElectionsPollsPage } from '@/views/ElectionsPollsPage'

export const metadata: Metadata = {
  title: 'סקרי מנדטים',
  description:
    'ממוצע משוקלל של סקרי מנדטים לקראת בחירות 2026, מגמות וטבלת סקרים.',
  alternates: { canonical: '/elections/polls' },
}

export default function Page() {
  return <ElectionsPollsPage />
}

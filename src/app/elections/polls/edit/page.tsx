import type { Metadata } from 'next'
import { ElectionsPollsEditPage } from '@/views/ElectionsPollsEditPage'

export const metadata: Metadata = {
  title: 'עדכון סקרים',
  robots: { index: false, follow: false },
}

export default function Page() {
  return <ElectionsPollsEditPage />
}

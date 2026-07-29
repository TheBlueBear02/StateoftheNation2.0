import type { Metadata } from 'next'
import { ElectionCandidatesEditPage } from '@/views/ElectionCandidatesEditPage'

export const metadata: Metadata = {
  title: 'עריכת מועמדים',
  robots: { index: false, follow: false },
}

export default function Page() {
  return <ElectionCandidatesEditPage />
}

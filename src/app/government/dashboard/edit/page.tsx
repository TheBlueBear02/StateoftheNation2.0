import type { Metadata } from 'next'
import { OfficeKpiEditPage } from '@/views/OfficeKpiEditPage'

export const metadata: Metadata = {
  title: 'מדדי משרדים — עריכה',
  robots: { index: false, follow: false },
}

export default function Page() {
  return <OfficeKpiEditPage />
}

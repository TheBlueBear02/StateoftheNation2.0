import type { Metadata } from 'next'
import { DreamGovernmentDashboardPage } from '@/views/DreamGovernmentDashboardPage'

export const metadata: Metadata = {
  title: 'לוח בקרה — ממשלת החלומות',
  robots: { index: false, follow: false },
}

export default function Page() {
  return <DreamGovernmentDashboardPage />
}

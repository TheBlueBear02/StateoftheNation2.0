import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { isDev } from '@/lib/runtimeEnv'
import { DreamGovernmentDashboardPage } from '@/views/DreamGovernmentDashboardPage'

export const metadata: Metadata = {
  title: 'לוח בקרה — ממשלת החלומות',
  robots: { index: false, follow: false },
}

export default function Page() {
  if (!isDev) {
    notFound()
  }

  return <DreamGovernmentDashboardPage />
}

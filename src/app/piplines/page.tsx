import type { Metadata } from 'next'
import { PipelinesDashboardPage } from '@/views/PipelinesDashboardPage'

export const metadata: Metadata = {
  title: 'לוח צינורות נתונים',
  description:
    'לוח בקרה לצינורות הסנכרון של מצב האומה — תזמון, תיעוד ויומן הרצות.',
  robots: { index: false, follow: false },
}

export default function Page() {
  return <PipelinesDashboardPage />
}

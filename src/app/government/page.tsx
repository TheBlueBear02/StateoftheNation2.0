import type { Metadata } from 'next'
import { GovernmentPage } from '@/views/GovernmentPage'

export const metadata: Metadata = {
  title: 'הממשלה',
  description: 'מבנה הממשלה, שרים ומשרדים — דשבורד ממשלה של מצב האומה.',
  alternates: { canonical: '/government' },
}

export default function Page() {
  return <GovernmentPage />
}

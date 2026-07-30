import type { Metadata } from 'next'
import { TermsPage } from '@/views/TermsPage'

export const metadata: Metadata = {
  title: 'תנאי שימוש',
  description:
    'תנאי השימוש באתר מצב האומה — כללים, אחריות, פרטיות וקניין רוחני.',
  alternates: { canonical: '/terms' },
}

export default function Page() {
  return <TermsPage />
}

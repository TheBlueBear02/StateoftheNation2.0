import type { Metadata } from 'next'
import { AboutPage } from '@/views/AboutPage'

export const metadata: Metadata = {
  title: 'אודות',
  description:
    'למה הוקם מצב האומה — פלטפורמה להבנת מצב המדינה ישירות מהנתונים, בלי פרשנויות ואינטרסים חבויים.',
  alternates: { canonical: '/about' },
}

export default function Page() {
  return <AboutPage />
}

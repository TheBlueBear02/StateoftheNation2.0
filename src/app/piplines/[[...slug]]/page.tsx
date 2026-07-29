import type { Metadata } from 'next'
import { PiplinesPage } from '@/views/PiplinesPage'

export const metadata: Metadata = {
  title: 'צינורות נתונים',
  description: 'תיעוד צינורות הנתונים שמזינים את מסד הנתונים של מצב האומה.',
  robots: { index: false, follow: false },
}

export default function Page() {
  return <PiplinesPage />
}

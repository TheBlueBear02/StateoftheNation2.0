import type { Metadata } from 'next'
import { PiplinesDocsPage } from '@/views/PiplinesDocsPage'

export const metadata: Metadata = {
  title: 'תיעוד צינורות נתונים',
  description: 'תיעוד צינורות הנתונים שמזינים את מסד הנתונים של מצב האומה.',
  robots: { index: false, follow: false },
}

export default function Page() {
  return <PiplinesDocsPage />
}

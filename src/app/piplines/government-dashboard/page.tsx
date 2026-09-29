import type { Metadata } from 'next'
import { GovernmentDashboardPipelinePage } from '@/views/GovernmentDashboardPipelinePage'

export const metadata: Metadata = {
  title: 'מדדי דשבורד הממשלה — צינורות',
  description:
    'סטטוס עדכניות ואוטומציה לכל מדדי דשבורד הממשלה, לפי משרד.',
  robots: { index: false, follow: false },
}

export default function Page() {
  return <GovernmentDashboardPipelinePage />
}

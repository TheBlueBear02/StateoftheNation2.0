import type { Metadata } from 'next'
import { loadTimelineData } from '@/content/timeline'
import { TimelinePage } from '@/views/TimelinePage'

export const metadata: Metadata = {
  title: 'ציר זמן',
  description:
    'ציר זמן של תולדות מדינת ישראל דרך סיפורי החיים של דמויות מפתח ואירועי מדינה.',
  alternates: { canonical: '/timeline' },
}

export default function Page() {
  const data = loadTimelineData()
  return <TimelinePage data={data} />
}

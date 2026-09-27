import type { Metadata } from 'next'
import { loadTimelineData } from '@/content/timeline'
import { TimelinePage } from '@/views/TimelinePage'

export const metadata: Metadata = {
  title: 'בזכותם | ציר זמן למדינת ישראל',
  description:
    'ציר זמן למדינת ישראל דרך סיפור חייהם של דמויות מפתח בציונות.',
  alternates: { canonical: '/timeline' },
}

export default function Page() {
  const data = loadTimelineData()
  return <TimelinePage data={data} />
}

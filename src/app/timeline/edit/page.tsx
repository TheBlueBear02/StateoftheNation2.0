import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { isTimelineEditEnabled } from '@/lib/timeline/editAccess'
import { loadTimelineDataFromDisk } from '@/lib/timeline/loadFromDisk'
import { TimelineEditPage } from '@/views/TimelineEditPage'

export const metadata: Metadata = {
  title: 'עריכת ציר זמן | בזכותם',
  robots: { index: false, follow: false },
}

export const dynamic = 'force-dynamic'

export default async function Page() {
  if (!isTimelineEditEnabled()) notFound()
  const data = await loadTimelineDataFromDisk()
  return <TimelineEditPage initialData={data} />
}

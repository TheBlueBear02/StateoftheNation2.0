import type { Metadata } from 'next'
import { Suspense } from 'react'
import { getSiteUrl } from '@/lib/runtimeEnv'
import { KnessetCommitteesPage } from '@/views/KnessetCommitteesPage'

const title = 'ועדות הכנסת'
const description =
  'ועדות הכנסת בצאט — תמלולים מלאים, נוכחות חברי הכנסת וסיכומי הישיבות.'
const ogImageUrl = `${getSiteUrl()}/images/Knesset%20Committees/knesset-commiettees-thumbnail.png`

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: '/knesset/committees' },
  openGraph: {
    title: `${title} | מצב האומה`,
    description,
    url: '/knesset/committees',
    images: [
      {
        url: ogImageUrl,
        secureUrl: ogImageUrl,
        width: 1060,
        height: 739,
        type: 'image/png',
        alt: title,
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: `${title} | מצב האומה`,
    description,
    images: [ogImageUrl],
  },
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <KnessetCommitteesPage />
    </Suspense>
  )
}

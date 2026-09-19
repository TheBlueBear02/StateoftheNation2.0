import type { Metadata } from 'next'
import { getSiteUrl } from '@/lib/runtimeEnv'
import { DreamGovernmentPage } from '@/views/DreamGovernmentPage'

const title = 'ממשלת החלומות'
const description =
  'בחרו ראש/ת ממשלה ושרים מבין המועמדים לכנסת ובנו את ממשלת החלומות שלכם לקראת בחירות 2026.'
const ogImageUrl = `${getSiteUrl()}/dream-governemnt-og-image.jpeg`

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: '/elections/dream-government' },
  openGraph: {
    title: `${title} | מצב האומה`,
    description,
    url: '/elections/dream-government',
    images: [
      {
        url: ogImageUrl,
        secureUrl: ogImageUrl,
        width: 1280,
        height: 1600,
        type: 'image/jpeg',
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
  return <DreamGovernmentPage />
}

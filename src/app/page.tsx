import type { Metadata } from 'next'
import HomePage from '@/App'
import { JsonLd } from '@/components/seo/JsonLd'
import { getSiteUrl } from '@/lib/runtimeEnv'

export const metadata: Metadata = {
  title: 'מצב האומה',
  description:
    'הבית של המידע הפוליטי בישראל — כנסת, ממשלה, בחירות 2026 וסקרי מנדטים.',
  alternates: { canonical: '/' },
}

export default function Page() {
  const siteUrl = getSiteUrl()
  return (
    <>
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'WebSite',
          name: 'מצב האומה',
          url: siteUrl,
          inLanguage: 'he',
          description:
            'הבית של המידע הפוליטי בישראל — כנסת, ממשלה, בחירות 2026 וסקרי מנדטים.',
          publisher: {
            '@type': 'Organization',
            name: 'מצב האומה',
            url: siteUrl,
          },
        }}
      />
      <HomePage />
    </>
  )
}

import type { Metadata } from 'next'
import { Suspense } from 'react'
import { JsonLd } from '@/components/seo/JsonLd'
import { getSiteUrl } from '@/lib/runtimeEnv'
import { GovernmentBordersPage } from '@/views/GovernmentBordersPage'

export const metadata: Metadata = {
  title: 'ג"ג - גבולות גזרה לממשלה',
  description:
    'שרטטו את גבולות הגזרה לממשלה לפי סקרי מנדטים וצירים פוליטיים לקראת בחירות 2026.',
  alternates: { canonical: '/elections/government-borders' },
}

export default function Page() {
  const siteUrl = getSiteUrl()

  return (
    <>
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'WebPage',
          name: 'ג"ג - גבולות גזרה לממשלה',
          description:
            'שרטטו את גבולות הגזרה לממשלה לפי סקרי מנדטים וצירים פוליטיים לקראת בחירות 2026.',
          url: `${siteUrl}/elections/government-borders`,
          inLanguage: 'he',
          breadcrumb: {
            '@type': 'BreadcrumbList',
            itemListElement: [
              {
                '@type': 'ListItem',
                position: 1,
                name: 'מצב האומה',
                item: siteUrl,
              },
              {
                '@type': 'ListItem',
                position: 2,
                name: 'בחירות 2026',
                item: `${siteUrl}/elections`,
              },
              {
                '@type': 'ListItem',
                position: 3,
                name: 'ג"ג - גבולות גזרה לממשלה',
                item: `${siteUrl}/elections/government-borders`,
              },
            ],
          },
        }}
      />
      <Suspense
        fallback={
          <main className="borders-page__main">
            <div className="container">
              <p>טוען…</p>
            </div>
          </main>
        }
      >
        <GovernmentBordersPage />
      </Suspense>
    </>
  )
}

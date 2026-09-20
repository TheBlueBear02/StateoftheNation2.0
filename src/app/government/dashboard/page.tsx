import type { Metadata } from 'next'
import { Suspense } from 'react'
import { JsonLd } from '@/components/seo/JsonLd'
import { getSiteUrl } from '@/lib/runtimeEnv'
import { OfficeDashboardPage } from '@/views/OfficeDashboardPage'

export const metadata: Metadata = {
  title: 'דשבורד ממשלה',
  description:
    'מדדי ביצוע ומדיניות במשרדי הממשלה המרכזיים — ביטחון לאומי, תחבורה, חינוך ואוצר.',
  alternates: { canonical: '/government/dashboard' },
}

export default function Page() {
  const siteUrl = getSiteUrl()

  return (
    <>
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'WebPage',
          name: 'דשבורד ממשלה',
          description:
            'מדדי ביצוע ומדיניות במשרדי הממשלה המרכזיים — ביטחון לאומי, תחבורה, חינוך ואוצר.',
          url: `${siteUrl}/government/dashboard`,
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
                name: 'הממשלה',
                item: `${siteUrl}/government`,
              },
              {
                '@type': 'ListItem',
                position: 3,
                name: 'דשבורד מדדים',
                item: `${siteUrl}/government/dashboard`,
              },
            ],
          },
        }}
      />
      <Suspense fallback={null}>
        <OfficeDashboardPage />
      </Suspense>
    </>
  )
}

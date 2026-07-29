import type { MetadataRoute } from 'next'
import { getSiteUrl } from '@/lib/runtimeEnv'

export default function robots(): MetadataRoute.Robots {
  const siteUrl = getSiteUrl()
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/elections/edit',
          '/elections/polls/edit',
          '/knesset/edit',
          '/piplines',
          '/api/',
        ],
      },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
  }
}

import { Heebo } from 'next/font/google'
import type { Metadata } from 'next'
import { Analytics } from '@vercel/analytics/next'
import {
  getDefaultOgImageUrl,
  getFacebookAppId,
  getSiteUrl,
} from '@/lib/runtimeEnv'
import '@/index.css'
import '@/App.css'

const heebo = Heebo({
  subsets: ['hebrew', 'latin'],
  weight: ['400', '500', '700', '800'],
  display: 'swap',
  variable: '--font-heebo',
})

const siteUrl = getSiteUrl()
const facebookAppId = getFacebookAppId()
const ogImageUrl = getDefaultOgImageUrl()

const defaultOgImage = {
  url: ogImageUrl,
  secureUrl: ogImageUrl,
  width: 1200,
  height: 630,
  type: 'image/png' as const,
  alt: 'מצב האומה | State of the Nation IL',
}

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: 'מצב האומה | State of the Nation IL',
    template: '%s | מצב האומה',
  },
  description:
    'הבית של המידע הפוליטי בישראל — כנסת, ממשלה, בחירות 2026 וסקרי מנדטים.',
  icons: {
    icon: [{ url: '/site_icon.png', type: 'image/png' }],
    apple: '/site_icon.png',
  },
  openGraph: {
    type: 'website',
    locale: 'he_IL',
    siteName: 'מצב האומה',
    title: 'מצב האומה | State of the Nation IL',
    description:
      'הבית של המידע הפוליטי בישראל — כנסת, ממשלה, בחירות 2026 וסקרי מנדטים.',
    url: siteUrl,
    images: [defaultOgImage],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'מצב האומה | State of the Nation IL',
    description:
      'הבית של המידע הפוליטי בישראל. כל המידע הפוליטי של ישראל במקום אחד',
    images: [ogImageUrl],
  },
  ...(facebookAppId ? { facebook: { appId: facebookAppId } } : {}),
  alternates: {
    canonical: '/',
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="he" dir="rtl" className={heebo.variable}>
      <body className={heebo.className}>
        {children}
        <Analytics />
      </body>
    </html>
  )
}

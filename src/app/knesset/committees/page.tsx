import type { Metadata } from 'next'
import { Suspense } from 'react'
import { getSiteUrl } from '@/lib/runtimeEnv'
import { loadCommitteeShareMeta } from '@/lib/loadCommitteeShareMeta'
import { KnessetCommitteesPage } from '@/views/KnessetCommitteesPage'

const ogImageUrl = `${getSiteUrl()}/images/Knesset%20Committees/knesset-commiettees-thumbnail.png`

type PageProps = {
  searchParams: Promise<{
    committee?: string | string[]
    session?: string | string[]
    message?: string | string[]
  }>
}

export async function generateMetadata({
  searchParams,
}: PageProps): Promise<Metadata> {
  const params = await searchParams
  const meta = await loadCommitteeShareMeta(params)
  const siteUrl = getSiteUrl()
  const absoluteUrl = `${siteUrl}${meta.path}`

  return {
    title: meta.title,
    description: meta.description,
    alternates: { canonical: meta.path },
    openGraph: {
      title: `${meta.title} | מצב האומה`,
      description: meta.description,
      url: absoluteUrl,
      images: [
        {
          url: ogImageUrl,
          secureUrl: ogImageUrl,
          width: 1060,
          height: 739,
          type: 'image/png',
          alt: meta.title,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: `${meta.title} | מצב האומה`,
      description: meta.description,
      images: [ogImageUrl],
    },
  }
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <KnessetCommitteesPage />
    </Suspense>
  )
}

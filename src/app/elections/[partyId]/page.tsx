import type { Metadata } from 'next'
import { ElectionPartyPage } from '@/views/ElectionPartyPage'
import { JsonLd } from '@/components/seo/JsonLd'
import { loadElectionPartyPage } from '@/lib/loadElectionPartyPage'
import { getDefaultOgImageUrl, getSiteUrl } from '@/lib/runtimeEnv'

type Props = {
  params: Promise<{ partyId: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { partyId } = await params
  const id = Number(partyId)
  const { party } = await loadElectionPartyPage(id)

  const name = party?.name ?? 'מפלגה'
  const description =
    party?.description?.trim() ||
    `רשימת המועמדים, סטטיסטיקות ומפת מגורים של ${name} בבחירות 2026.`
  const ogImageUrl = getDefaultOgImageUrl()

  return {
    title: name,
    description,
    alternates: { canonical: `/elections/${partyId}` },
    openGraph: {
      title: `${name} | מצב האומה`,
      description,
      images: [
        {
          url: ogImageUrl,
          secureUrl: ogImageUrl,
          width: 1200,
          height: 630,
          type: 'image/png',
          alt: 'מצב האומה | State of the Nation IL',
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      images: [ogImageUrl],
    },
  }
}

export default async function Page({ params }: Props) {
  const { partyId } = await params
  const siteUrl = getSiteUrl()
  const id = Number(partyId)
  const { party, candidates, error: loadError } = await loadElectionPartyPage(id)

  return (
    <>
      {party ? (
        <JsonLd
          data={{
            '@context': 'https://schema.org',
            '@type': 'WebPage',
            name: party.name,
            description:
              party.description?.trim() ||
              `עמוד המפלגה ${party.name} בבחירות 2026`,
            url: `${siteUrl}/elections/${partyId}`,
            about: {
              '@type': 'PoliticalParty',
              name: party.name,
              alternateName: party.shortName ?? undefined,
            },
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
                  name: party.name,
                  item: `${siteUrl}/elections/${partyId}`,
                },
              ],
            },
            mainEntity:
              candidates.length > 0
                ? {
                    '@type': 'ItemList',
                    name: `רשימת המועמדים של ${party.name}`,
                    numberOfItems: candidates.length,
                    itemListElement: candidates.map((candidate, index) => ({
                      '@type': 'ListItem',
                      position: index + 1,
                      name: candidate.fullName,
                      description: candidate.city
                        ? `מקום ${candidate.listPosition}, ${candidate.city}`
                        : `מקום ${candidate.listPosition}`,
                    })),
                  }
                : undefined,
          }}
        />
      ) : null}
      <ElectionPartyPage
        party={party}
        initialCandidates={candidates}
        loadError={loadError}
      />
    </>
  )
}

import type { Metadata } from 'next'
import { JsonLd } from '@/components/seo/JsonLd'
import { fetchElectionParties } from '@/lib/fetchElectionParties'
import { getSiteUrl } from '@/lib/runtimeEnv'
import { createServerSupabaseClient } from '@/lib/supabaseServer'
import { ElectionsPage } from '@/views/ElectionsPage'

export const metadata: Metadata = {
  title: 'בחירות 2026',
  description:
    'מפלגות מאושרות, מועמדים ומפת מושבים לקראת בחירות 2026 לכנסת.',
  alternates: { canonical: '/elections' },
}

export default async function Page() {
  const siteUrl = getSiteUrl()
  const client = createServerSupabaseClient()

  let election = null
  let parties: Awaited<ReturnType<typeof fetchElectionParties>>['parties'] | undefined
  let partiesError: string | null = null

  if (client) {
    try {
      const result = await fetchElectionParties(client)
      election = result.election
      parties = result.parties
      partiesError = result.error
    } catch {
      election = null
      parties = undefined
      partiesError = 'fetch failed'
    }
  }

  const initialParties =
    parties !== undefined && !partiesError ? parties : undefined

  return (
    <>
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'WebPage',
          name: election?.name ?? 'בחירות 2026',
          description:
            'מפלגות מאושרות, מועמדים ומפת מושבים לקראת בחירות 2026 לכנסת.',
          url: `${siteUrl}/elections`,
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
            ],
          },
          mainEntity:
            initialParties && initialParties.length > 0
              ? {
                  '@type': 'ItemList',
                  name: 'המפלגות המתמודדות',
                  numberOfItems: initialParties.length,
                  itemListElement: initialParties.map((party, index) => ({
                    '@type': 'ListItem',
                    position: index + 1,
                    name: party.name,
                    url: `${siteUrl}/elections/${party.id}`,
                  })),
                }
              : undefined,
        }}
      />
      <ElectionsPage
        initialElection={election}
        initialParties={initialParties}
      />
    </>
  )
}

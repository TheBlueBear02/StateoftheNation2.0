import type { Metadata } from 'next'
import { JsonLd } from '@/components/seo/JsonLd'
import { fetchPolls } from '@/lib/fetchPolls'
import { computeLastNAverage, type PartySeatAverage } from '@/lib/pollChartData'
import { getSiteUrl } from '@/lib/runtimeEnv'
import { createServerSupabaseClient } from '@/lib/supabaseServer'
import type { PartyBloc } from '@/lib/supabase'
import { ElectionsPollsPage } from '@/views/ElectionsPollsPage'

export const metadata: Metadata = {
  title: 'סקרי מנדטים',
  description:
    'ממוצע משוקלל של סקרי מנדטים לקראת בחירות 2026, מגמות וטבלת סקרים.',
  alternates: { canonical: '/elections/polls' },
}

/** Enough polls for last-5 average JSON-LD — do not SSR the full 120-poll chart payload. */
const SEO_POLL_LIMIT = 15
const DEFAULT_LAST_N = 5

function partyBlocsFromPolls(
  polls: Awaited<ReturnType<typeof fetchPolls>>['polls'],
): Map<number, PartyBloc | null> {
  const map = new Map<number, PartyBloc | null>()
  for (const poll of polls) {
    for (const result of poll.results) {
      if (!map.has(result.partyId)) {
        map.set(result.partyId, result.bloc)
      }
    }
  }
  return map
}

export default async function Page() {
  const siteUrl = getSiteUrl()
  const client = createServerSupabaseClient()

  let averages: PartySeatAverage[] = []
  if (client) {
    try {
      const { polls } = await fetchPolls(client, SEO_POLL_LIMIT)
      if (polls.length > 0) {
        averages = computeLastNAverage(
          polls,
          DEFAULT_LAST_N,
          partyBlocsFromPolls(polls),
        )
      }
    } catch {
      averages = []
    }
  }

  return (
    <>
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'WebPage',
          name: 'סקרי מנדטים לבחירות 2026',
          description:
            'ממוצע משוקלל של סקרי מנדטים לקראת בחירות 2026, מגמות וטבלת סקרים.',
          url: `${siteUrl}/elections/polls`,
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
                name: 'סקרי מנדטים',
                item: `${siteUrl}/elections/polls`,
              },
            ],
          },
          mainEntity:
            averages.length > 0
              ? {
                  '@type': 'ItemList',
                  name: `ממוצע ${DEFAULT_LAST_N} הסקרים האחרונים`,
                  numberOfItems: averages.length,
                  itemListElement: averages.map((party, index) => ({
                    '@type': 'ListItem',
                    position: index + 1,
                    name: party.partyName,
                    description: `${Math.round(party.seatsAvg)} מנדטים`,
                    url: `${siteUrl}/elections/${party.partyId}`,
                  })),
                }
              : undefined,
        }}
      />
      <ElectionsPollsPage />
    </>
  )
}

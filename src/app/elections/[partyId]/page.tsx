import type { Metadata } from 'next'
import { createClient } from '@supabase/supabase-js'
import { ElectionPartyPage } from '@/views/ElectionPartyPage'
import { JsonLd } from '@/components/seo/JsonLd'
import { getSiteUrl, getSupabaseAnonKey, getSupabaseUrl } from '@/lib/runtimeEnv'

type Props = {
  params: Promise<{ partyId: string }>
}

async function loadParty(partyId: string) {
  const url = getSupabaseUrl()
  const key = getSupabaseAnonKey()
  if (!url || !key) return null

  const id = Number(partyId)
  if (!Number.isInteger(id) || id < 1) return null

  const client = createClient(url, key)
  const { data } = await client
    .from('election_parties')
    .select('id, name, short_name, description, color')
    .eq('id', id)
    .maybeSingle()

  return data
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { partyId } = await params
  const party = await loadParty(partyId)
  const name = party?.name ?? 'מפלגה'
  const description =
    party?.description?.trim() ||
    `רשימת המועמדים, סטטיסטיקות ומפת מגורים של ${name} בבחירות 2026.`

  return {
    title: name,
    description,
    alternates: { canonical: `/elections/${partyId}` },
    openGraph: {
      title: `${name} | מצב האומה`,
      description,
    },
  }
}

export default async function Page({ params }: Props) {
  const { partyId } = await params
  const party = await loadParty(partyId)
  const siteUrl = getSiteUrl()

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
              alternateName: party.short_name ?? undefined,
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
          }}
        />
      ) : null}
      <ElectionPartyPage />
    </>
  )
}

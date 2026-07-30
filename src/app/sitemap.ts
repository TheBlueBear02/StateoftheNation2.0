import type { MetadataRoute } from 'next'
import { createClient } from '@supabase/supabase-js'
import { getSiteUrl, getSupabaseAnonKey, getSupabaseUrl } from '@/lib/runtimeEnv'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const siteUrl = getSiteUrl()
  const now = new Date()

  const entries: MetadataRoute.Sitemap = [
    { url: siteUrl, lastModified: now, changeFrequency: 'daily', priority: 1 },
    {
      url: `${siteUrl}/elections`,
      lastModified: now,
      changeFrequency: 'daily',
      priority: 0.9,
    },
    {
      url: `${siteUrl}/elections/polls`,
      lastModified: now,
      changeFrequency: 'hourly',
      priority: 0.9,
    },
    {
      url: `${siteUrl}/elections/lists`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.7,
    },
    {
      url: `${siteUrl}/government`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    {
      url: `${siteUrl}/knesset`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    {
      url: `${siteUrl}/about`,
      lastModified: now,
      changeFrequency: 'yearly',
      priority: 0.4,
    },
    {
      url: `${siteUrl}/terms`,
      lastModified: now,
      changeFrequency: 'yearly',
      priority: 0.3,
    },
  ]

  const url = getSupabaseUrl()
  const key = getSupabaseAnonKey()
  if (url && key) {
    const client = createClient(url, key)
    const { data } = await client
      .from('election_parties')
      .select('id')
      .eq('party_status', 'confirmed')

    for (const party of data ?? []) {
      entries.push({
        url: `${siteUrl}/elections/${party.id}`,
        lastModified: now,
        changeFrequency: 'weekly',
        priority: 0.7,
      })
    }
  }

  return entries
}

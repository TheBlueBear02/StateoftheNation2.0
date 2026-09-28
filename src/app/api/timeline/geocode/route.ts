import { NextResponse } from 'next/server'
import { isTimelineEditEnabled } from '@/lib/timeline/editAccess'

export const runtime = 'nodejs'

interface OpenMeteoResult {
  name: string
  latitude: number
  longitude: number
  country?: string
  country_code?: string
  admin1?: string
}

interface OpenMeteoResponse {
  results?: OpenMeteoResult[]
}

/** Hebrew country label → ISO 3166-1 alpha-2 for filtering Open-Meteo hits. */
const COUNTRY_CODES: Record<string, string> = {
  ישראל: 'IL',
  פולין: 'PL',
  אוסטריה: 'AT',
  הונגריה: 'HU',
  שווייץ: 'CH',
  בריטניה: 'GB',
  'ארצות הברית': 'US',
  ארהב: 'US',
  'ארה"ב': 'US',
  רוסיה: 'RU',
  אוקראינה: 'UA',
  בלארוס: 'BY',
  לטביה: 'LV',
  נורווגיה: 'NO',
  גרמניה: 'DE',
  צרפת: 'FR',
  מצרים: 'EG',
  ירדן: 'JO',
  לבנון: 'LB',
  סוריה: 'SY',
  עיראק: 'IQ',
  איראן: 'IR',
  poland: 'PL',
  israel: 'IL',
  'united states': 'US',
  usa: 'US',
}

function countryCodeFor(label: string): string | null {
  const key = label.trim()
  return COUNTRY_CODES[key] ?? COUNTRY_CODES[key.toLowerCase()] ?? null
}

export async function GET(request: Request) {
  if (!isTimelineEditEnabled()) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const { searchParams } = new URL(request.url)
  const name = searchParams.get('name')?.trim() ?? ''
  const country = searchParams.get('country')?.trim() ?? ''

  if (!name) {
    return NextResponse.json(
      { error: 'name is required' },
      { status: 400 },
    )
  }

  const url = new URL('https://geocoding-api.open-meteo.com/v1/search')
  url.searchParams.set('name', name)
  url.searchParams.set('count', '8')
  url.searchParams.set('language', 'he')
  url.searchParams.set('format', 'json')

  try {
    const response = await fetch(url.toString(), { cache: 'no-store' })
    if (!response.ok) {
      return NextResponse.json(
        { error: `Geocoder failed (${response.status})` },
        { status: 502 },
      )
    }

    const body = (await response.json()) as OpenMeteoResponse
    let results = body.results ?? []

    const code = country ? countryCodeFor(country) : null
    if (code && results.length > 0) {
      const filtered = results.filter(
        (r) => r.country_code?.toUpperCase() === code,
      )
      if (filtered.length > 0) results = filtered
    } else if (country && results.length > 0) {
      const needle = country.toLowerCase()
      const filtered = results.filter((r) =>
        (r.country ?? '').toLowerCase().includes(needle),
      )
      if (filtered.length > 0) results = filtered
    }

    if (results.length === 0) {
      return NextResponse.json(
        {
          error:
            'לא נמצאו קואורדינטות למיקום הזה. בדקו את שם העיר/מדינה או נסו באנגלית.',
        },
        { status: 404 },
      )
    }

    const hit = results[0]
    return NextResponse.json({
      lat: Math.round(hit.latitude * 1000) / 1000,
      lng: Math.round(hit.longitude * 1000) / 1000,
      displayName: [hit.name, hit.admin1, hit.country].filter(Boolean).join(', '),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Geocode failed'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}

import { NextResponse } from 'next/server'
import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'

export const runtime = 'nodejs'

/**
 * Returns true if the given IPv4/IPv6 address is loopback, link-local,
 * private, or otherwise not safe to fetch from a server (SSRF guard).
 */
function isPrivateIp(ip: string): boolean {
  const addr = ip.trim().toLowerCase()

  // IPv6
  if (addr.includes(':')) {
    if (addr === '::1' || addr === '::') return true
    // Unique local (fc00::/7) and link-local (fe80::/10)
    if (/^f[cd][0-9a-f]{2}:/.test(addr)) return true
    if (/^fe[89ab][0-9a-f]:/.test(addr)) return true
    // IPv4-mapped IPv6 (::ffff:a.b.c.d)
    const mapped = addr.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)
    if (mapped) return isPrivateIp(mapped[1])
    return false
  }

  // IPv4
  const parts = addr.split('.').map((n) => Number.parseInt(n, 10))
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return true
  const [a, b] = parts
  if (a === 10) return true
  if (a === 127) return true
  if (a === 0) return true
  if (a === 169 && b === 254) return true // link-local
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 192 && b === 168) return true
  if (a === 100 && b >= 64 && b <= 127) return true // CGNAT
  return false
}

/**
 * SSRF guard: reject hostnames that are (or resolve to) private/internal
 * addresses, so the proxy can only reach public image hosts.
 */
async function isSafePublicHost(hostname: string): Promise<boolean> {
  const host = hostname.toLowerCase()
  if (host === 'localhost' || host.endsWith('.localhost')) return false
  if (host.endsWith('.local') || host.endsWith('.internal')) return false

  // Literal IP in the URL
  if (isIP(host)) return !isPrivateIp(host)

  try {
    const results = await lookup(host, { all: true })
    if (results.length === 0) return false
    return results.every((r) => !isPrivateIp(r.address))
  } catch {
    return false
  }
}

function decodeOverEncoded(url: string): string {
  let current = url
  for (let i = 0; i < 2; i += 1) {
    if (!/%25[0-9A-Fa-f]{2}/.test(current)) break
    try {
      current = decodeURIComponent(current)
    } catch {
      break
    }
  }
  return current
}

/**
 * Wikidata P18 URLs are usually Special:FilePath without a width.
 * Adding width makes Commons return a stable thumbnail redirect.
 */
function normalizeImageUrl(rawUrl: string): URL | null {
  try {
    const target = new URL(decodeOverEncoded(rawUrl))
    if (target.protocol === 'http:') {
      target.protocol = 'https:'
    }
    if (target.protocol !== 'https:') {
      return null
    }

    const path = target.pathname
    const isFilePath =
      path.includes('/Special:FilePath/') ||
      path.includes('/wiki/Special:FilePath/') ||
      path.includes('Special:Redirect/file/')

    if (isFilePath && !target.searchParams.has('width')) {
      target.searchParams.set('width', '440')
    }

    return target
  } catch {
    return null
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const rawUrl = searchParams.get('url')

  if (!rawUrl) {
    return NextResponse.json({ error: 'Missing url' }, { status: 400 })
  }

  const target = normalizeImageUrl(rawUrl)
  if (!target) {
    return NextResponse.json({ error: 'Invalid url' }, { status: 400 })
  }

  if (!(await isSafePublicHost(target.hostname))) {
    return NextResponse.json({ error: 'Host not allowed' }, { status: 403 })
  }

  try {
    const upstream = await fetch(target.href, {
      headers: {
        Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      },
      redirect: 'follow',
      cache: 'no-store',
    })

    if (!upstream.ok) {
      return NextResponse.json(
        { error: `Upstream returned ${upstream.status}` },
        { status: 502 },
      )
    }

    const contentType = upstream.headers.get('content-type') ?? 'application/octet-stream'
    const looksLikeImage =
      contentType.startsWith('image/') ||
      contentType === 'application/octet-stream'

    if (!looksLikeImage) {
      return NextResponse.json(
        { error: `Not an image (${contentType})` },
        { status: 415 },
      )
    }

    const bytes = await upstream.arrayBuffer()
    if (bytes.byteLength < 32) {
      return NextResponse.json({ error: 'Empty image' }, { status: 502 })
    }

    return new NextResponse(bytes, {
      status: 200,
      headers: {
        'Content-Type': contentType.startsWith('image/')
          ? contentType
          : 'image/jpeg',
        'Cache-Control': 'public, max-age=86400, immutable',
      },
    })
  } catch {
    return NextResponse.json({ error: 'Failed to fetch image' }, { status: 502 })
  }
}

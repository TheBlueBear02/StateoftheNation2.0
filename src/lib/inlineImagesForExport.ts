import { getFontEmbedCSS, toPng } from 'html-to-image'

type ToPngOptions = NonNullable<Parameters<typeof toPng>[1]>

/**
 * Reliable html-to-image export for the dream-government share card.
 *
 * Always clone off-DOM first (React re-renders reset <img src>).
 * Inline every image as a data URL before calling toPng.
 */

let cachedFontEmbedCss: string | null = null

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result)
      } else {
        reject(new Error('Failed to read blob as data URL'))
      }
    }
    reader.onerror = () => reject(reader.error ?? new Error('FileReader failed'))
    reader.readAsDataURL(blob)
  })
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

function normalizeRemoteUrl(url: string): URL | null {
  try {
    const absolute = new URL(decodeOverEncoded(url), window.location.origin)
    // Upgrade http->https for genuinely remote hosts only. Upgrading a
    // same-origin/localhost dev URL would break same-origin detection and
    // route local assets (e.g. the logo) through the proxy by mistake.
    const isLocalHost =
      absolute.hostname === 'localhost' ||
      absolute.hostname === '127.0.0.1' ||
      absolute.hostname === window.location.hostname
    if (absolute.protocol === 'http:' && !isLocalHost) {
      absolute.protocol = 'https:'
    }

    const path = absolute.pathname
    const isFilePath =
      path.includes('/Special:FilePath/') ||
      path.includes('Special:Redirect/file/')
    if (isFilePath && !absolute.searchParams.has('width')) {
      absolute.searchParams.set('width', '440')
    }

    return absolute
  } catch {
    return null
  }
}

function resolveBestImageSrc(img: HTMLImageElement): string {
  const attrSrc = img.getAttribute('src') || ''
  const candidates = [img.currentSrc, attrSrc]

  const livePhotos = document.querySelectorAll<HTMLImageElement>(
    '.dream-office__photo',
  )
  for (const live of livePhotos) {
    const liveAttr = live.getAttribute('src') || ''
    if (attrSrc && (liveAttr === attrSrc || live.src === img.src)) {
      if (live.currentSrc) candidates.unshift(live.currentSrc)
      if (live.src) candidates.unshift(live.src)
    }
  }

  for (const candidate of candidates) {
    if (candidate) return candidate
  }
  return attrSrc
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () =>
      reject(new Error(`Failed to decode image: ${src.slice(0, 80)}`))
    image.src = src
  })
}

/** Wait until an <img> has fully decoded its (data) src before capture. */
async function ensureDecoded(img: HTMLImageElement): Promise<boolean> {
  try {
    if (typeof img.decode === 'function') {
      await img.decode()
      return img.naturalWidth > 0
    }
  } catch {
    // Fall back to load/error listeners.
  }

  if (img.complete && img.naturalWidth > 0) return true

  await new Promise<void>((resolve) => {
    const done = () => {
      img.removeEventListener('load', done)
      img.removeEventListener('error', done)
      resolve()
    }
    img.addEventListener('load', done)
    img.addEventListener('error', done)
    window.setTimeout(done, 5000)
  })

  return img.naturalWidth > 0
}

function isSvgContentType(type: string, url: string): boolean {
  return (
    type.includes('svg') ||
    url.toLowerCase().includes('.svg') ||
    type === 'image/svg+xml'
  )
}

function isRasterContentType(type: string): boolean {
  return (
    type.startsWith('image/png') ||
    type.startsWith('image/jpeg') ||
    type.startsWith('image/jpg') ||
    type.startsWith('image/webp') ||
    type.startsWith('image/gif') ||
    type.startsWith('image/avif')
  )
}

/** Ensure an SVG string has explicit width/height so it renders at a fixed size. */
function svgWithSize(svgText: string, width: number, height: number): string {
  let text = svgText
  if (!/<svg[^>]*\swidth\s*=/.test(text)) {
    text = text.replace(/<svg\b/i, `<svg width="${width}"`)
  }
  if (!/<svg[^>]*\sheight\s*=/.test(text)) {
    text = text.replace(/<svg\b/i, `<svg height="${height}"`)
  }
  return text
}

function svgTextToDataUrl(svgText: string, width: number, height: number): string {
  const sized = svgWithSize(svgText, width, height)
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(sized)
}

/** Rasterize SVG to PNG; fall back to a sized SVG data URL if canvas fails. */
async function svgToPngDataUrl(
  svgText: string,
  width: number,
  height: number,
): Promise<string> {
  const svgDataUrl = svgTextToDataUrl(svgText, width, height)
  try {
    const image = await loadImage(svgDataUrl)
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) return svgDataUrl
    ctx.drawImage(image, 0, 0, width, height)
    return canvas.toDataURL('image/png')
  } catch {
    // Keep the SVG itself — better than dropping the logo entirely.
    return svgDataUrl
  }
}

async function blobToExportDataUrl(
  blob: Blob,
  sourceUrl: string,
  width: number,
  height: number,
): Promise<string | null> {
  const type = blob.type || ''

  if (isSvgContentType(type, sourceUrl)) {
    const text = await blob.text()
    return svgToPngDataUrl(text, width, height)
  }

  // Keep raster images as-is (jpeg/png/webp). Re-drawing via canvas is
  // unnecessary and previously dropped valid portraits.
  if (isRasterContentType(type) || type === 'application/octet-stream' || !type) {
    return blobToDataUrl(blob)
  }

  return null
}

async function fetchUrlAsDataUrl(
  url: string,
  width: number,
  height: number,
): Promise<string | null> {
  try {
    const absolute = normalizeRemoteUrl(url)
    if (!absolute) return null

    const isSameOrigin = absolute.origin === window.location.origin

    if (isSameOrigin) {
      const response = await fetch(absolute.pathname + absolute.search)
      if (!response.ok) return null
      return blobToExportDataUrl(
        await response.blob(),
        absolute.href,
        width,
        height,
      )
    }

    // Route every cross-origin image through our same-origin proxy. The
    // proxy enforces SSRF safety, so we don't maintain a host allowlist here.
    const proxyUrl = `/api/image-proxy?url=${encodeURIComponent(absolute.href)}`
    try {
      const proxyResponse = await fetch(proxyUrl)
      if (proxyResponse.ok) {
        const blob = await proxyResponse.blob()
        if (blob.size > 32) {
          return blobToExportDataUrl(blob, absolute.href, width, height)
        }
      }
    } catch {
      // Fall through.
    }

    try {
      const corsResponse = await fetch(absolute.href, {
        mode: 'cors',
        credentials: 'omit',
      })
      if (corsResponse.ok) {
        const blob = await corsResponse.blob()
        if (blob.size > 32) {
          return blobToExportDataUrl(blob, absolute.href, width, height)
        }
      }
    } catch {
      return null
    }

    return null
  } catch {
    return null
  }
}

function replaceImageWithInitials(img: HTMLImageElement): void {
  const initials = img.getAttribute('data-initials')?.trim()
  const span = document.createElement('span')
  span.className = 'dream-share-slot__initials'
  span.setAttribute('aria-hidden', 'true')
  span.textContent = initials && initials.length > 0 ? initials : '?'
  img.replaceWith(span)
}

function imageExportSize(img: HTMLImageElement): { width: number; height: number } {
  const attrW = Number(img.getAttribute('width'))
  const attrH = Number(img.getAttribute('height'))
  const width =
    (Number.isFinite(attrW) && attrW > 0 ? attrW : 0) ||
    img.width ||
    img.clientWidth ||
    220
  const height =
    (Number.isFinite(attrH) && attrH > 0 ? attrH : 0) ||
    img.height ||
    img.clientHeight ||
    308
  return { width: Math.round(width), height: Math.round(height) }
}

export async function inlineImagesForExport(node: HTMLElement): Promise<void> {
  const images = Array.from(node.querySelectorAll('img'))

  await Promise.all(
    images.map(async (img) => {
      const src = resolveBestImageSrc(img)
      const { width, height } = imageExportSize(img)

      if (!src) {
        if (img.hasAttribute('data-initials')) {
          replaceImageWithInitials(img)
        } else {
          img.remove()
        }
        return
      }

      let dataUrl: string | null = null
      if (src.startsWith('data:')) {
        if (src.startsWith('data:image/svg')) {
          try {
            const text = decodeURIComponent(
              src.replace(/^data:image\/svg\+xml[^,]*,/, ''),
            )
            dataUrl = await svgToPngDataUrl(text, width, height)
          } catch {
            dataUrl = null
          }
        } else {
          dataUrl = src
        }
      } else {
        dataUrl = await fetchUrlAsDataUrl(src, width, height)
      }

      if (dataUrl) {
        img.removeAttribute('crossorigin')
        img.removeAttribute('loading')
        img.src = dataUrl
        // Best-effort decode so toPng doesn't snapshot too early. Even if
        // decode times out, the src is a self-contained data URL that
        // html-to-image can still embed — so never drop it here.
        await ensureDecoded(img)
        return
      }

      if (img.hasAttribute('data-initials')) {
        replaceImageWithInitials(img)
        return
      }

      img.remove()
    }),
  )
}

async function getHeeboFontEmbedCss(node: HTMLElement): Promise<string> {
  if (cachedFontEmbedCss) return cachedFontEmbedCss
  try {
    cachedFontEmbedCss = await getFontEmbedCSS(node)
    return cachedFontEmbedCss
  } catch {
    return ''
  }
}

async function runToPng(
  node: HTMLElement,
  options: ToPngOptions,
): Promise<string> {
  const fontEmbedCSS = await getHeeboFontEmbedCss(node)
  const attempts: ToPngOptions[] = [
    { ...options, pixelRatio: options.pixelRatio ?? 2 },
    { ...options, pixelRatio: 1 },
  ]

  let lastError: unknown
  for (const attempt of attempts) {
    try {
      return await toPng(node, {
        cacheBust: false,
        skipFonts: false,
        preferredFontFormat: 'woff2',
        ...(fontEmbedCSS ? { fontEmbedCSS } : {}),
        ...attempt,
      })
    } catch (error) {
      lastError = error
    }
  }
  throw lastError instanceof Error ? lastError : new Error('toPng failed')
}

/**
 * Clone `node` off-DOM, inline images as data URLs, then toPng.
 */
export async function exportNodeToPng(
  node: HTMLElement,
  options: ToPngOptions = {},
): Promise<string> {
  const clone = node.cloneNode(true) as HTMLElement
  clone.setAttribute('data-export-clone', 'true')
  clone.style.position = 'fixed'
  clone.style.left = '-10000px'
  clone.style.top = '0'
  clone.style.opacity = '1'
  clone.style.pointerEvents = 'none'
  clone.style.zIndex = '-1'
  // Ensure Heebo is requested on the cloned card.
  clone.style.fontFamily = 'var(--font-heebo), Heebo, sans-serif'
  document.body.appendChild(clone)

  try {
    await inlineImagesForExport(clone)
    await new Promise<void>((resolve) => {
      window.requestAnimationFrame(() => resolve())
    })
    return await runToPng(clone, {
      ...options,
      style: {
        ...options.style,
        opacity: '1',
        position: 'static',
        left: 'auto',
        top: 'auto',
        pointerEvents: 'none',
        fontFamily: 'var(--font-heebo), Heebo, sans-serif',
      },
    })
  } finally {
    clone.remove()
  }
}

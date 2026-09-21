import { getFontEmbedCSS, toPng } from 'html-to-image'
import { inlineImagesForExport } from './inlineImagesForExport'

const SKIP_EXPORT_SELECTORS = [
  '.office-dashboard__chart-actions',
  '.office-eras-bar__tooltip-lane',
  '.index-trend-chart__tooltip',
]

const EXPORT_PAD_PX = 16
const SITE_LOGO_SRC = '/header-logo%203.svg'

const CHART_EXPORT_CSS = `
.office-dashboard__chart-block {
  background: #ffffff;
  color: #1a1a1a;
  font-family: var(--font-heebo), Heebo, sans-serif;
  overflow: hidden;
}
.office-dashboard__chart-export-header {
  display: flex;
  flex-direction: row;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 8px;
  direction: ltr;
}
.office-dashboard__chart-export-logo {
  display: block;
  width: 132px;
  height: auto;
  flex-shrink: 0;
  margin-top: 2px;
}
.office-dashboard__chart-export-titles {
  flex: 1;
  min-width: 0;
  text-align: right;
  direction: rtl;
}
.office-dashboard__chart-export-index {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 64px;
  height: 64px;
  flex-shrink: 0;
  border-radius: 50%;
  overflow: hidden;
  background: radial-gradient(#6ba4fa, #447dd3);
}
.office-dashboard__chart-export-index--policy {
  background: radial-gradient(#e3e3e3, #c3c3c3);
}
.office-dashboard__chart-export-index--alert {
  background: radial-gradient(#ff5d5d, #ee3f33);
}
.office-dashboard__chart-export-index-icon {
  display: block;
  width: 58%;
  height: 58%;
  object-fit: contain;
}
.office-dashboard__chart-title {
  margin: 0;
  font-size: 2rem;
  font-weight: 800;
  line-height: 1.25;
  color: #1a1a1a;
  text-align: right;
}
.office-dashboard__chart-info {
  margin: 6px 0 0;
  font-size: 1.15rem;
  line-height: 1.4;
  color: #4a4a4a;
  text-align: right;
}
.index-trend-chart {
  position: relative;
  width: 100%;
  max-width: 100%;
  direction: ltr;
  unicode-bidi: isolate;
  overflow: hidden;
}
.index-trend-chart__svg {
  display: block;
  width: 100%;
  max-width: 100%;
  height: auto;
  direction: ltr;
}
.office-eras-bar {
  margin-top: 8px;
  width: 100%;
  max-width: 100%;
  direction: ltr;
}
`

export type OfficeChartExportOptions = {
  iconUrl?: string | null
  iconTone?: 'kpi' | 'policy' | 'alert'
}

function decorateExportHeader(
  cloneRoot: HTMLElement,
  options: OfficeChartExportOptions = {},
) {
  const header = cloneRoot.querySelector('.office-dashboard__chart-header')
  if (!(header instanceof HTMLElement)) return

  const titleBlock =
    header.querySelector(':scope > div:not(.office-dashboard__chart-actions)') ??
    null

  const exportHeader = document.createElement('div')
  exportHeader.className = 'office-dashboard__chart-export-header'

  const logo = document.createElement('img')
  logo.className = 'office-dashboard__chart-export-logo'
  logo.src = SITE_LOGO_SRC
  logo.alt = 'מצב האומה'
  logo.width = 132
  logo.height = 44

  const titles = document.createElement('div')
  titles.className = 'office-dashboard__chart-export-titles'
  if (titleBlock instanceof HTMLElement) {
    titles.append(...Array.from(titleBlock.childNodes))
  }

  exportHeader.append(logo, titles)

  const iconUrl = options.iconUrl?.trim()
  if (iconUrl) {
    const tone = options.iconTone ?? 'kpi'
    const circle = document.createElement('span')
    circle.className = `office-dashboard__chart-export-index office-dashboard__chart-export-index--${tone}`
    const icon = document.createElement('img')
    icon.className = 'office-dashboard__chart-export-index-icon'
    icon.src = iconUrl
    icon.alt = ''
    icon.width = 36
    icon.height = 36
    circle.append(icon)
    exportHeader.append(circle)
  }

  header.replaceWith(exportHeader)
}

function copySvgPaintFromLive(liveRoot: HTMLElement, cloneRoot: HTMLElement) {
  const liveNodes = liveRoot.querySelectorAll('.index-trend-chart__svg, .index-trend-chart__svg *')
  const cloneNodes = cloneRoot.querySelectorAll(
    '.index-trend-chart__svg, .index-trend-chart__svg *',
  )
  const count = Math.min(liveNodes.length, cloneNodes.length)
  for (let i = 0; i < count; i++) {
    const liveEl = liveNodes[i]
    const cloneEl = cloneNodes[i]
    if (!(liveEl instanceof Element) || !(cloneEl instanceof Element)) continue
    const cs = window.getComputedStyle(liveEl)
    if (liveEl instanceof SVGElement && cloneEl instanceof SVGElement) {
      const fill = cs.fill
      const stroke = cs.stroke
      if (fill && fill !== 'none') cloneEl.setAttribute('fill', fill)
      if (stroke && stroke !== 'none') cloneEl.setAttribute('stroke', stroke)
      if (cs.strokeWidth) cloneEl.setAttribute('stroke-width', cs.strokeWidth)
      if (cs.opacity && cs.opacity !== '1') {
        cloneEl.setAttribute('opacity', cs.opacity)
      }
      if (cs.fontSize) cloneEl.setAttribute('font-size', cs.fontSize)
      if (cs.fontFamily) cloneEl.style.fontFamily = cs.fontFamily
    }
  }
}

/** Size the clone SVG to the content width (inside export padding), not the live full bleed. */
function lockChartSvgSize(
  cloneRoot: HTMLElement,
  contentWidthPx: number,
  liveRoot: HTMLElement,
) {
  const cloneSvg = cloneRoot.querySelector('.index-trend-chart__svg')
  if (!(cloneSvg instanceof SVGElement) || contentWidthPx <= 0) return

  const liveSvg = liveRoot.querySelector('.index-trend-chart__svg')
  let vbWidth = 960
  let vbHeight = 460
  if (liveSvg instanceof SVGElement) {
    const vb = liveSvg.getAttribute('viewBox')
    if (vb) {
      const parts = vb.trim().split(/[\s,]+/).map(Number)
      if (parts.length === 4 && parts[2]! > 0 && parts[3]! > 0) {
        vbWidth = parts[2]!
        vbHeight = parts[3]!
      }
    }
  }

  const aspect = vbWidth / vbHeight
  const width = Math.round(contentWidthPx)
  const height = Math.round(width / aspect)
  cloneSvg.setAttribute('width', String(width))
  cloneSvg.setAttribute('height', String(height))
  cloneSvg.setAttribute('viewBox', `0 0 ${vbWidth} ${vbHeight}`)
  cloneSvg.style.width = `${width}px`
  cloneSvg.style.height = `${height}px`
  cloneSvg.style.maxWidth = '100%'
  cloneSvg.style.aspectRatio = 'auto'
}

/**
 * Export the office dashboard chart block (title + info + SVG + eras) to PNG.
 * Keeps chart + eras on the same content width (padding outside), and inlines
 * SVG paint so html-to-image does not fall back to black fills.
 *
 * Prefer capturing `.office-dashboard__chart-block--export` (fixed 960px
 * desktop layout) so mobile shares match PC proportions.
 */
export async function exportOfficeChartImage(
  liveNode: HTMLElement,
  options: OfficeChartExportOptions = {},
): Promise<string> {
  const isDesktopExport = liveNode.classList.contains(
    'office-dashboard__chart-block--export',
  )
  const liveWidth = Math.round(liveNode.getBoundingClientRect().width)
  // Desktop export shell is authored at 960px; fall back if not laid out yet.
  const contentWidth = isDesktopExport
    ? Math.max(liveWidth, 960)
    : liveWidth || liveNode.offsetWidth || 960
  const clone = liveNode.cloneNode(true) as HTMLElement
  clone.setAttribute('data-export-clone', 'true')
  clone.style.position = 'fixed'
  clone.style.left = '-10000px'
  clone.style.top = '0'
  clone.style.opacity = '1'
  clone.style.pointerEvents = 'none'
  clone.style.zIndex = '-1'
  clone.style.boxSizing = 'border-box'
  // Padding is inside the box; widen by 2*pad so content width === live chart width.
  clone.style.width = `${contentWidth + EXPORT_PAD_PX * 2}px`
  clone.style.maxWidth = `${contentWidth + EXPORT_PAD_PX * 2}px`
  clone.style.padding = `22px ${EXPORT_PAD_PX}px 12px`
  clone.style.background = '#ffffff'
  clone.style.overflow = 'hidden'
  clone.style.fontFamily = 'var(--font-heebo), Heebo, sans-serif'
  clone.dir = 'rtl'
  // Drop offscreen positioning from the live export shell so the clone lays out.
  clone.classList.remove('office-dashboard__chart-block--export')
  clone.style.left = '-10000px'
  clone.style.visibility = 'visible'

  for (const selector of SKIP_EXPORT_SELECTORS) {
    clone.querySelectorAll(selector).forEach((el) => el.remove())
  }

  decorateExportHeader(clone, options)

  const style = document.createElement('style')
  style.textContent = CHART_EXPORT_CSS
  clone.prepend(style)

  document.body.appendChild(clone)

  try {
    lockChartSvgSize(clone, contentWidth, liveNode)
    copySvgPaintFromLive(liveNode, clone)
    await inlineImagesForExport(clone)
    await new Promise<void>((resolve) => {
      window.requestAnimationFrame(() => resolve())
    })

    let fontEmbedCSS = ''
    try {
      fontEmbedCSS = await getFontEmbedCSS(clone)
    } catch {
      fontEmbedCSS = ''
    }

    const options = {
      cacheBust: false,
      pixelRatio: 2,
      backgroundColor: '#ffffff',
      skipFonts: false,
      preferredFontFormat: 'woff2' as const,
      ...(fontEmbedCSS ? { fontEmbedCSS } : {}),
      style: {
        opacity: '1',
        position: 'static',
        left: 'auto',
        top: 'auto',
        pointerEvents: 'none',
        fontFamily: 'var(--font-heebo), Heebo, sans-serif',
      },
    }

    try {
      return await toPng(clone, options)
    } catch {
      return await toPng(clone, { ...options, pixelRatio: 1 })
    }
  } finally {
    clone.remove()
  }
}

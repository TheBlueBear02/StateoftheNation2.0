import { getFontEmbedCSS, toPng } from 'html-to-image'
import { inlineImagesForExport } from './inlineImagesForExport'

const SKIP_EXPORT_SELECTORS = [
  '.office-dashboard__chart-actions',
  '.office-eras-bar__tooltip-lane',
  '.index-trend-chart__tooltip',
]

const EXPORT_PAD_PX = 28
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
.office-dashboard__chart-export-brand {
  display: flex;
  flex-direction: row;
  align-items: flex-start;
  gap: 12px;
  flex-shrink: 0;
  min-width: 0;
}
.office-dashboard__chart-export-logo {
  display: block;
  width: 156px;
  height: auto;
  flex-shrink: 0;
  margin-top: 2px;
}
.office-dashboard__chart-export-watermark {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 3px;
  min-width: 0;
  margin-top: 16px;
  text-align: left;
  direction: ltr;
}
.office-dashboard__chart-export-watermark-label {
  margin: 0;
  font-size: 0.95rem;
  font-weight: 700;
  line-height: 1.25;
  color: #4a4a4a;
  white-space: nowrap;
  text-align: left;
  direction: rtl;
  unicode-bidi: plaintext;
}
.office-dashboard__chart-export-watermark-url {
  margin: 0;
  font-size: 0.84rem;
  font-weight: 600;
  line-height: 1.25;
  color: var(--color-blue, #4890fd);
  white-space: nowrap;
  text-align: left;
  direction: ltr;
  unicode-bidi: isolate;
}
.office-dashboard__chart-export-titles {
  flex: 1;
  min-width: 0;
  text-align: right;
  direction: rtl;
}
.office-dashboard__chart-export-main {
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: stretch;
  align-self: center;
  gap: 2px;
  min-width: 0;
}
.office-dashboard__chart-export-main-row {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  min-width: 0;
  width: 100%;
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
  margin: 2px 0 0;
  font-size: 1.15rem;
  line-height: 1.35;
  color: #4a4a4a;
  text-align: right;
}
.office-dashboard__chart-export-office {
  margin: 0 0 2px;
  font-size: 1rem;
  font-weight: 700;
  line-height: 1.3;
  color: #6a6a6a;
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
.office-eras-bar__detail {
  display: flex;
  flex-wrap: nowrap;
  flex-direction: row;
  align-items: stretch;
  justify-content: stretch;
  gap: 0;
  margin-top: 12px;
  padding: 0;
  border: 0;
  background: transparent;
  overflow: visible;
}
.office-eras-bar__detail--compare {
  position: relative;
  gap: 10px;
}
.office-eras-bar__detail-half {
  display: flex;
  flex: 1 1 50%;
  align-items: center;
  gap: 14px;
  min-width: 0;
  padding: 16px 18px;
  border-top: 5px solid var(--era-accent, #4890fd);
  box-sizing: border-box;
}
.office-eras-bar__detail--compare .office-eras-bar__detail-half--older {
  padding-inline-end: 76px;
}
.office-eras-bar__detail--compare .office-eras-bar__detail-half--newer {
  padding-inline-start: 76px;
}
.office-eras-bar__detail-half--older {
  flex-direction: row;
  justify-content: flex-start;
}
.office-eras-bar__detail-half--newer {
  flex-direction: row;
  justify-content: flex-end;
}
.office-eras-bar__detail-half--solo {
  flex: 1 1 100%;
  justify-content: space-between;
}
.office-eras-bar__detail-person {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 12px;
  min-width: 0;
  flex: 1 1 auto;
}
.office-eras-bar__detail-person--newer {
  flex-direction: row-reverse;
}
.office-eras-bar__detail-avatar {
  width: 72px;
  height: 72px;
  border-radius: 50%;
  object-fit: cover;
  flex-shrink: 0;
  border: 1px solid rgba(0, 0, 0, 0.45);
  background: #f0f0f0;
  box-sizing: border-box;
}
.office-eras-bar__detail-avatar--initials {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--era-accent, #4890fd);
  color: #fff;
  font-size: 1.2rem;
  font-weight: 800;
  border-color: transparent;
}
.office-eras-bar__detail-person-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  text-align: right;
  direction: rtl;
}
.office-eras-bar__detail-person--older .office-eras-bar__detail-person-text {
  text-align: left;
  direction: rtl;
}
.office-eras-bar__detail-name {
  margin: 0;
  font-size: 1.05rem;
  font-weight: 800;
  color: #1a1a1a;
  line-height: 1.3;
}
.office-eras-bar__detail-party,
.office-eras-bar__detail-dates {
  margin: 0;
  font-size: 0.78rem;
  font-weight: 600;
  color: #666;
  line-height: 1.3;
}
.office-eras-bar__detail-dates {
  margin-top: 2px;
}
.office-eras-bar__detail-stats {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 0 0 auto;
  min-width: 0;
}
.office-eras-bar__detail-stats--older {
  align-items: flex-end;
  text-align: right;
  margin-inline-start: auto;
}
.office-eras-bar__detail-stats--newer {
  align-items: flex-start;
  text-align: left;
  margin-inline-end: auto;
}
.office-eras-bar__detail-avg-label {
  margin: 0;
  font-size: 0.78rem;
  font-weight: 700;
  color: #666;
}
.office-eras-bar__detail-avg {
  margin: 0;
  font-size: 2.1rem;
  font-weight: 800;
  color: #1a1a1a;
  line-height: 1.1;
  font-variant-numeric: tabular-nums;
}
.office-eras-bar__detail-delta-badge {
  position: absolute;
  left: 50%;
  top: 50%;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 132px;
  height: 132px;
  margin: 0;
  padding: 16px;
  border-radius: 50%;
  border: 3px solid #000;
  background: #fff;
  box-shadow: 0 6px 0 0 #000814;
  box-sizing: border-box;
  transform: translate(-50%, -50%);
}
.office-eras-bar__detail-delta-badge-text {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  width: 100%;
  max-width: 100%;
  font-size: 0.82rem;
  font-weight: 600;
  line-height: 1.25;
  text-align: center;
  color: #111;
  direction: rtl;
}
.office-eras-bar__detail-delta-badge-lead,
.office-eras-bar__detail-delta-badge-tail {
  display: block;
  width: 100%;
  text-align: center;
}
.office-eras-bar__detail-delta-badge-value {
  display: block;
  width: 100%;
  font-size: 1.25rem;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  line-height: 1.1;
  text-align: center;
}
.office-eras-bar__detail-delta-badge--up
  .office-eras-bar__detail-delta-badge-value {
  color: #ee3f33;
}
.office-eras-bar__detail-delta-badge--down
  .office-eras-bar__detail-delta-badge-value {
  color: #1a7f4b;
}
`

export type OfficeChartExportOptions = {
  iconUrl?: string | null
  iconTone?: 'kpi' | 'policy' | 'alert'
  officeName?: string | null
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

  const brand = document.createElement('div')
  brand.className = 'office-dashboard__chart-export-brand'

  const logo = document.createElement('img')
  logo.className = 'office-dashboard__chart-export-logo'
  logo.src = SITE_LOGO_SRC
  logo.alt = 'מצב האומה'
  logo.width = 156
  logo.height = 52

  const watermark = document.createElement('div')
  watermark.className = 'office-dashboard__chart-export-watermark'

  const watermarkLabel = document.createElement('p')
  watermarkLabel.className = 'office-dashboard__chart-export-watermark-label'
  watermarkLabel.textContent = 'לעוד מידע חפשו אתר מצב האומה'

  const watermarkUrl = document.createElement('p')
  watermarkUrl.className = 'office-dashboard__chart-export-watermark-url'
  watermarkUrl.textContent = 'stateofthenation.co.il'

  watermark.append(watermarkLabel, watermarkUrl)
  brand.append(logo, watermark)

  const main = document.createElement('div')
  main.className = 'office-dashboard__chart-export-main'

  const officeName = options.officeName?.trim()
  if (officeName) {
    const officeLine = document.createElement('p')
    officeLine.className = 'office-dashboard__chart-export-office'
    officeLine.textContent = officeName
    main.append(officeLine)
  }

  const mainRow = document.createElement('div')
  mainRow.className = 'office-dashboard__chart-export-main-row'

  const titles = document.createElement('div')
  titles.className = 'office-dashboard__chart-export-titles'
  if (titleBlock instanceof HTMLElement) {
    titles.append(...Array.from(titleBlock.childNodes))
  }
  mainRow.append(titles)

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
    mainRow.append(circle)
  }

  main.append(mainRow)
  exportHeader.append(brand, main)

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
  let vbHeight = 400
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
 * Export the office dashboard chart block (title + info + SVG + eras +
 * selected-era detail / compare panel) to PNG.
 * Keeps chart + eras on the same content width (padding outside), and inlines
 * SVG paint so html-to-image does not fall back to black fills.
 *
 * Prefer capturing `.office-dashboard__chart-block--export` (fixed 960px
 * desktop layout, including the side-by-side compare row) so mobile shares
 * match PC proportions.
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
  clone.style.padding = `32px ${EXPORT_PAD_PX}px 24px`
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

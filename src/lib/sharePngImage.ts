/** Share a PNG produced asynchronously (html-to-image, etc.). */

export type SharePngMethod = 'clipboard' | 'share' | 'download'

export type SharePngResult =
  | { ok: true; method: SharePngMethod }
  | { ok: false; error: string }

function downloadDataUrl(dataUrl: string, filename: string) {
  const link = document.createElement('a')
  link.download = filename
  link.href = dataUrl
  link.click()
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => {
      if (typeof reader.result === 'string') resolve(reader.result)
      else reject(new Error('Failed to read blob as data URL'))
    }
    reader.onerror = () =>
      reject(reader.error ?? new Error('FileReader failed'))
    reader.readAsDataURL(blob)
  })
}

function asPngBlob(blob: Blob): Blob {
  if (blob.type === 'image/png') return blob
  return new Blob([blob], { type: 'image/png' })
}

function isLikelyMobile(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent || ''
  if (/Android|iPhone|iPad|iPod|Mobile|SamsungBrowser/i.test(ua)) {
    return true
  }
  try {
    return window.matchMedia('(pointer: coarse)').matches
  } catch {
    return false
  }
}

/** Android / Samsung Internet: clipboard images are unreliable — prefer Web Share. */
function prefersNativeFileShare(): boolean {
  if (typeof navigator === 'undefined') return false
  if (typeof navigator.share !== 'function') return false
  const ua = navigator.userAgent || ''
  return /Android|SamsungBrowser/i.test(ua) || isLikelyMobile()
}

function canUseClipboardImageWrite(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    Boolean(navigator.clipboard) &&
    typeof navigator.clipboard.write === 'function' &&
    typeof ClipboardItem !== 'undefined'
  )
}

async function tryNativeFileShare(
  blob: Blob,
  filename: string,
  shareTitle?: string,
  shareText?: string,
): Promise<'shared' | 'aborted' | 'unsupported' | 'blocked'> {
  if (typeof navigator === 'undefined' || typeof navigator.share !== 'function') {
    return 'unsupported'
  }

  const file = new File([blob], filename, { type: 'image/png' })
  const payload = {
    files: [file],
    ...(shareTitle ? { title: shareTitle } : {}),
    ...(shareText ? { text: shareText } : {}),
  }

  // Soft check only — Samsung Internet sometimes reports canShare=false
  // even though share({ files }) works.
  if (typeof navigator.canShare === 'function') {
    try {
      const allowed =
        navigator.canShare({ files: [file] }) || navigator.canShare(payload)
      if (!allowed) {
        // Still attempt share() below.
      }
    } catch {
      // continue to share()
    }
  }

  try {
    await navigator.share(payload)
    return 'shared'
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      return 'aborted'
    }
    if (error instanceof DOMException && error.name === 'NotAllowedError') {
      return 'blocked'
    }
    return 'unsupported'
  }
}

/**
 * Open the PNG so the user can long-press → Share / Save (mobile fallback).
 */
function openBlobInNewTab(blob: Blob): boolean {
  try {
    const url = URL.createObjectURL(blob)
    const opened = window.open(url, '_blank', 'noopener,noreferrer')
    // Revoke later so the tab has time to load.
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
    return Boolean(opened)
  } catch {
    return false
  }
}

/**
 * Copy / share a PNG that is built asynchronously.
 *
 * - **iOS Safari:** `clipboard.write` must start in the click turn with a
 *   `Promise<Blob>` inside `ClipboardItem` (export runs inside the promise).
 * - **Android / Samsung Internet:** image clipboard is unreliable; prefer the
 *   native share sheet. Trying clipboard first can consume the user gesture
 *   and then block `navigator.share`.
 * - Fallback: open image tab (long-press share) → `<a download>`.
 */
export async function sharePngImage(options: {
  makeBlob: () => Promise<Blob>
  filename: string
  shareTitle?: string
  shareText?: string
}): Promise<SharePngResult> {
  const { makeBlob, filename, shareTitle, shareText } = options
  const preferShare = prefersNativeFileShare()

  let blobPromise: Promise<Blob> | null = null
  const getBlob = () => {
    if (!blobPromise) {
      blobPromise = (async () => {
        const blob = await makeBlob()
        if (blob.size < 100) {
          throw new Error('Exported image was empty')
        }
        return asPngBlob(blob)
      })()
    }
    return blobPromise
  }

  // Desktop / iOS: try clipboard first (Safari-safe Promise form).
  if (!preferShare && canUseClipboardImageWrite()) {
    try {
      await navigator.clipboard.write([
        new ClipboardItem({ 'image/png': getBlob() }),
      ])
      return { ok: true, method: 'clipboard' }
    } catch {
      // Fall through to share / download.
    }
  }

  try {
    const blob = await getBlob()

    const shareResult = await tryNativeFileShare(
      blob,
      filename,
      shareTitle,
      shareText,
    )
    if (shareResult === 'shared' || shareResult === 'aborted') {
      return { ok: true, method: 'share' }
    }

    // Desktop leftover path: clipboard after share unsupported.
    if (!preferShare && canUseClipboardImageWrite()) {
      try {
        await navigator.clipboard.write([
          new ClipboardItem({ 'image/png': blob }),
        ])
        return { ok: true, method: 'clipboard' }
      } catch {
        // continue
      }
    }

    // Mobile: opening the image is more useful than a silent <a download>.
    if (preferShare && openBlobInNewTab(blob)) {
      return { ok: true, method: 'download' }
    }

    const dataUrl = await blobToDataUrl(blob)
    downloadDataUrl(dataUrl, filename)
    return { ok: true, method: 'download' }
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : 'לא ניתן לייצא את התמונה',
    }
  }
}

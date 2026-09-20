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

/**
 * Copy / share a PNG that is built asynchronously.
 *
 * Safari / iOS WebKit drop user-activation if you `await` export work *before*
 * calling `navigator.clipboard.write`. Pass a `Promise<Blob>` into
 * `ClipboardItem` and invoke `write()` in the same turn as the click instead.
 *
 * Fallback order: clipboard → Web Share (files) → download.
 */
export async function sharePngImage(options: {
  makeBlob: () => Promise<Blob>
  filename: string
  shareTitle?: string
  shareText?: string
}): Promise<SharePngResult> {
  const { makeBlob, filename, shareTitle, shareText } = options

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

  if (
    typeof navigator !== 'undefined' &&
    navigator.clipboard &&
    typeof navigator.clipboard.write === 'function' &&
    typeof ClipboardItem !== 'undefined'
  ) {
    try {
      // Critical: construct ClipboardItem + call write() without awaiting
      // makeBlob first — Safari needs this inside the user-gesture turn.
      await navigator.clipboard.write([
        new ClipboardItem({ 'image/png': getBlob() }),
      ])
      return { ok: true, method: 'clipboard' }
    } catch {
      // Clipboard image write unsupported or activation lost — try share/download.
    }
  }

  try {
    const blob = await getBlob()
    const file = new File([blob], filename, { type: 'image/png' })

    if (
      typeof navigator !== 'undefined' &&
      typeof navigator.canShare === 'function' &&
      navigator.canShare({ files: [file] })
    ) {
      try {
        await navigator.share({
          files: [file],
          ...(shareTitle ? { title: shareTitle } : {}),
          ...(shareText ? { text: shareText } : {}),
        })
        return { ok: true, method: 'share' }
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return { ok: true, method: 'share' }
        }
      }
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

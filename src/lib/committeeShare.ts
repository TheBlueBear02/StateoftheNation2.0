/** Shareable path + link helpers for `/knesset/committees`. */

export function buildCommitteesSharePath(
  committeeId: number | null,
  sessionId: number | null = null,
): string {
  const params = new URLSearchParams()
  if (committeeId != null) {
    params.set('committee', String(committeeId))
  }
  if (sessionId != null) {
    params.set('session', String(sessionId))
  }
  const query = params.toString()
  return query ? `/knesset/committees?${query}` : '/knesset/committees'
}

export type SharePageLinkResult = 'shared' | 'copied' | 'aborted' | 'failed'

/** Native share sheet when available; otherwise copy the URL. */
export async function sharePageLink(options: {
  url: string
  title: string
  text?: string
}): Promise<SharePageLinkResult> {
  const { url, title, text } = options

  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      await navigator.share({
        title,
        url,
        ...(text ? { text } : {}),
      })
      return 'shared'
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return 'aborted'
      }
      // Fall through to clipboard.
    }
  }

  try {
    if (
      typeof navigator === 'undefined' ||
      !navigator.clipboard ||
      typeof navigator.clipboard.writeText !== 'function'
    ) {
      return 'failed'
    }
    await navigator.clipboard.writeText(url)
    return 'copied'
  } catch {
    return 'failed'
  }
}

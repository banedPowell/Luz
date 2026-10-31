const STRIP_PARAMS = new Set(['si', 'feature', 'fbclid', 'igshid'])

export function sanitizeUrl(raw: string): string {
  const trimmed = raw.trim()
  try {
    const url = new URL(trimmed)
    for (const key of [...url.searchParams.keys()]) {
      if (STRIP_PARAMS.has(key) || key.startsWith('utm_')) {
        url.searchParams.delete(key)
      }
    }
    return url.toString()
  } catch {
    return trimmed
  }
}

/** URL YouTube / YouTube Music pointant vers une playlist. */
export function isYoutubePlaylistUrl(raw: string): boolean {
  try {
    const url = new URL(sanitizeUrl(raw))
    const host = url.hostname.replace(/^www\./, '')
    if (!host.includes('youtube.com') && host !== 'youtu.be') return false
    if (url.searchParams.has('list')) return true
    return /\/playlist(?:\/|$)/i.test(url.pathname)
  } catch {
    return /[?&]list=[^&]+/.test(raw)
  }
}

import type { Track } from '#shared/domain/track'

/** N° lu directement depuis le fichier (sans cache Luz). */
export function resolveTrackNumberFromDisk(fileTrackNumber: number | undefined | null): number | undefined {
  if (fileTrackNumber == null || Number.isNaN(fileTrackNumber)) return undefined
  return fileTrackNumber
}

/** N° affiché dans l'UI : miroir du tag fichier indexé (`metadata.file`). */
export function resolveTrackNumberForDisplay(track: Pick<Track, 'metadata'>): number | undefined {
  return track.metadata.file.trackNumber
}

export function formatTrackNumberForDisplay(track: Pick<Track, 'metadata'>): number | string {
  const n = resolveTrackNumberForDisplay(track)
  return n ?? '—'
}

/** @deprecated utiliser resolveTrackNumberForDisplay ou resolveTrackNumberFromDisk */
export function resolveTrackNumber(
  track: Pick<Track, 'metadata' | 'trackNumber'>,
  opts?: { fileTags?: { trackNumber?: number } | null }
): number | undefined {
  return resolveTrackNumberFromDisk(opts?.fileTags?.trackNumber)
    ?? resolveTrackNumberForDisplay(track)
}

/** @deprecated utiliser formatTrackNumberForDisplay */
export function formatTrackNumber(
  track: Pick<Track, 'metadata' | 'trackNumber'>,
  opts?: { fileTags?: { trackNumber?: number } | null }
): number | string {
  const n = resolveTrackNumber(track, opts)
  return n ?? '—'
}

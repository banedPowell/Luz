import type { Album } from '../domain/album'
import type { MetadataLayers, Track } from '../domain/track'

export function normalizeTitleKey(title: string): string {
  return title.trim().toLowerCase()
}

/** Titres présents plus d'une fois dans une liste (comparaison insensible à la casse). */
export function findDuplicateTitleKeys(tracks: Iterable<Pick<Track, 'metadata'>>): Set<string> {
  const counts = new Map<string, number>()
  for (const t of tracks) {
    const key = normalizeTitleKey(t.metadata.library.title)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  const dupes = new Set<string>()
  for (const [key, n] of counts) {
    if (n > 1) dupes.add(key)
  }
  return dupes
}

export function trackArtistLabel(track: Pick<Track, 'metadata'>, preferFile = true): string {
  const file = track.metadata.file.artist?.trim()
  const library = track.metadata.library.artist?.trim()
  const original = track.metadata.original.artist?.trim()
  if (preferFile && file) return file
  if (library) return library
  if (original) return original
  return '—'
}

export function trackAlbumLabel(
  track: Pick<Track, 'metadata' | 'albumId'>,
  albums?: Album[]
): string | undefined {
  if (track.albumId && albums?.length) {
    const album = albums.find(a => a.id === track.albumId)
    if (album?.title?.trim()) return album.title.trim()
  }
  return track.metadata.library.album?.trim()
    || track.metadata.file.album?.trim()
    || undefined
}

export function formatDurationShort(seconds?: number): string | undefined {
  if (seconds == null || seconds <= 0) return undefined
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

function trackFileName(track: Pick<Track, 'file' | 'metadata'>): string | undefined {
  const fromPath = track.file.path?.split(/[/\\]/).pop()?.trim()
  if (fromPath) return fromPath
  return track.metadata.folder?.filename?.trim() || undefined
}

function buildBaseSubtitle(track: Track, albums?: Album[]): string {
  const parts: string[] = []
  const artist = trackArtistLabel(track)
  if (artist && artist !== '—') parts.push(artist)

  const album = trackAlbumLabel(track, albums)
  if (album) parts.push(album)

  const duration = formatDurationShort(track.file.duration)
  if (duration) parts.push(duration)

  return parts.join(' · ')
}

export interface TrackSubtitleOptions {
  albums?: Album[]
  duplicateTitleKeys?: Set<string>
  /** Toujours afficher le sous-titre (playlists, file d'attente). */
  always?: boolean
}

/** Sous-titre contextuel pour distinguer les homonymes dans une liste. */
export function trackSubtitle(
  track: Track,
  opts: TrackSubtitleOptions = {}
): string | undefined {
  const titleKey = normalizeTitleKey(track.metadata.library.title)
  if (!opts.always && !opts.duplicateTitleKeys?.has(titleKey)) return undefined
  return buildBaseSubtitle(track, opts.albums) || undefined
}

/** Sous-titre avec repli sur le nom de fichier si plusieurs pistes partagent titre + artiste + album. */
export function trackSubtitleForList(
  track: Track,
  allTracks: Track[],
  albums?: Album[],
  opts: { always?: boolean } = {}
): string | undefined {
  const dupes = findDuplicateTitleKeys(allTracks)
  const titleKey = normalizeTitleKey(track.metadata.library.title)
  if (!opts.always && !dupes.has(titleKey)) return undefined

  const base = buildBaseSubtitle(track, albums)
  if (!base) return trackFileName(track)

  const sameTitle = allTracks.filter(t => normalizeTitleKey(t.metadata.library.title) === titleKey)
  const sameBase = sameTitle.filter(t => buildBaseSubtitle(t, albums) === base)
  if (sameBase.length <= 1) return base

  const fname = trackFileName(track)
  return fname ? `${base} · ${fname}` : base
}

/** Libellé complet pour confirmations, toasts et journaux. */
export function formatTrackLabel(
  track: Track,
  albums?: Album[]
): string {
  const title = track.metadata.library.title
  const artist = trackArtistLabel(track)
  const album = trackAlbumLabel(track, albums)
  const parts = [title]
  if (artist && artist !== '—') parts.push(artist)
  if (album) parts.push(album)
  return parts.join(' — ')
}

/** Libellé à partir des métadonnées seules (téléchargements, file d'attente). */
export function formatMetadataLayersLabel(layers: MetadataLayers): string {
  const title = layers.library.title
  const artist = layers.file.artist?.trim() || layers.library.artist?.trim()
  const album = layers.library.album?.trim() || layers.file.album?.trim()
  const parts = [title]
  if (artist) parts.push(artist)
  if (album) parts.push(album)
  return parts.join(' — ')
}

import type { AppSettings } from '../domain/settings'
import type { DestinationContext } from '../domain/download'
import { isYoutubePlaylistUrl } from './url'

export { isYoutubePlaylistUrl }

function joinPath(...parts: string[]): string {
  return parts
    .filter(Boolean)
    .join('/')
    .replace(/\\/g, '/')
}

export type DownloadDestinationMode = 'auto' | 'library' | 'playlist'
export type ResolvedDestinationMode = 'library' | 'playlist'

export function isMultiTrackSource(trackCount: number, url?: string): boolean {
  return trackCount > 1 || isYoutubePlaylistUrl(url || '')
}

export function resolveDestinationMode(
  mode: DownloadDestinationMode | undefined,
  context: DestinationContext,
  trackCount = 1,
  url?: string
): ResolvedDestinationMode {
  if (mode === 'library') return 'library'
  if (mode === 'playlist') return 'playlist'

  if (context.type === 'playlist' && context.playlistId) return 'playlist'
  if (context.type === 'album' && context.albumId) return 'library'
  if (context.type === 'artist' || context.type === 'singles') return 'library'
  if (isMultiTrackSource(trackCount, url)) return 'playlist'
  return 'library'
}

export function resolvePlaylistFolderName(input: {
  luzPlaylistName?: string
  sourceTitle?: string
}): string {
  return input.luzPlaylistName?.trim() || input.sourceTitle?.trim() || 'Playlist'
}

export function defaultPlaylistOutputTemplate(libraryPath: string): string {
  return joinPath(libraryPath, 'playlists', '%(playlist)s', '%(artist)s - %(title)s.%(ext)s')
}

export function normalizePathKey(path: string): string {
  return path.replace(/\\/g, '/').toLowerCase()
}

/** Nom de fichier disque : « Artiste - Titre.ext » */
export function buildTrackFilename(artist: string, title: string, ext: string): string {
  const a = sanitizeSegment(artist) || 'Unknown Artist'
  const t = sanitizeSegment(title) || 'Unknown Title'
  const cleanExt = ext.replace(/^\./, '')
  return `${a} - ${t}.${cleanExt}`
}

/**
 * Retourne un chemin libre si `desiredPath` est déjà pris dans `occupied`.
 * Ajoute « (2) », « (3) », … avant l'extension si nécessaire.
 */
export function ensureUniqueFilePath(
  desiredPath: string,
  occupied: Set<string>,
  exceptPath?: string
): string {
  const occupiedKeys = new Set([...occupied].map(normalizePathKey))
  const exceptKey = exceptPath ? normalizePathKey(exceptPath) : undefined

  const isFree = (p: string) => {
    const key = normalizePathKey(p)
    return !occupiedKeys.has(key) || (exceptKey !== undefined && key === exceptKey)
  }

  if (isFree(desiredPath)) return desiredPath

  const sepIdx = Math.max(desiredPath.lastIndexOf('/'), desiredPath.lastIndexOf('\\'))
  const dir = sepIdx >= 0 ? desiredPath.slice(0, sepIdx + 1) : ''
  const filename = sepIdx >= 0 ? desiredPath.slice(sepIdx + 1) : desiredPath
  const dot = filename.lastIndexOf('.')
  const base = dot >= 0 ? filename.slice(0, dot) : filename
  const ext = dot >= 0 ? filename.slice(dot) : ''

  let n = 2
  let candidate = `${dir}${base} (${n})${ext}`
  while (!isFree(candidate)) {
    n++
    candidate = `${dir}${base} (${n})${ext}`
  }
  return candidate
}

export function resolveEffectiveOutputTemplate(
  settings: AppSettings,
  mode: ResolvedDestinationMode,
  customTemplate?: string
): string {
  if (customTemplate?.trim()) return customTemplate.trim()
  if (mode === 'playlist') {
    return settings.playlistOutputTemplate?.trim()
      || defaultPlaylistOutputTemplate(settings.libraryPath)
  }
  return settings.outputTemplate
}

export interface FinalPathParams {
  folderArtist: string
  album?: string
  title: string
  ext: string
  artistOverride?: string
  albumOverride?: string
  playlistTitle?: string
  destinationMode: ResolvedDestinationMode
}

export function resolveFinalFilePath(
  template: string | undefined,
  settings: AppSettings,
  context: DestinationContext,
  params: FinalPathParams
): string {
  const title = sanitizeSegment(params.title)
  const ext = params.ext

  if (params.destinationMode === 'playlist') {
    const playlist = sanitizeSegment(
      params.playlistTitle
      || (context.type === 'playlist' && params.albumOverride)
      || 'Playlist'
    )
    const artist = sanitizeSegment(
      params.artistOverride || params.folderArtist || 'Unknown Artist'
    )
    const effective = template?.trim()
      || settings.playlistOutputTemplate?.trim()
      || defaultPlaylistOutputTemplate(settings.libraryPath)

    if (!effective.includes('%')) {
      return joinPath(effective, buildTrackFilename(artist, title, ext))
    }

    return effective
      .replace(/%\(playlist_title\|Playlist\)s/gi, playlist)
      .replace(/%\(playlist_title\)s/gi, playlist)
      .replace(/%\(playlist\)s/gi, playlist)
      .replace(/%\(artist\|uploader\|channel\)s/gi, artist)
      .replace(/%\(artist\|uploader\)s/gi, artist)
      .replace(/%\(artist\)s/gi, artist)
      .replace(/%\(title\)s/gi, title)
      .replace(/%\(ext\)s/gi, ext)
  }

  const folderArtist = sanitizeSegment(
    params.artistOverride ? params.artistOverride : params.folderArtist
  )
  const album = sanitizeSegment(
    context.type === 'singles'
      ? 'singles'
      : (params.albumOverride || params.album || 'Singles')
  )

  let path = template?.trim() || settings.outputTemplate?.trim() || ''
  if (!path) {
    if (context.type === 'singles') {
      return joinPath(settings.libraryPath, folderArtist, 'singles', `${title}.${ext}`)
    }
    return joinPath(settings.libraryPath, folderArtist, album, `${title}.${ext}`)
  }

  path = path
    .replace(/%\(artist\|uploader\|channel\)s/gi, folderArtist)
    .replace(/%\(artist\|uploader\)s/gi, folderArtist)
    .replace(/%\(artist\)s/gi, folderArtist)
    .replace(/%\(album\|Singles\)s/gi, album)
    .replace(/%\(album\)s/gi, album)
    .replace(/%\(title\)s/gi, title)
    .replace(/%\(ext\)s/gi, ext)

  return path
}

function sanitizeSegment(s: string): string {
  return s.replace(/[<>:"/\\|?*]/g, '_').trim()
}

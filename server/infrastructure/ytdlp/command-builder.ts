import type { DestinationContext } from '#shared/domain/download'
import type { DownloadOptions } from '#shared/domain/download'
import type { AppSettings } from '#shared/domain/settings'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { normalizeFolderArtist } from '../../modules/metadata/metadata.service'
import { getYoutubeCookiesPath } from '../../modules/settings/youtube-cookies.service'
import {
  resolveFinalFilePath,
  type ResolvedDestinationMode
} from '#shared/utils/download-destination'
import { isYoutubePlaylistUrl } from '#shared/utils/url'
import { resolveStoragePath } from '../paths/data-dir'

export interface CommandBuildInput {
  url: string
  options: DownloadOptions
  settings: AppSettings
  destinationContext: DestinationContext
  jobId: string
  outputTemplate?: string
  artistOverride?: string
  albumOverride?: string
  playlistItems?: string
  customArgs?: string[]
  destinationMode?: ResolvedDestinationMode
  playlistTitle?: string
  /** Nombre de morceaux sélectionnés (playlists). */
  trackCount?: number
}

export { resolveFinalFilePath }

export function getStagingDir(settings: AppSettings, jobId: string): string {
  const base = settings.appDataPath
    ? resolveStoragePath(settings.appDataPath)
    : join(resolveStoragePath(settings.libraryPath), '.config')
  return join(base, 'staging', jobId)
}

export function buildStagingTemplate(settings: AppSettings, jobId: string): string {
  return join(getStagingDir(settings, jobId), '%(playlist_index)03d-%(title)s.%(ext)s')
}

/** Chemin cookies.txt sur disque (indépendamment du cache settings). */
export function buildCookieArgs(_settings?: AppSettings): string[] {
  const path = getYoutubeCookiesPath()
  if (existsSync(path)) return ['--cookies', path]
  return []
}

/** Auth téléchargement : cookies uniquement, sans forcer player_client (comme yt-dlp en CLI). */
export function buildDownloadAuthArgs(settings?: AppSettings, opts?: { skipCookies?: boolean }): string[] {
  if (opts?.skipCookies) return []
  return buildCookieArgs(settings)
}

/** Cookies + client web — test de connexion et analyse avec authentification. */
export function buildYoutubeCompatArgs(settings?: AppSettings): string[] {
  const cookieArgs = buildCookieArgs(settings)
  if (!cookieArgs.length) return []
  return [...cookieArgs, '--extractor-args', 'youtube:player_client=web']
}

export interface AnalyzeArgsOptions {
  skipCookies?: boolean
}

export interface DownloadArgsOptions {
  skipCookies?: boolean
}

export class YtDlpCommandBuilder {
  /**
   * Analyse metadata. Pour les playlists : --flat-playlist (comme un téléchargement direct)
   * au lieu d'extraire chaque vidéo (échoue souvent sur sign-in / restriction d'âge).
   */
  buildAnalyzeArgs(url: string, settings?: AppSettings, opts?: AnalyzeArgsOptions): string[] {
    const args: string[] = []
    if (settings && !opts?.skipCookies) {
      args.push(...buildYoutubeCompatArgs(settings))
    }
    if (isYoutubePlaylistUrl(url)) {
      args.push('--flat-playlist')
    }
    args.push('--dump-single-json', '--no-warnings', url)
    return args
  }

  /** Aperçu du chemin final sur disque. */
  previewFinalPath(input: Omit<CommandBuildInput, 'url' | 'options' | 'playlistItems' | 'customArgs'> & {
    sampleArtist?: string
    sampleAlbum?: string
    sampleTitle?: string
    samplePlaylist?: string
    sampleExt?: string
    destinationMode: ResolvedDestinationMode
  }): string {
    const artist = input.artistOverride || input.sampleArtist || 'Artiste Principal'
    const album = input.albumOverride || input.sampleAlbum || 'Mon Album'
    const title = input.sampleTitle || 'Mon Titre (feat. Guest)'
    const ext = input.sampleExt || input.settings.downloadDefaults.format || 'm4a'
    return resolveFinalFilePath(
      input.outputTemplate,
      input.settings,
      input.destinationContext,
      {
        folderArtist: normalizeFolderArtist(artist),
        album,
        title,
        ext,
        artistOverride: input.artistOverride,
        albumOverride: input.albumOverride,
        playlistTitle: input.playlistTitle || input.samplePlaylist || 'Ma Playlist',
        destinationMode: input.destinationMode
      }
    )
  }

  buildFormatArgs(format: string): string[] {
    switch (format) {
      case 'm4a':
        return ['-f', 'ba[ext=m4a]/ba', '-x', '--audio-format', 'm4a']
      case 'mp3':
        return ['-f', 'ba[ext=mp3]/ba', '-x', '--audio-format', 'mp3']
      case 'flac':
        return ['-f', 'ba[ext=flac]/ba', '-x', '--audio-format', 'flac']
      case 'opus':
        return ['-f', 'ba[ext=opus]/ba', '-x', '--audio-format', 'opus']
      case 'bestaudio':
      default:
        return ['-f', 'ba/bestaudio', '-x', '--audio-format', 'best']
    }
  }

  buildQualityArg(quality: string): string[] {
    if (quality === 'best') return []
    const kbps = parseInt(quality, 10)
    if (!isNaN(kbps)) return ['--audio-quality', String(kbps)]
    return []
  }

  buildDownloadArgs(input: CommandBuildInput, opts?: DownloadArgsOptions): string[] {
    const {
      url, options, settings, jobId, playlistItems
    } = input

    const template = buildStagingTemplate(settings, jobId)

    const args: string[] = [
      ...buildDownloadAuthArgs(settings, opts),
      ...this.buildFormatArgs(options.format),
      ...this.buildQualityArg(options.quality)
    ]

    if (options.embedCover) args.push('--embed-thumbnail')
    if (options.writeMetadata) {
      args.push('--embed-metadata', '--add-metadata')
      args.push('--parse-metadata', 'playlist_index:%(track_number)s')
    }

    args.push('--progress', '--newline')

    const isPlaylist = isYoutubePlaylistUrl(url) || (input.trackCount ?? 0) > 1
    if (isPlaylist) args.push('--ignore-errors')

    if (playlistItems) args.push('--playlist-items', playlistItems)

    args.push('-o', template, url)

    if (input.customArgs?.length) args.push(...input.customArgs)

    return args
  }

  preview(command: string, args: string[]): string {
    const escaped = args.map((a) => (a.includes(' ') ? `"${a}"` : a))
    return `${command} ${escaped.join(' ')}`
  }
}

export const ytdlpCommandBuilder = new YtDlpCommandBuilder()

import type { CachePolicy } from '../constants/defaults'

export type FeatStrategy = 'metadata_only' | 'title_and_metadata' | 'title_only'

export interface DownloadDefaults {
  format: string
  quality: string
  embedCover: boolean
  writeMetadata: boolean
}

export interface MetadataRules {
  featStrategy: FeatStrategy
}

/** Authentification YouTube pour yt-dlp (vidéos restreintes, playlists privées, etc.) */
export interface YoutubeCookiesSettings {
  /** Chemin vers cookies.txt (géré par Luz dans .config/cookies/) */
  filePath?: string
  lastTestAt?: string
  lastTestOk?: boolean
  lastTestMessage?: string
}

export interface AppSettings {
  theme: 'light' | 'dark' | 'system'
  accent: string
  language: string
  thumbnailSize: 'sm' | 'md' | 'lg'
  sidebarCollapsed: boolean
  cachePolicy: CachePolicy
  downloadConcurrency: number
  appDataPath?: string
  lastScanAt?: string
  libraryPath: string
  downloadDefaults: DownloadDefaults
  metadataRules: MetadataRules
  outputTemplate: string
  /** Formule pour les téléchargements en dossier playlist (YouTube, playlist Luz, etc.) */
  playlistOutputTemplate?: string
  supportedFormats: string[]
  youtubeCookies?: YoutubeCookiesSettings
}

export const DEFAULT_SUPPORTED_FORMATS = ['mp3', 'flac', 'm4a', 'opus', 'ogg', 'wav', 'ape']

export function createDefaultSettings(libraryPath = '~/Music/Luz'): AppSettings {
  return {
    theme: 'system',
    accent: 'red',
    language: 'fr',
    thumbnailSize: 'md',
    sidebarCollapsed: false,
    cachePolicy: 'ask',
    downloadConcurrency: 1,
    libraryPath: libraryPath,
    downloadDefaults: {
      format: 'm4a',
      quality: 'best',
      embedCover: true,
      writeMetadata: true
    },
    metadataRules: {
      featStrategy: 'metadata_only'
    },
    outputTemplate: `${libraryPath}/%(artist)s/%(album)s/%(title)s.%(ext)s`,
    playlistOutputTemplate: `${libraryPath}/playlists/%(playlist)s/%(artist)s - %(title)s.%(ext)s`,
    supportedFormats: [...DEFAULT_SUPPORTED_FORMATS]
  }
}

/** @deprecated use createDefaultSettings */
export const DEFAULT_SETTINGS: AppSettings = createDefaultSettings()

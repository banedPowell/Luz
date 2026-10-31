import type { DownloadStatus, DownloadStep } from '../constants/download'
import type { MetadataLayers } from './track'

export interface QualityInfo {
  codec?: string
  bitrate?: number
  format?: string
  label: string
}

export type DestinationContextType = 'root' | 'artist' | 'album' | 'singles' | 'playlist'

export interface DestinationContext {
  type: DestinationContextType
  artistId?: string
  albumId?: string
  playlistId?: string
}

export interface DownloadTrackItem {
  id: string
  selected: boolean
  sourceUrl?: string
  sourceQuality?: QualityInfo
  outputQuality?: QualityInfo
  metadata: MetadataLayers
  order: number
  progress: number
  status: DownloadStatus
  error?: string
}

export type DownloadDestinationMode = 'auto' | 'library' | 'playlist'

export interface DownloadOptions {
  format: string
  quality: string
  embedCover: boolean
  writeMetadata: boolean
  featStrategy?: 'metadata_only' | 'title_and_metadata' | 'title_only'
  cachePolicy?: 'reuse' | 'duplicate' | 'ask'
  /** Organisation des fichiers sur disque */
  destinationMode?: DownloadDestinationMode
}

export interface DownloadJob {
  id: string
  url: string
  status: DownloadStatus
  step: DownloadStep
  progress: number
  eta?: number
  profileId?: string
  destinationContext: DestinationContext
  tracks: DownloadTrackItem[]
  options: DownloadOptions
  outputTemplate?: string
  customArgs?: string[]
  /** Titre playlist / album source (analyse yt-dlp) */
  sourceTitle?: string
  errors: string[]
  createdAt: string
  updatedAt: string
}

export interface DownloadAnalysis {
  url: string
  title?: string
  uploader?: string
  platform?: string
  sourceQuality?: QualityInfo
  tracks: DownloadTrackItem[]
}

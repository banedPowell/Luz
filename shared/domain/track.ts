export interface TrackMetadata {
  artist: string
  album?: string
  title: string
  trackNumber?: number
  discNumber?: number
  genre?: string
  year?: number
  /** Date brute des tags (ex. 20240308, 2024-03-08) */
  date?: string
  comment?: string
}

export interface FolderNaming {
  artist: string
  album?: string
  filename: string
}

export interface MetadataLayers {
  original: TrackMetadata
  library: TrackMetadata
  file: TrackMetadata
  folder: FolderNaming
}

export interface FileInfo {
  path: string
  size: number
  codec: string
  bitrate?: number
  duration?: number
  format: string
}

export interface SourceInfo {
  url: string
  platform?: string
  downloadedAt: string
  profileId?: string
}

export interface Track {
  id: string
  artistId: string
  albumId?: string
  playlistIds: string[]
  file: FileInfo
  metadata: MetadataLayers
  source?: SourceInfo
  trackNumber?: number
  discNumber?: number
  missing?: boolean
  createdAt: string
  updatedAt: string
}

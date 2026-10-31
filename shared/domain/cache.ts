export interface CacheLocation {
  albumId?: string
  playlistIds: string[]
}

export interface CacheEntry {
  fingerprint: string
  trackId: string
  sourceUrl?: string
  fileHash?: string
  locations: CacheLocation
  createdAt: string
}

export interface CacheData {
  entries: CacheEntry[]
}

export interface CacheConflict {
  fingerprint: string
  trackId: string
  albumTitle?: string
  playlistNames: string[]
}

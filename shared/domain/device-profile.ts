import type { CachePolicy } from '../constants/defaults'

export type FeatStrategy = 'metadata_only' | 'title_and_metadata' | 'title_only'
export type TitleNumberingStrategy = 'disabled' | 'prefix' | 'suffix'
export type FolderStrategy = 'artist_album' | 'artist_singles' | 'playlist'

export interface DeviceCapabilities {
  supportedFormats: string[]
  supportedCodecs: string[]
  preferredFormats: string[]
  preferredCodec: string
  maxBitrate?: number
}

export interface OrganizationConfig {
  albumPattern: string
  singlePattern: string
  playlistPattern: string
}

export interface MetadataRules {
  featStrategy: FeatStrategy
  titleNumbering: TitleNumberingStrategy
  numberingPrefix: string
  folderStrategy: FolderStrategy
}

export interface DownloadDefaults {
  format: string
  quality: string
  embedCover: boolean
  writeMetadata: boolean
}

export interface DeviceProfile {
  id: string
  name: string
  readOnly: boolean
  deviceType: string
  storagePath: string
  capabilities: DeviceCapabilities
  organization: OrganizationConfig
  metadataRules: MetadataRules
  downloadDefaults: DownloadDefaults
  createdAt: string
  updatedAt: string
}

export interface ProfilesData {
  activeProfileId: string
  profiles: DeviceProfile[]
}

import { DEFAULT_PROFILE_ID } from '#shared/constants/defaults'
import type { DeviceProfile, ProfilesData } from '#shared/domain/device-profile'
import { getMusicLibraryPath } from '../paths/data-dir'

export function createDefaultProfile(): DeviceProfile {
  const now = new Date().toISOString()
  const storagePath = getMusicLibraryPath()
  return {
    id: DEFAULT_PROFILE_ID,
    name: 'Default',
    readOnly: true,
    deviceType: 'desktop',
    storagePath,
    capabilities: {
      supportedFormats: ['mp3', 'flac', 'm4a', 'opus', 'ogg', 'wav', 'ape'],
      supportedCodecs: ['mp3', 'flac', 'aac', 'opus', 'vorbis', 'pcm', 'ape'],
      preferredFormats: ['flac', 'mp3'],
      preferredCodec: 'flac'
    },
    organization: {
      albumPattern: '{artist}/{album}',
      singlePattern: '{artist}/singles',
      playlistPattern: '{playlist}'
    },
    metadataRules: {
      featStrategy: 'metadata_only',
      titleNumbering: 'disabled',
      numberingPrefix: '',
      folderStrategy: 'artist_album'
    },
    downloadDefaults: {
      format: 'm4a',
      quality: 'best',
      embedCover: true,
      writeMetadata: true
    },
    createdAt: now,
    updatedAt: now
  }
}

export function createDefaultProfiles(): ProfilesData {
  return {
    activeProfileId: DEFAULT_PROFILE_ID,
    profiles: [createDefaultProfile()]
  }
}

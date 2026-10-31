import { join } from 'node:path'
import { mkdir, rename } from 'node:fs/promises'
import { existsSync, statfsSync } from 'node:fs'
import type { DestinationContext } from '#shared/domain/download'
import type { MetadataLayers } from '#shared/domain/track'
import { libraryService } from '../library/library.service'
import { playlistService } from '../playlist/playlist.service'

export class FilesystemService {
  resolveTrackPath(
    libraryPath: string,
    layers: MetadataLayers,
    context: DestinationContext
  ): string {
    const base = libraryPath
    const artist = layers.folder.artist
    const filename = layers.folder.filename

    if (context.type === 'playlist' && context.playlistId) {
      return join(base, layers.folder.album || 'Playlists', filename)
    }

    if (context.type === 'singles' || !layers.folder.album) {
      return join(base, artist, 'singles', filename)
    }

    return join(base, artist, layers.folder.album!, filename)
  }

  async ensureParentDir(filePath: string): Promise<void> {
    const parent = join(filePath, '..')
    if (!existsSync(parent)) {
      await mkdir(parent, { recursive: true })
    }
  }

  async moveAtomic(from: string, to: string): Promise<void> {
    await this.ensureParentDir(to)
    await rename(from, to)
  }

  async getDiskSpace(path: string): Promise<{ free: number, total: number }> {
    try {
      const stats = statfsSync(path)
      return {
        free: stats.bfree * stats.bsize,
        total: stats.blocks * stats.bsize
      }
    } catch {
      return { free: 0, total: 0 }
    }
  }

  async resolveContextLabel(context: DestinationContext): Promise<string> {
    if (context.type === 'root') return 'Bibliothèque'
    if (context.type === 'singles') return 'Singles'
    if (context.type === 'artist' && context.artistId) {
      const artist = await libraryService.getArtist(context.artistId)
      return artist.name
    }
    if (context.type === 'album' && context.albumId) {
      const album = await libraryService.getAlbum(context.albumId)
      return album.title
    }
    if (context.type === 'playlist' && context.playlistId) {
      const playlist = await playlistService.getById(context.playlistId)
      return playlist.name
    }
    return 'Bibliothèque'
  }
}

export const filesystemService = new FilesystemService()

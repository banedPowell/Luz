import { writeFile, mkdir } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { getAppConfigDir } from '../../infrastructure/paths/data-dir'
import { libraryService } from '../library/library.service'

function artworkDir(type: 'album' | 'artist'): string {
  return join(getAppConfigDir(), 'artwork', type)
}

export class ArtworkService {
  async extractFromAudio(filePath: string): Promise<Buffer | null> {
    try {
      const { parseFile } = await import('music-metadata')
      const m = await parseFile(filePath)
      const pic = m.common.picture?.[0]
      if (!pic?.data) return null
      return Buffer.from(pic.data)
    } catch {
      return null
    }
  }

  async saveArtwork(type: 'album' | 'artist', entityId: string, buffer: Buffer): Promise<string> {
    const dir = artworkDir(type)
    await mkdir(dir, { recursive: true })
    const filePath = join(dir, `${entityId}.jpg`)
    await writeFile(filePath, buffer)
    return filePath
  }

  getArtworkPath(type: 'album' | 'artist', entityId: string): string {
    return join(artworkDir(type), `${entityId}.jpg`)
  }

  async extractAndSaveForAlbum(albumId: string, filePath: string): Promise<void> {
    const album = libraryService.getAlbum(albumId)
    if (album.artworkPath) return
    const buf = await this.extractFromAudio(filePath)
    if (!buf) return
    const saved = await this.saveArtwork('album', albumId, buf)
    libraryService.updateAlbum(albumId, { artworkPath: saved })
  }

  async extractAndSaveForArtist(artistId: string, filePath: string): Promise<void> {
    const artist = libraryService.getArtist(artistId)
    if (artist.imagePath) return
    const buf = await this.extractFromAudio(filePath)
    if (!buf) return
    const saved = await this.saveArtwork('artist', artistId, buf)
    libraryService.updateArtist(artistId, { imagePath: saved })
  }
}

export const artworkService = new ArtworkService()

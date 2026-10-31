import { eq } from 'drizzle-orm'
import { libraryService } from '../library/library.service'
import { getDb } from '../../infrastructure/db/client'
import * as schema from '../../infrastructure/db/schema'
import type { Playlist } from '#shared/domain/playlist'
import { nanoid } from 'nanoid'

export class PlaylistService {
  async getAll(): Promise<Playlist[]> {
    return libraryService.getPlaylists()
  }

  async getById(playlistId: string): Promise<Playlist> {
    return libraryService.getPlaylist(playlistId)
  }

  async create(name: string, description?: string): Promise<Playlist> {
    const now = new Date().toISOString()
    const playlist: Playlist = {
      id: nanoid(),
      name,
      description,
      trackIds: [],
      type: 'user',
      createdAt: now,
      updatedAt: now
    }
    return libraryService.savePlaylist(playlist)
  }

  async update(playlistId: string, partial: Partial<Pick<Playlist, 'name' | 'description' | 'trackIds'>>): Promise<Playlist> {
    const playlist = libraryService.getPlaylist(playlistId)
    const updated = { ...playlist, ...partial, updatedAt: new Date().toISOString() }
    if (partial.trackIds) {
      const db = getDb()
      db.delete(schema.playlistTracks).where(eq(schema.playlistTracks.playlistId, playlistId)).run()
      partial.trackIds.forEach((trackId, position) => {
        db.insert(schema.playlistTracks).values({ playlistId, trackId, position }).run()
      })
    }
    return libraryService.savePlaylist(updated)
  }

  async delete(playlistId: string): Promise<void> {
    libraryService.deletePlaylist(playlistId)
  }

  async reorder(playlistId: string, trackIds: string[]): Promise<Playlist> {
    await this.update(playlistId, { trackIds })
    await libraryService.renumberPlaylistTracks(playlistId)
    return libraryService.getPlaylist(playlistId)
  }

  async duplicate(playlistId: string): Promise<Playlist> {
    const source = await this.getById(playlistId)
    const copy = await this.create(`${source.name} (copie)`, source.description)
    return this.update(copy.id, { trackIds: [...source.trackIds] })
  }

  async merge(playlistId: string, otherId: string): Promise<Playlist> {
    const [a, b] = await Promise.all([this.getById(playlistId), this.getById(otherId)])
    const merged = [...new Set([...a.trackIds, ...b.trackIds])]
    return this.update(playlistId, { trackIds: merged })
  }

  async replace(playlistId: string, trackIds: string[]): Promise<Playlist> {
    return this.update(playlistId, { trackIds })
  }
}

export const playlistService = new PlaylistService()

import { eq } from 'drizzle-orm'
import { getDb } from '../../infrastructure/db/client'
import * as schema from '../../infrastructure/db/schema'
import type { CacheEntry, CacheConflict } from '#shared/domain/cache'
import type { TrackMetadata } from '#shared/domain/track'
import { libraryService } from '../library/library.service'
import { createHash } from 'node:crypto'

function fingerprint(artist: string, title: string, url?: string): string {
  const base = `${artist.toLowerCase().trim()}|${title.toLowerCase().trim()}|${url || ''}`
  return createHash('sha256').update(base).digest('hex').slice(0, 16)
}

export class CacheService {
  private getEntries(): CacheEntry[] {
    return getDb().select().from(schema.cacheEntries).all().map(r => r.data)
  }

  async check(tracks: { metadata: { library: TrackMetadata }, sourceUrl?: string }[]): Promise<CacheConflict[]> {
    const entries = this.getEntries()
    const albums = libraryService.getAlbums()
    const playlists = libraryService.getPlaylists()
    const conflicts: CacheConflict[] = []

    for (const track of tracks) {
      const fp = fingerprint(track.metadata.library.artist, track.metadata.library.title, track.sourceUrl)
      const entry = entries.find(e => e.fingerprint === fp)
      if (!entry) continue

      const album = entry.locations.albumId
        ? albums.find(a => a.id === entry.locations.albumId)
        : undefined
      const playlistNames = entry.locations.playlistIds
        .map(id => playlists.find(p => p.id === id)?.name)
        .filter((n): n is string => !!n)

      conflicts.push({
        fingerprint: fp,
        trackId: entry.trackId,
        albumTitle: album?.title,
        playlistNames
      })
    }
    return conflicts
  }

  async register(entry: Omit<CacheEntry, 'createdAt'>): Promise<void> {
    const db = getDb()
    const full: CacheEntry = { ...entry, createdAt: new Date().toISOString() }
    const existing = db.select().from(schema.cacheEntries)
      .where(eq(schema.cacheEntries.fingerprint, entry.fingerprint)).get()
    if (existing) {
      db.update(schema.cacheEntries).set({ data: full })
        .where(eq(schema.cacheEntries.fingerprint, entry.fingerprint)).run()
    } else {
      db.insert(schema.cacheEntries).values({ fingerprint: entry.fingerprint, data: full }).run()
    }
  }

  async rebuild(): Promise<number> {
    const db = getDb()
    db.delete(schema.cacheEntries).run()
    const tracks = libraryService.getTracks()
    for (const t of tracks) {
      const entry: CacheEntry = {
        fingerprint: fingerprint(t.metadata.library.artist, t.metadata.library.title, t.source?.url),
        trackId: t.id,
        sourceUrl: t.source?.url,
        locations: { albumId: t.albumId, playlistIds: t.playlistIds },
        createdAt: new Date().toISOString()
      }
      db.insert(schema.cacheEntries).values({ fingerprint: entry.fingerprint, data: entry }).run()
    }
    return tracks.length
  }

  async clear(): Promise<void> {
    getDb().delete(schema.cacheEntries).run()
  }

  getCount(): number {
    return getDb().select().from(schema.cacheEntries).all().length
  }

  computeFingerprint(artist: string, title: string, url?: string): string {
    return fingerprint(artist, title, url)
  }
}

export const cacheService = new CacheService()

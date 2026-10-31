import { eq, and } from 'drizzle-orm'
import { unlink } from 'node:fs/promises'
import { copyFileSync, existsSync, mkdirSync, renameSync } from 'node:fs'
import { basename, dirname } from 'node:path'
import { nanoid } from 'nanoid'
import { getDb } from '../../infrastructure/db/client'
import * as schema from '../../infrastructure/db/schema'
import type { Artist } from '#shared/domain/artist'
import type { Album } from '#shared/domain/album'
import type { Track } from '#shared/domain/track'
import type { Playlist } from '#shared/domain/playlist'
import type { RenumberResult } from '#shared/domain/repair'
import type { DestinationContext } from '#shared/domain/download'
import { parseMetadataDate, pickReleaseDate, formatReleaseDate } from '#shared/utils/release-date'
import { formatTrackLabel } from '#shared/utils/track-display'
import { ensureUniqueFilePath, normalizePathKey } from '#shared/utils/download-destination'
import { metadataService } from '../metadata/metadata.service'

function sortName(name: string): string {
  return name.toLowerCase().replace(/^the\s+/i, '')
}

export class LibraryService {
  getArtists(): Artist[] {
    const rows = getDb().select().from(schema.artists).all()
    return rows.map(r => r.data).sort((a, b) => a.sortName.localeCompare(b.sortName))
  }

  getArtist(artistId: string): Artist {
    const row = getDb().select().from(schema.artists).where(eq(schema.artists.id, artistId)).get()
    if (!row) throw createError({ statusCode: 404, message: 'Artist not found' })
    return row.data
  }

  getAlbums(): Album[] {
    return getDb().select().from(schema.albums).all().map(r => r.data)
      .sort((a, b) => a.title.localeCompare(b.title))
  }

  getAlbum(albumId: string): Album {
    const row = getDb().select().from(schema.albums).where(eq(schema.albums.id, albumId)).get()
    if (!row) throw createError({ statusCode: 404, message: 'Album not found' })
    return row.data
  }

  getTracks(): Track[] {
    return getDb().select().from(schema.tracks).all().map(r => r.data)
  }

  getTracksSharingPath(filePath: string, exceptTrackId?: string): Track[] {
    if (!filePath) return []
    const key = normalizePathKey(filePath)
    return this.getTracks().filter(t =>
      t.id !== exceptTrackId
      && t.file.path
      && normalizePathKey(t.file.path) === key
    )
  }

  resolveUniqueTrackPath(desiredPath: string, trackId?: string): string {
    const occupied = new Set(
      this.getTracks()
        .filter(t => t.id !== trackId && t.file.path)
        .map(t => t.file.path)
    )
    return ensureUniqueFilePath(desiredPath, occupied)
  }

  private ensureTrackPathUnique(track: Track): void {
    if (!track.file.path) return
    const occupied = new Set(
      this.getTracks()
        .filter(t => t.id !== track.id && t.file.path)
        .map(t => t.file.path)
    )
    const unique = ensureUniqueFilePath(track.file.path, occupied)
    if (unique === track.file.path) return

    if (existsSync(track.file.path)) {
      mkdirSync(dirname(unique), { recursive: true })
      try {
        renameSync(track.file.path, unique)
      } catch {
        copyFileSync(track.file.path, unique)
      }
    }
    track.file.path = unique
    track.metadata.folder = {
      ...track.metadata.folder,
      filename: basename(unique)
    }
  }

  getTrack(trackId: string): Track {
    const row = getDb().select().from(schema.tracks).where(eq(schema.tracks.id, trackId)).get()
    if (!row) throw createError({ statusCode: 404, message: 'Track not found' })
    return row.data
  }

  getRecent(limit = 8) {
    const byUpdated = <T extends { updatedAt: string }>(items: T[]) =>
      [...items].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, limit)
    return {
      artists: byUpdated(this.getArtists()),
      albums: byUpdated(this.getAlbums()),
      playlists: byUpdated(getDb().select().from(schema.playlists).all().map(r => r.data)),
      tracks: byUpdated(this.getTracks())
    }
  }

  createArtist(name: string): Artist {
    const now = new Date().toISOString()
    const artist: Artist = {
      id: nanoid(), name, sortName: sortName(name),
      albumIds: [], trackIds: [], createdAt: now, updatedAt: now
    }
    getDb().insert(schema.artists).values({ id: artist.id, data: artist, updatedAt: now }).run()
    return artist
  }

  createAlbum(data: Omit<Album, 'id' | 'createdAt' | 'updatedAt' | 'trackIds'>): Album {
    const now = new Date().toISOString()
    const album: Album = { ...data, id: nanoid(), trackIds: [], createdAt: now, updatedAt: now }
    getDb().insert(schema.albums).values({
      id: album.id, data: album, artistId: album.artistId, updatedAt: now
    }).run()
    this.addAlbumToArtist(album.artistId, album.id)
    return album
  }

  private addAlbumToArtist(artistId: string, albumId: string) {
    const artist = this.getArtist(artistId)
    if (!artist.albumIds.includes(albumId)) {
      artist.albumIds.push(albumId)
      artist.updatedAt = new Date().toISOString()
      getDb().update(schema.artists).set({ data: artist, updatedAt: artist.updatedAt })
        .where(eq(schema.artists.id, artistId)).run()
    }
  }

  indexTrack(track: Track, context?: DestinationContext): Track {
    const db = getDb()
    const now = new Date().toISOString()
    track.updatedAt = now

    this.ensureTrackPathUnique(track)

    const existing = db.select().from(schema.tracks).where(eq(schema.tracks.id, track.id)).get()
    if (existing) {
      db.update(schema.tracks).set({
        data: track, artistId: track.artistId, albumId: track.albumId ?? null, updatedAt: now
      }).where(eq(schema.tracks.id, track.id)).run()
    } else {
      db.insert(schema.tracks).values({
        id: track.id, data: track, artistId: track.artistId, albumId: track.albumId ?? null, updatedAt: now
      }).run()
    }

    const artist = this.getArtist(track.artistId)
    if (!artist.trackIds.includes(track.id)) {
      artist.trackIds.push(track.id)
      artist.updatedAt = now
      db.update(schema.artists).set({ data: artist, updatedAt: now }).where(eq(schema.artists.id, artist.id)).run()
    }

    if (track.albumId) {
      const album = this.getAlbum(track.albumId)
      if (!album.trackIds.includes(track.id)) {
        album.trackIds.push(track.id)
        album.updatedAt = now
        db.update(schema.albums).set({ data: album, updatedAt: now }).where(eq(schema.albums.id, album.id)).run()
      }
    }

    if (context?.playlistId) {
      const playlistRows = db.select().from(schema.playlistTracks)
        .where(eq(schema.playlistTracks.playlistId, context.playlistId)).all()
      const maxPos = playlistRows.reduce((m, r) => Math.max(m, r.position), -1)
      if (!playlistRows.find(r => r.trackId === track.id)) {
        db.insert(schema.playlistTracks).values({
          playlistId: context.playlistId, trackId: track.id, position: maxPos + 1
        }).run()
      }
      const pl = db.select().from(schema.playlists).where(eq(schema.playlists.id, context.playlistId)).get()
      if (pl) {
        const pdata = pl.data
        if (!pdata.trackIds.includes(track.id)) {
          pdata.trackIds.push(track.id)
          pdata.updatedAt = now
          db.update(schema.playlists).set({ data: pdata, updatedAt: now }).where(eq(schema.playlists.id, context.playlistId)).run()
        }
      }
      if (!track.playlistIds.includes(context.playlistId)) {
        track.playlistIds.push(context.playlistId)
        db.update(schema.tracks).set({ data: track }).where(eq(schema.tracks.id, track.id)).run()
      }
    }

    return track
  }

  updateTrack(trackId: string, partial: Partial<Track>): Track {
    const track = this.getTrack(trackId)
    const updated = { ...track, ...partial, id: trackId, updatedAt: new Date().toISOString() }
    getDb().update(schema.tracks).set({
      data: updated, artistId: updated.artistId, albumId: updated.albumId ?? null, updatedAt: updated.updatedAt
    }).where(eq(schema.tracks.id, trackId)).run()
    return updated
  }

  async renumberAlbumTracks(albumId: string): Promise<RenumberResult> {
    const album = this.getAlbum(albumId)
    const errors: string[] = []
    let updated = 0
    for (let i = 0; i < album.trackIds.length; i++) {
      const track = this.getTrack(album.trackIds[i])
      const result = await this.applyTrackNumberToTrack(track, i + 1)
      if (result.updated) updated++
      if (result.error) errors.push(result.error)
    }
    return { updated, errors }
  }

  async renumberPlaylistTracks(playlistId: string): Promise<RenumberResult> {
    const playlist = this.getPlaylist(playlistId)
    const errors: string[] = []
    let updated = 0
    for (let i = 0; i < playlist.trackIds.length; i++) {
      let track: Track
      try {
        track = this.getTrack(playlist.trackIds[i])
      } catch {
        continue
      }
      const result = await this.applyTrackNumberToTrack(track, i + 1)
      if (result.updated) updated++
      if (result.error) errors.push(result.error)
    }
    return { updated, errors }
  }

  /** Synchronise l'index Luz depuis le tag N° lu sur disque (ou purge le cache fantôme). */
  async syncTrackNumberFromFile(track: Track): Promise<boolean> {
    if (!track.file.path) return false
    if (this.getTracksSharingPath(track.file.path, track.id).length > 0) return false

    const fromDisk = await metadataService.readTrackNumberFromFile(track.file.path)

    if (fromDisk != null) {
      if (
        track.metadata.file.trackNumber === fromDisk
        && track.metadata.library.trackNumber === fromDisk
        && track.metadata.original.trackNumber === fromDisk
      ) return false
      this.applyTrackNumberLayers(track, fromDisk)
      this.updateTrack(track.id, { metadata: track.metadata })
      return true
    }

    const hadCached = track.metadata.file.trackNumber != null
      || track.metadata.library.trackNumber != null
      || track.metadata.original.trackNumber != null
    if (!hadCached) return false

    this.clearTrackNumberLayers(track)
    this.updateTrack(track.id, { metadata: track.metadata })
    return true
  }

  async syncTrackNumbersFromFiles(trackIds: string[]): Promise<number> {
    let count = 0
    for (const id of trackIds) {
      try {
        if (await this.syncTrackNumberFromFile(this.getTrack(id))) count++
      } catch { /* ignore */ }
    }
    return count
  }

  private clearTrackNumberLayers(track: Track): void {
    for (const layer of ['original', 'file', 'library'] as const) {
      const meta = { ...track.metadata[layer] }
      delete meta.trackNumber
      track.metadata[layer] = meta
    }
  }

  private applyTrackNumberLayers(track: Track, trackNumber: number): void {
    track.metadata.original = { ...track.metadata.original, trackNumber }
    track.metadata.file = { ...track.metadata.file, trackNumber }
    track.metadata.library = { ...track.metadata.library, trackNumber }
  }

  /** Écrit le tag fichier (N° Windows) et synchronise l'index uniquement si vérifié sur disque. */
  private async applyTrackNumberToTrack(
    track: Track,
    trackNumber: number
  ): Promise<{ updated: boolean, error?: string }> {
    if (!track.file.path) return { updated: false }

    const label = formatTrackLabel(track)
    const sharers = this.getTracksSharingPath(track.file.path, track.id)
    if (sharers.length > 0) {
      const other = formatTrackLabel(sharers[0])
      return {
        updated: false,
        error: `« ${label} » : chemin partagé avec un autre morceau (« ${other} »)`
      }
    }

    try {
      const current = await metadataService.readTrackNumberFromFile(track.file.path)
      if (current === trackNumber) {
        if (track.metadata.file.trackNumber !== trackNumber) {
          this.applyTrackNumberLayers(track, trackNumber)
          this.updateTrack(track.id, { metadata: track.metadata })
        }
        return { updated: false }
      }

      await metadataService.writeTrackNumberToFile(track.file.path, trackNumber)
      const verified = await metadataService.readTrackNumberFromFile(track.file.path)
      if (verified !== trackNumber) {
        return {
          updated: false,
          error: `« ${label} » : N° non vérifié sur disque (attendu ${trackNumber}, lu ${verified ?? 'aucun'})`
        }
      }

      this.applyTrackNumberLayers(track, verified)
      this.updateTrack(track.id, { metadata: track.metadata })
      return { updated: true }
    } catch (e) {
      return {
        updated: false,
        error: `« ${label} » : ${e instanceof Error ? e.message : 'échec écriture N°'}`
      }
    }
  }

  async reorderTracks(albumId: string, trackIds: string[]): Promise<Album> {
    const album = this.getAlbum(albumId)
    album.trackIds = trackIds
    album.updatedAt = new Date().toISOString()
    getDb().update(schema.albums).set({ data: album, updatedAt: album.updatedAt })
      .where(eq(schema.albums.id, albumId)).run()

    await this.renumberAlbumTracks(albumId)
    return this.getAlbum(albumId)
  }

  resetLibrary(): void {
    const db = getDb()
    db.delete(schema.playlistTracks).run()
    db.delete(schema.tracks).run()
    db.delete(schema.albums).run()
    db.delete(schema.artists).run()
    db.delete(schema.playlists).run()
  }

  getStats() {
    const tracks = this.getTracks()
    return {
      artists: getDb().select().from(schema.artists).all().length,
      albums: getDb().select().from(schema.albums).all().length,
      tracks: tracks.length,
      playlists: getDb().select().from(schema.playlists).all().length,
      sizeOnDisk: tracks.reduce((sum, t) => sum + (t.file?.size || 0), 0)
    }
  }

  resolveOrCreateArtist(name: string, artistId?: string): Artist {
    if (artistId) return this.getArtist(artistId)
    const existing = this.getArtists().find(a => a.name === name)
    return existing || this.createArtist(name)
  }

  resolveOrCreateAlbum(
    title: string,
    artistId: string,
    type: Album['type'] = 'album',
    albumId?: string
  ): Album | undefined {
    if (!title) return undefined
    if (albumId) return this.getAlbum(albumId)
    const existing = this.getAlbums().find(a => a.title === title && a.artistId === artistId)
    if (existing) return existing
    return this.createAlbum({ artistId, title, type })
  }

  getPlaylists(): Playlist[] {
    return getDb().select().from(schema.playlists).all().map(r => r.data)
      .sort((a, b) => a.name.localeCompare(b.name))
  }

  getPlaylist(playlistId: string): Playlist {
    const row = getDb().select().from(schema.playlists).where(eq(schema.playlists.id, playlistId)).get()
    if (!row) throw createError({ statusCode: 404, message: 'Playlist not found' })

    const playlist: Playlist = { ...row.data }
    const ordered = getDb().select().from(schema.playlistTracks)
      .where(eq(schema.playlistTracks.playlistId, playlistId))
      .all()
      .sort((a, b) => a.position - b.position)

    if (ordered.length > 0) {
      const trackIds = ordered.map(r => r.trackId)
      const changed = trackIds.length !== playlist.trackIds.length
        || trackIds.some((id, i) => playlist.trackIds[i] !== id)
      playlist.trackIds = trackIds
      if (changed) {
        playlist.updatedAt = new Date().toISOString()
        getDb().update(schema.playlists).set({ data: playlist, updatedAt: playlist.updatedAt })
          .where(eq(schema.playlists.id, playlistId)).run()
      }
    }

    return playlist
  }

  savePlaylist(playlist: Playlist): Playlist {
    const now = new Date().toISOString()
    playlist.updatedAt = now
    const db = getDb()
    const existing = db.select().from(schema.playlists).where(eq(schema.playlists.id, playlist.id)).get()
    if (existing) {
      db.update(schema.playlists).set({ data: playlist, updatedAt: now })
        .where(eq(schema.playlists.id, playlist.id)).run()
    } else {
      db.insert(schema.playlists).values({ id: playlist.id, data: playlist, updatedAt: now }).run()
    }
    return playlist
  }

  deletePlaylist(playlistId: string): void {
    const db = getDb()
    db.delete(schema.playlistTracks).where(eq(schema.playlistTracks.playlistId, playlistId)).run()
    db.delete(schema.playlists).where(eq(schema.playlists.id, playlistId)).run()
  }

  updateArtist(artistId: string, partial: Partial<Pick<Artist, 'name' | 'imagePath'>>): Artist {
    const artist = this.getArtist(artistId)
    const updated: Artist = {
      ...artist,
      ...partial,
      sortName: partial.name ? sortName(partial.name) : artist.sortName,
      updatedAt: new Date().toISOString()
    }
    getDb().update(schema.artists).set({ data: updated, updatedAt: updated.updatedAt })
      .where(eq(schema.artists.id, artistId)).run()
    return updated
  }

  updateAlbum(albumId: string, partial: Partial<Pick<Album, 'title' | 'type' | 'year' | 'genre' | 'artworkPath'>>): Album {
    const album = this.getAlbum(albumId)
    const updated = { ...album, ...partial, updatedAt: new Date().toISOString() }
    getDb().update(schema.albums).set({ data: updated, updatedAt: updated.updatedAt })
      .where(eq(schema.albums.id, albumId)).run()
    return updated
  }

  private async deleteFileIfExists(path: string): Promise<void> {
    if (path && existsSync(path)) await unlink(path).catch(() => {})
  }

  private removeTrackFromIndex(trackId: string): void {
    const db = getDb()
    const track = this.getTrack(trackId)

    const artist = this.getArtist(track.artistId)
    artist.trackIds = artist.trackIds.filter(id => id !== trackId)
    artist.updatedAt = new Date().toISOString()
    db.update(schema.artists).set({ data: artist, updatedAt: artist.updatedAt })
      .where(eq(schema.artists.id, artist.id)).run()

    if (track.albumId) {
      const album = this.getAlbum(track.albumId)
      album.trackIds = album.trackIds.filter(id => id !== trackId)
      album.updatedAt = new Date().toISOString()
      db.update(schema.albums).set({ data: album, updatedAt: album.updatedAt })
        .where(eq(schema.albums.id, album.id)).run()
    }

    for (const plId of track.playlistIds) {
      db.delete(schema.playlistTracks)
        .where(and(
          eq(schema.playlistTracks.playlistId, plId),
          eq(schema.playlistTracks.trackId, trackId)
        )).run()
      try {
        const pl = this.getPlaylist(plId)
        pl.trackIds = pl.trackIds.filter(id => id !== trackId)
        this.savePlaylist(pl)
      } catch { /* ignore */ }
    }

    db.delete(schema.tracks).where(eq(schema.tracks.id, trackId)).run()
  }

  async deleteTrack(trackId: string, deleteFile = true): Promise<void> {
    const track = this.getTrack(trackId)
    const albumId = track.albumId
    if (deleteFile) await this.deleteFileIfExists(track.file.path)
    this.removeTrackFromIndex(trackId)
    if (albumId) await this.renumberAlbumTracks(albumId)
  }

  async bulkDeleteTracks(ids: string[]): Promise<number> {
    const albumIds = new Set<string>()
    for (const id of ids) {
      try {
        const t = this.getTrack(id)
        if (t.albumId) albumIds.add(t.albumId)
      } catch { /* ignore */ }
    }
    for (const id of ids) {
      try {
        const track = this.getTrack(id)
        await this.deleteFileIfExists(track.file.path)
        this.removeTrackFromIndex(id)
      } catch { /* ignore */ }
    }
    for (const albumId of albumIds) {
      await this.renumberAlbumTracks(albumId)
    }
    return ids.length
  }

  async deleteAlbum(albumId: string): Promise<void> {
    const album = this.getAlbum(albumId)
    for (const trackId of [...album.trackIds]) {
      await this.deleteTrack(trackId, true)
    }
    const artist = this.getArtist(album.artistId)
    artist.albumIds = artist.albumIds.filter(id => id !== albumId)
    getDb().update(schema.artists).set({ data: artist, updatedAt: new Date().toISOString() })
      .where(eq(schema.artists.id, artist.id)).run()
    if (album.artworkPath) await this.deleteFileIfExists(album.artworkPath)
    getDb().delete(schema.albums).where(eq(schema.albums.id, albumId)).run()
  }

  async bulkDeleteAlbums(ids: string[]): Promise<number> {
    for (const id of ids) await this.deleteAlbum(id)
    return ids.length
  }

  async deleteArtist(artistId: string): Promise<void> {
    const artist = this.getArtist(artistId)
    for (const albumId of [...artist.albumIds]) {
      await this.deleteAlbum(albumId)
    }
    for (const trackId of [...artist.trackIds]) {
      await this.deleteTrack(trackId, true)
    }
    if (artist.imagePath) await this.deleteFileIfExists(artist.imagePath)
    getDb().delete(schema.artists).where(eq(schema.artists.id, artistId)).run()
  }

  async bulkDeleteArtists(ids: string[]): Promise<number> {
    for (const id of ids) await this.deleteArtist(id)
    return ids.length
  }

  /** Date de sortie la plus précise disponible (métadonnées indexées ou lecture fichier). */
  async resolveAlbumReleaseDate(albumId: string): Promise<string | undefined> {
    const album = this.getAlbum(albumId)
    const candidates = []

    for (const trackId of album.trackIds) {
      let track: Track
      try {
        track = this.getTrack(trackId)
      } catch {
        continue
      }
      for (const layer of [track.metadata.original, track.metadata.file, track.metadata.library]) {
        candidates.push(parseMetadataDate(layer.date))
        if (layer.year) candidates.push(parseMetadataDate(layer.year))
      }
    }

    let picked = pickReleaseDate(candidates)
    if (picked && picked.precision !== 'year') {
      return formatReleaseDate(picked)
    }

    for (const trackId of album.trackIds) {
      let track: Track
      try {
        track = this.getTrack(trackId)
      } catch {
        continue
      }
      if (track.missing) continue
      try {
        const tags = await metadataService.readTags(track.file.path)
        if (!tags) continue
        const fromFile = pickReleaseDate([
          parseMetadataDate(tags.date),
          parseMetadataDate(tags.year)
        ])
        if (fromFile && fromFile.precision !== 'year') {
          return formatReleaseDate(fromFile)
        }
        if (fromFile) picked = fromFile
      } catch { /* ignore */ }
    }

    return picked ? formatReleaseDate(picked) : undefined
  }
}

export const libraryService = new LibraryService()

/** @deprecated use libraryService */
export const libraryRepository = {
  getArtists: () => libraryService.getArtists(),
  getAlbums: () => libraryService.getAlbums(),
  getTracks: () => libraryService.getTracks(),
  getPlaylists: () => libraryService.getPlaylists(),
  savePlaylists: async (playlists: Playlist[]) => {
    for (const p of playlists) libraryService.savePlaylist(p)
  }
}

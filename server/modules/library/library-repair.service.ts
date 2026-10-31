import { eq } from 'drizzle-orm'
import { copyFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { basename, dirname, extname, join } from 'node:path'
import { getDb } from '../../infrastructure/db/client'
import * as schema from '../../infrastructure/db/schema'
import type { LibraryRepairReport } from '#shared/domain/repair'
import type { Track } from '#shared/domain/track'
import { buildTrackFilename, ensureUniqueFilePath, normalizePathKey } from '#shared/utils/download-destination'
import { formatTrackLabel } from '#shared/utils/track-display'
import { libraryService } from './library.service'

function trackIsAvailable(trackId: string): boolean {
  try {
    const track = libraryService.getTrack(trackId)
    if (track.missing) return false
    if (!track.file.path) return false
    return existsSync(track.file.path)
  } catch {
    return false
  }
}

async function resolveDuplicatePathsInPlaylist(
  playlistId: string
): Promise<{ pathsDeduplicated: number, errors: string[] }> {
  const playlist = libraryService.getPlaylist(playlistId)
  const errors: string[] = []
  let pathsDeduplicated = 0

  const orderedTracks: Track[] = []
  for (const id of playlist.trackIds) {
    try {
      orderedTracks.push(libraryService.getTrack(id))
    } catch { /* ignore */ }
  }

  const byPath = new Map<string, Track[]>()
  for (const track of orderedTracks) {
    if (!track.file.path) continue
    const key = normalizePathKey(track.file.path)
    const group = byPath.get(key) ?? []
    group.push(track)
    byPath.set(key, group)
  }

  for (const group of byPath.values()) {
    if (group.length <= 1) continue

    const [keep, ...rest] = group
    const sourcePath = keep.file.path
    const sourceExists = sourcePath && existsSync(sourcePath)

    for (const track of rest) {
      const label = formatTrackLabel(track)

      if (!sourceExists || !sourcePath) {
        libraryService.updateTrack(track.id, { missing: true })
        errors.push(`« ${label} » : fichier perdu (écrasé), re-téléchargement nécessaire`)
        continue
      }

      const dir = dirname(sourcePath)
      const ext = extname(sourcePath).slice(1) || track.file.format || 'm4a'
      const artist = track.metadata.file.artist || track.metadata.library.artist || 'Unknown Artist'
      const title = track.metadata.library.title || 'Unknown Title'
      const desiredPath = join(dir, buildTrackFilename(artist, title, ext))

      const occupied = new Set(
        libraryService.getTracks()
          .filter(t => t.id !== track.id && t.file.path)
          .map(t => t.file.path)
      )
      const uniquePath = ensureUniqueFilePath(desiredPath, occupied)

      try {
        await mkdir(dirname(uniquePath), { recursive: true })
        await copyFile(sourcePath, uniquePath)
      } catch (e) {
        errors.push(`« ${label} » : ${e instanceof Error ? e.message : 'copie fichier échouée'}`)
        continue
      }

      track.file.path = uniquePath
      track.missing = false
      track.metadata.folder = {
        ...track.metadata.folder,
        filename: basename(uniquePath)
      }
      libraryService.updateTrack(track.id, {
        file: track.file,
        missing: false,
        metadata: track.metadata
      })
      pathsDeduplicated++
    }
  }

  return { pathsDeduplicated, errors }
}

export class LibraryRepairService {
  async repairPlaylist(playlistId: string): Promise<LibraryRepairReport> {
    const report = emptyReport()
    const playlist = libraryService.getPlaylist(playlistId)
    const before = playlist.trackIds.length
    const validIds = playlist.trackIds.filter(id => trackIsAvailable(id))
    report.orphanedPlaylistRefsRemoved = before - validIds.length

    const db = getDb()
    db.delete(schema.playlistTracks).where(eq(schema.playlistTracks.playlistId, playlistId)).run()
    validIds.forEach((trackId, position) => {
      db.insert(schema.playlistTracks).values({ playlistId, trackId, position }).run()
    })
    libraryService.savePlaylist({
      ...playlist,
      trackIds: validIds,
      updatedAt: new Date().toISOString()
    })
    report.playlistsNormalized = 1

    for (const track of libraryService.getTracks()) {
      if (!track.playlistIds.includes(playlistId)) continue
      if (!validIds.includes(track.id)) {
        track.playlistIds = track.playlistIds.filter(id => id !== playlistId)
        libraryService.updateTrack(track.id, { playlistIds: track.playlistIds })
      }
    }

    const dedupe = await resolveDuplicatePathsInPlaylist(playlistId)
    report.pathsDeduplicated = dedupe.pathsDeduplicated
    report.errors.push(...dedupe.errors)

    await libraryService.syncTrackNumbersFromFiles(validIds)

    const renumber = await libraryService.renumberPlaylistTracks(playlistId)
    report.tracksRenumbered = renumber.updated
    report.errors.push(...renumber.errors)
    return report
  }

  async repairAlbum(albumId: string): Promise<LibraryRepairReport> {
    const report = emptyReport()
    const album = libraryService.getAlbum(albumId)

    for (const trackId of [...album.trackIds]) {
      if (trackIsAvailable(trackId)) continue
      try {
        await libraryService.deleteTrack(trackId, false)
        report.missingTracksRemoved++
      } catch { /* ignore */ }
    }

    const refreshed = libraryService.getAlbum(albumId)
    const before = refreshed.trackIds.length
    refreshed.trackIds = refreshed.trackIds.filter(id => trackIsAvailable(id))
    if (refreshed.trackIds.length !== before) {
      refreshed.updatedAt = new Date().toISOString()
      getDb().update(schema.albums).set({ data: refreshed, updatedAt: refreshed.updatedAt })
        .where(eq(schema.albums.id, albumId)).run()
      report.orphanedAlbumRefsRemoved = before - refreshed.trackIds.length
    }

    await libraryService.syncTrackNumbersFromFiles(refreshed.trackIds)

    const renumber = await libraryService.renumberAlbumTracks(albumId)
    report.tracksRenumbered = renumber.updated
    report.errors.push(...renumber.errors)
    report.albumsRenumbered = 1
    return report
  }

  async repairAll(): Promise<LibraryRepairReport> {
    const report = emptyReport()

    for (const track of [...libraryService.getTracks()]) {
      const fileMissing = !track.file.path || !existsSync(track.file.path)
      if (track.missing || fileMissing) {
        await libraryService.deleteTrack(track.id, false)
        report.missingTracksRemoved++
      }
    }

    for (const album of libraryService.getAlbums()) {
      const before = album.trackIds.length
      album.trackIds = album.trackIds.filter(id => trackIsAvailable(id))
      if (album.trackIds.length !== before) {
        album.updatedAt = new Date().toISOString()
        getDb().update(schema.albums).set({ data: album, updatedAt: album.updatedAt })
          .where(eq(schema.albums.id, album.id)).run()
        report.orphanedAlbumRefsRemoved += before - album.trackIds.length
      }
      await libraryService.syncTrackNumbersFromFiles(album.trackIds)
      const renumber = await libraryService.renumberAlbumTracks(album.id)
      report.tracksRenumbered += renumber.updated
      report.errors.push(...renumber.errors)
      report.albumsRenumbered++
    }

    for (const artist of libraryService.getArtists()) {
      const beforeTracks = artist.trackIds.length
      const beforeAlbums = artist.albumIds.length
      artist.trackIds = artist.trackIds.filter(id => trackIsAvailable(id))
      artist.albumIds = artist.albumIds.filter(id => {
        try {
          libraryService.getAlbum(id)
          return true
        } catch {
          return false
        }
      })
      if (artist.trackIds.length !== beforeTracks || artist.albumIds.length !== beforeAlbums) {
        artist.updatedAt = new Date().toISOString()
        getDb().update(schema.artists).set({ data: artist, updatedAt: artist.updatedAt })
          .where(eq(schema.artists.id, artist.id)).run()
      }
    }

    for (const playlist of libraryService.getPlaylists()) {
      const partial = await this.repairPlaylist(playlist.id)
      report.orphanedPlaylistRefsRemoved += partial.orphanedPlaylistRefsRemoved
      report.playlistsNormalized += partial.playlistsNormalized
      report.pathsDeduplicated += partial.pathsDeduplicated
      report.tracksRenumbered += partial.tracksRenumbered
      report.errors.push(...partial.errors)
    }

    return report
  }
}

function emptyReport(): LibraryRepairReport {
  return {
    missingTracksRemoved: 0,
    orphanedPlaylistRefsRemoved: 0,
    orphanedAlbumRefsRemoved: 0,
    albumsRenumbered: 0,
    playlistsNormalized: 0,
    tracksRenumbered: 0,
    pathsDeduplicated: 0,
    errors: []
  }
}

export const libraryRepairService = new LibraryRepairService()

export function formatRepairReport(report: LibraryRepairReport): string {
  const parts: string[] = []
  if (report.missingTracksRemoved) parts.push(`${report.missingTracksRemoved} morceau(x) manquant(s) retiré(s)`)
  if (report.orphanedPlaylistRefsRemoved) parts.push(`${report.orphanedPlaylistRefsRemoved} référence(s) playlist nettoyée(s)`)
  if (report.orphanedAlbumRefsRemoved) parts.push(`${report.orphanedAlbumRefsRemoved} référence(s) album nettoyée(s)`)
  if (report.pathsDeduplicated) parts.push(`${report.pathsDeduplicated} fichier(s) séparé(s) (homonymes)`)
  if (report.albumsRenumbered) parts.push(`${report.albumsRenumbered} album(s) renuméroté(s)`)
  if (report.playlistsNormalized) parts.push(`${report.playlistsNormalized} playlist(s) normalisée(s)`)
  if (report.tracksRenumbered) parts.push(`${report.tracksRenumbered} N° fichier mis à jour`)
  if (report.errors.length) {
    const preview = report.errors.slice(0, 2).join(' · ')
    const more = report.errors.length > 2 ? ` (+${report.errors.length - 2})` : ''
    parts.push(`${report.errors.length} échec(s) : ${preview}${more}`)
  }
  return parts.length ? parts.join(' · ') : 'Aucune correction nécessaire'
}

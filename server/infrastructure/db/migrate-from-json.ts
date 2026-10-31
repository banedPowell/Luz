import { readFile, rename } from 'node:fs/promises'
import { join } from 'node:path'
import { existsSync } from 'node:fs'
import { eq } from 'drizzle-orm'
import type { Artist } from '#shared/domain/artist'
import type { Album } from '#shared/domain/album'
import type { Track } from '#shared/domain/track'
import type { Playlist } from '#shared/domain/playlist'
import type { CacheData } from '#shared/domain/cache'
import type { DownloadJob } from '#shared/domain/download'
import type { ProfilesData } from '#shared/domain/device-profile'
import type { AppSettings } from '#shared/domain/settings'
import { DEFAULT_SCAN_STATE } from '#shared/domain/system'
import { getDb } from './client'
import * as schema from './schema'
import { getLegacyDataDir, LEGACY_COLLECTIONS, getMusicLibraryPath } from '../paths/data-dir'
import { createDefaultProfiles } from '../storage/bootstrap'
import { getDefaultSettings } from '../storage/defaults'
import { migrateProfilesToSettingsIfNeeded } from './migrate-profiles-to-settings'

async function readLegacyJson<T>(baseDir: string, rel: string, fallback: T): Promise<T> {
  const path = join(baseDir, rel)
  if (!existsSync(path)) return fallback
  try {
    return JSON.parse(await readFile(path, 'utf-8')) as T
  } catch {
    return fallback
  }
}

function profileToSettings(profilesData: ProfilesData, base: AppSettings): AppSettings {
  const active = profilesData.profiles.find(p => p.id === profilesData.activeProfileId)
    || profilesData.profiles[0]
  if (!active) return base
  return {
    ...base,
    libraryPath: active.storagePath || base.libraryPath,
    downloadDefaults: active.downloadDefaults || base.downloadDefaults,
    metadataRules: { featStrategy: active.metadataRules?.featStrategy || base.metadataRules.featStrategy },
    supportedFormats: active.capabilities?.supportedFormats || base.supportedFormats,
    outputTemplate: `${active.storagePath}/%(artist|uploader)s/%(album|Singles)s/%(title)s.%(ext)s`
  }
}

export async function migrateFromJsonIfNeeded(): Promise<boolean> {
  const legacyDir = getLegacyDataDir()
  const db = getDb()

  const hasArtists = db.select().from(schema.artists).limit(1).all().length > 0
  if (hasArtists) return false

  const legacyExists = existsSync(join(legacyDir, LEGACY_COLLECTIONS.settings))
    || existsSync(join(legacyDir, LEGACY_COLLECTIONS.artists))

  if (!legacyExists) return false

  const settings = await readLegacyJson(legacyDir, LEGACY_COLLECTIONS.settings, getDefaultSettings())
  const profilesData = await readLegacyJson<ProfilesData>(legacyDir, LEGACY_COLLECTIONS.profiles, createDefaultProfiles())
  const mergedSettings = profileToSettings(profilesData, settings)

  const artists = await readLegacyJson<Artist[]>(legacyDir, LEGACY_COLLECTIONS.artists, [])
  const albums = await readLegacyJson<Album[]>(legacyDir, LEGACY_COLLECTIONS.albums, [])
  const tracks = await readLegacyJson<Track[]>(legacyDir, LEGACY_COLLECTIONS.tracks, [])
  const playlists = await readLegacyJson<Playlist[]>(legacyDir, LEGACY_COLLECTIONS.playlists, [])
  const cache = await readLegacyJson<CacheData>(legacyDir, LEGACY_COLLECTIONS.cache, { entries: [] })
  const queue = await readLegacyJson<DownloadJob[]>(legacyDir, LEGACY_COLLECTIONS.queue, [])
  const history = await readLegacyJson<DownloadJob[]>(legacyDir, LEGACY_COLLECTIONS.downloadHistory, [])
  const scan = await readLegacyJson(legacyDir, LEGACY_COLLECTIONS.scanState, DEFAULT_SCAN_STATE)

  db.insert(schema.settings).values({ data: mergedSettings }).run()
  for (const p of profilesData.profiles) {
    db.insert(schema.profiles).values({ id: p.id, data: p }).run()
  }
  db.insert(schema.profileState).values({ activeProfileId: profilesData.activeProfileId }).run()

  for (const a of artists) {
    db.insert(schema.artists).values({ id: a.id, data: a, updatedAt: a.updatedAt }).run()
  }
  for (const a of albums) {
    db.insert(schema.albums).values({ id: a.id, data: a, artistId: a.artistId, updatedAt: a.updatedAt }).run()
  }
  for (const t of tracks) {
    db.insert(schema.tracks).values({
      id: t.id, data: t, artistId: t.artistId, albumId: t.albumId ?? null, updatedAt: t.updatedAt
    }).run()
  }
  for (const p of playlists) {
    db.insert(schema.playlists).values({ id: p.id, data: p, updatedAt: p.updatedAt }).run()
    p.trackIds.forEach((trackId, position) => {
      db.insert(schema.playlistTracks).values({ playlistId: p.id, trackId, position }).run()
    })
  }
  for (const e of cache.entries) {
    db.insert(schema.cacheEntries).values({ fingerprint: e.fingerprint, data: e }).run()
  }
  const allJobs = [...queue, ...history]
  for (const j of allJobs) {
    const isActive = !['finished', 'cancelled', 'failed'].includes(j.status)
    db.insert(schema.downloadJobs).values({
      id: j.id, data: j, status: j.status, isActive, createdAt: j.createdAt, updatedAt: j.updatedAt
    }).onConflictDoNothing().run()
  }
  db.insert(schema.scanState).values({ data: scan }).run()

  try {
    const bak = `${legacyDir}.bak`
    if (!existsSync(bak)) await rename(legacyDir, bak)
  } catch { /* ignore */ }

  return true
}

export function seedDefaultsIfEmpty(): void {
  const db = getDb()
  const hasSettings = db.select().from(schema.settings).limit(1).all().length > 0
  if (hasSettings) return

  db.insert(schema.settings).values({ data: getDefaultSettings() }).run()
  db.insert(schema.scanState).values({ data: DEFAULT_SCAN_STATE }).run()
}

export { migrateProfilesToSettingsIfNeeded }

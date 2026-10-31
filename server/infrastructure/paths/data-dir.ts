import { homedir } from 'node:os'
import { join } from 'node:path'
import { mkdir } from 'node:fs/promises'
import { existsSync, readFileSync } from 'node:fs'
import type { AppSettings } from '#shared/domain/settings'
import { DEFAULT_SETTINGS } from '#shared/domain/settings'

/** Résout ~/… vers le répertoire utilisateur (serveur uniquement). */
export function resolveStoragePath(path: string): string {
  if (!path) return path
  if (path === '~') return homedir()
  if (path.startsWith('~/') || path.startsWith('~\\')) {
    return join(homedir(), path.slice(2))
  }
  return path
}

export function getMusicLibraryPath(): string {
  return join(homedir(), 'Music', 'Luz')
}

export function getDefaultAppConfigDir(storagePath?: string): string {
  return join(storagePath || getMusicLibraryPath(), '.config')
}

export function getAppConfigDir(): string {
  const envDir = process.env.LUZ_DATA_DIR
  if (envDir) return envDir

  try {
    const legacySettings = join(getMusicLibraryPath(), 'data', 'config', 'settings.json')
    if (existsSync(legacySettings)) {
      const raw = JSON.parse(readFileSync(legacySettings, 'utf-8')) as AppSettings
      if (raw.appDataPath) return raw.appDataPath
    }
  } catch { /* ignore */ }

  return getDefaultAppConfigDir()
}

export function getDbPath(configDir?: string): string {
  return join(configDir || getAppConfigDir(), 'luz.db')
}

export function getLogsDir(configDir?: string): string {
  return join(configDir || getAppConfigDir(), 'logs')
}

/** @deprecated JSON collections — used only for one-shot migration */
export const LEGACY_COLLECTIONS = {
  settings: 'config/settings.json',
  profiles: 'config/profiles.json',
  artists: 'library/artists.json',
  albums: 'library/albums.json',
  tracks: 'library/tracks.json',
  playlists: 'library/playlists.json',
  cache: 'cache.json',
  queue: 'queue.json',
  downloadHistory: 'download-history.json',
  scanState: 'scan-state.json'
} as const

export function getLegacyDataDir(): string {
  return join(getMusicLibraryPath(), 'data')
}

export async function ensureDir(path: string): Promise<void> {
  if (!existsSync(path)) {
    await mkdir(path, { recursive: true })
  }
}

export { DEFAULT_SETTINGS }

import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { mkdirSync, existsSync } from 'node:fs'
import { dirname } from 'node:path'
import * as schema from './schema'
import { getAppConfigDir, getDbPath } from '../paths/data-dir'

let dbInstance: ReturnType<typeof drizzle<typeof schema>> | null = null
let sqliteInstance: Database.Database | null = null

const MIGRATIONS_SQL = `
CREATE TABLE IF NOT EXISTS settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  data TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS profiles (
  id TEXT PRIMARY KEY,
  data TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS profile_state (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  active_profile_id TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS artists (
  id TEXT PRIMARY KEY,
  data TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS albums (
  id TEXT PRIMARY KEY,
  data TEXT NOT NULL,
  artist_id TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS tracks (
  id TEXT PRIMARY KEY,
  data TEXT NOT NULL,
  artist_id TEXT NOT NULL,
  album_id TEXT,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS playlists (
  id TEXT PRIMARY KEY,
  data TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS playlist_tracks (
  playlist_id TEXT NOT NULL,
  track_id TEXT NOT NULL,
  position INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS cache_entries (
  fingerprint TEXT PRIMARY KEY,
  data TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS download_jobs (
  id TEXT PRIMARY KEY,
  data TEXT NOT NULL,
  status TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS download_job_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id TEXT NOT NULL,
  level TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS scan_state (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  data TEXT NOT NULL
);
`

export function initDb(customConfigDir?: string): ReturnType<typeof drizzle<typeof schema>> {
  if (dbInstance) return dbInstance

  const configDir = customConfigDir || getAppConfigDir()
  const dbPath = getDbPath(configDir)
  mkdirSync(dirname(dbPath), { recursive: true })

  sqliteInstance = new Database(dbPath)
  sqliteInstance.pragma('journal_mode = WAL')
  sqliteInstance.pragma('foreign_keys = ON')
  sqliteInstance.exec(MIGRATIONS_SQL)

  dbInstance = drizzle(sqliteInstance, { schema })
  return dbInstance
}

export function getDb(): ReturnType<typeof drizzle<typeof schema>> {
  if (!dbInstance) {
    throw new Error('Database not initialized. Call initDb first.')
  }
  return dbInstance
}

export function getSqlite(): Database.Database {
  if (!sqliteInstance) throw new Error('Database not initialized')
  return sqliteInstance
}

export function closeDb(): void {
  sqliteInstance?.close()
  sqliteInstance = null
  dbInstance = null
}

import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core'

export const settings = sqliteTable('settings', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  data: text('data', { mode: 'json' }).notNull()
})

export const profiles = sqliteTable('profiles', {
  id: text('id').primaryKey(),
  data: text('data', { mode: 'json' }).notNull()
})

export const profileState = sqliteTable('profile_state', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  activeProfileId: text('active_profile_id').notNull()
})

export const artists = sqliteTable('artists', {
  id: text('id').primaryKey(),
  data: text('data', { mode: 'json' }).notNull(),
  updatedAt: text('updated_at').notNull()
})

export const albums = sqliteTable('albums', {
  id: text('id').primaryKey(),
  data: text('data', { mode: 'json' }).notNull(),
  artistId: text('artist_id').notNull(),
  updatedAt: text('updated_at').notNull()
})

export const tracks = sqliteTable('tracks', {
  id: text('id').primaryKey(),
  data: text('data', { mode: 'json' }).notNull(),
  artistId: text('artist_id').notNull(),
  albumId: text('album_id'),
  updatedAt: text('updated_at').notNull()
})

export const playlists = sqliteTable('playlists', {
  id: text('id').primaryKey(),
  data: text('data', { mode: 'json' }).notNull(),
  updatedAt: text('updated_at').notNull()
})

export const playlistTracks = sqliteTable('playlist_tracks', {
  playlistId: text('playlist_id').notNull(),
  trackId: text('track_id').notNull(),
  position: integer('position').notNull()
})

export const cacheEntries = sqliteTable('cache_entries', {
  fingerprint: text('fingerprint').primaryKey(),
  data: text('data', { mode: 'json' }).notNull()
})

export const downloadJobs = sqliteTable('download_jobs', {
  id: text('id').primaryKey(),
  data: text('data', { mode: 'json' }).notNull(),
  status: text('status').notNull(),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull()
})

export const downloadJobLogs = sqliteTable('download_job_logs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  jobId: text('job_id').notNull(),
  level: text('level').notNull(),
  message: text('message').notNull(),
  createdAt: text('created_at').notNull()
})

export const scanState = sqliteTable('scan_state', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  data: text('data', { mode: 'json' }).notNull()
})

import { sql } from 'drizzle-orm';
import type { AnalyzedKind, DownloadFailureReason, DownloadState, TrackTags } from '@luz/core';
import { check, index, integer, sqliteTable, text, unique } from 'drizzle-orm/sqlite-core';

/**
 * The application settings, one row only. Real columns rather than key/value pairs,
 * so each setting keeps its own type and constraints (ADR 0002). Defaults live in
 * @luz/core, not in the database. The theme is not one of them: it is a browser preference
 * kept in a cookie (ADR 0006).
 */
export const settings = sqliteTable(
	'settings',
	{
		id: integer('id').primaryKey(),
		musicLibraryPath: text('music_library_path'),
		// Null only in a row written before the column existed, until ensureSettings() fills it
		namingTemplate: text('naming_template'),
	},
	(table) => [check('settings_single_row', sql`${table.id} = 1`)],
);

/**
 * The artists albums are grouped under (album artist, else first track artist; see
 * @luz/core). The library tables are an index of the audio files, which stay the
 * source of truth: a rescan can rebuild them.
 */
export const artists = sqliteTable('artists', {
	id: integer('id').primaryKey(),
	// groupingKey() of the name; '' is the unknown artist
	key: text('key').notNull().unique(),
	// The name as first seen; null for the unknown artist
	name: text('name'),
	// searchKey() of the name (@luz/core), matched with LIKE: SQLite folds neither
	// accents nor non-ASCII case. Null when the name is, or for a row indexed before
	// the column existed, until fillSearchKeys() completes it at startup.
	searchName: text('search_name'),
});

export const albums = sqliteTable(
	'albums',
	{
		id: integer('id').primaryKey(),
		artistId: integer('artist_id')
			.notNull()
			.references(() => artists.id),
		// groupingKey() of the title; '' is the unknown album of this artist
		key: text('key').notNull(),
		title: text('title'),
		searchTitle: text('search_title'),
	},
	(table) => [unique('albums_artist_key').on(table.artistId, table.key)],
);

/**
 * One row per audio file. A track reaches its artist through its album, so the
 * grouping lives in one place. Track artists are kept as a display string: v0.2 browses
 * by album artist, and splitting "A feat. B" reliably needs metadata providers (v0.4).
 */
export const tracks = sqliteTable(
	'tracks',
	{
		id: integer('id').primaryKey(),
		path: text('path').notNull().unique(),
		albumId: integer('album_id')
			.notNull()
			.references(() => albums.id),
		title: text('title'),
		searchTitle: text('search_title'),
		artists: text('artists'),
		trackNumber: integer('track_number'),
		discNumber: integer('disc_number'),
		year: integer('year'),
		genre: text('genre'),
		durationMs: integer('duration_ms'),
		// codecName() of @luz/core; null when the file names none
		codec: text('codec'),
		// isLosslessCodec() of the codec. Null for a track indexed before the column existed:
		// the next scan reads it again even if its file did not change
		lossless: integer('lossless', { mode: 'boolean' }),
		// The rest of TrackAudio, shown in the track details; null when the file does not say
		codecProfile: text('codec_profile'),
		bitrate: integer('bitrate'),
		sampleRate: integer('sample_rate'),
		bitDepth: integer('bit_depth'),
		channels: integer('channels'),
		// Compared by the rescan to skip files that did not change
		fileSize: integer('file_size').notNull(),
		modifiedAtMs: integer('modified_at_ms').notNull(),
		// When a scan first indexed the file, kept when it reads the file again: the
		// file's own dates change with retagging or copying. Rows indexed before the column
		// existed got their file's modification time (migration 0005).
		addedAtMs: integer('added_at_ms'),
	},
	(table) => [index('tracks_album_id').on(table.albumId)],
);

/**
 * One download request: a URL and the items selected from its analysis (ADR 0007). Rows
 * outlive a restart, so the queue and its history do too; state, dates and counts are
 * queried, hence real columns.
 */
export const downloadJobs = sqliteTable(
	'download_jobs',
	{
		id: integer('id').primaryKey(),
		url: text('url').notNull(),
		kind: text('kind').$type<AnalyzedKind>().notNull(),
		title: text('title').notNull(),
		state: text('state').$type<DownloadState>().notNull(),
		// Set when the job failed as a whole ("interrupted")
		errorReason: text('error_reason').$type<DownloadFailureReason>(),
		createdAtMs: integer('created_at_ms').notNull(),
		startedAtMs: integer('started_at_ms'),
		finishedAtMs: integer('finished_at_ms'),
		itemCount: integer('item_count').notNull(),
		completedCount: integer('completed_count').notNull().default(0),
		failedCount: integer('failed_count').notNull().default(0),
	},
	(table) => [index('download_jobs_state').on(table.state, table.createdAtMs)],
);

/** One file a job downloads, in the order of the analysis. */
export const downloadItems = sqliteTable(
	'download_items',
	{
		id: integer('id').primaryKey(),
		jobId: integer('job_id')
			.notNull()
			.references(() => downloadJobs.id, { onDelete: 'cascade' }),
		position: integer('position').notNull(),
		sourceId: text('source_id').notNull(),
		url: text('url'),
		thumbnailUrl: text('thumbnail_url'),
		title: text('title').notNull(),
		// The TrackTags of the analysis, written to the file later (#84): an opaque payload
		tags: text('tags', { mode: 'json' }).$type<TrackTags>().notNull(),
		pathWithoutExtension: text('path_without_extension').notNull(),
		state: text('state').$type<DownloadState>().notNull(),
		errorReason: text('error_reason').$type<DownloadFailureReason>(),
		// The capped tool output (appendToLog of @luz/core), as a JSON array of lines
		log: text('log', { mode: 'json' }).$type<string[]>().notNull(),
	},
	(table) => [unique('download_items_job_position').on(table.jobId, table.position)],
);

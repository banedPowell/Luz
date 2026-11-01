import { themes } from '@luz/core';
import { sql } from 'drizzle-orm';
import { check, index, integer, sqliteTable, text, unique } from 'drizzle-orm/sqlite-core';

// Literal SQL list: CHECK constraints cannot take bound parameters
const themeList = sql.raw(themes.map((theme) => `'${theme}'`).join(', '));

/**
 * The application settings, one row only. Real columns rather than key/value pairs,
 * so each setting keeps its own type and constraints (ADR 0002). Defaults live in
 * @luz/core, not in the database.
 */
export const settings = sqliteTable(
	'settings',
	{
		id: integer('id').primaryKey(),
		theme: text('theme', { enum: themes }).notNull(),
		musicLibraryPath: text('music_library_path'),
	},
	(table) => [
		check('settings_single_row', sql`${table.id} = 1`),
		check('settings_theme', sql`${table.theme} in (${themeList})`),
	],
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
		// Compared by the rescan to skip files that did not change
		fileSize: integer('file_size').notNull(),
		modifiedAtMs: integer('modified_at_ms').notNull(),
	},
	(table) => [index('tracks_album_id').on(table.albumId)],
);

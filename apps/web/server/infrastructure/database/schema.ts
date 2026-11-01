import { themes } from '@luz/core';
import { sql } from 'drizzle-orm';
import { check, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

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

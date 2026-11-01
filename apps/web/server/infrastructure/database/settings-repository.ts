import { defaultSettings, type Settings, type SettingsPatch } from '@luz/core';
import { eq } from 'drizzle-orm';

import type { Database } from './client';
import { settings } from './schema';

// The table holds a single row, enforced by a CHECK constraint
const settingsRowId = 1;

/** Writes the default settings unless a row exists already, so user choices survive. */
export async function ensureSettings(db: Database): Promise<void> {
	await db
		.insert(settings)
		.values({
			id: settingsRowId,
			theme: defaultSettings.theme,
			musicLibraryPath: defaultSettings.musicLibraryPath ?? null,
		})
		.onConflictDoNothing();
}

export async function readSettings(db: Database): Promise<Settings> {
	const row = await db.query.settings.findFirst({ where: eq(settings.id, settingsRowId) });
	if (!row) {
		throw new Error('The settings row is missing: was the database initialized?');
	}
	return toSettings(row);
}

export async function writeSettings(db: Database, patch: SettingsPatch): Promise<Settings> {
	const changes: Partial<typeof settings.$inferInsert> = {};
	if (patch.theme !== undefined) {
		changes.theme = patch.theme;
	}
	if (patch.musicLibraryPath !== undefined) {
		changes.musicLibraryPath = patch.musicLibraryPath;
	}

	if (Object.keys(changes).length === 0) {
		return readSettings(db);
	}
	const [row] = await db
		.update(settings)
		.set(changes)
		.where(eq(settings.id, settingsRowId))
		.returning();
	if (!row) {
		throw new Error('The settings row is missing: was the database initialized?');
	}
	return toSettings(row);
}

// A null column becomes an absent key, as in the core schema
function toSettings(row: typeof settings.$inferSelect): Settings {
	return row.musicLibraryPath === null
		? { theme: row.theme }
		: { theme: row.theme, musicLibraryPath: row.musicLibraryPath };
}

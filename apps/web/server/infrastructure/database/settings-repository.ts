import { defaultSettings, type Settings, type SettingsPatch } from '@luz/core';
import { eq, isNull } from 'drizzle-orm';

import type { Database } from './client';
import { settings } from './schema';

// The table holds a single row, enforced by a CHECK constraint
const settingsRowId = 1;

/**
 * Writes the default settings unless a row exists already, so user choices survive.
 * A setting added after the row was written gets its default here too.
 */
export async function ensureSettings(db: Database): Promise<void> {
	await db
		.insert(settings)
		.values({
			id: settingsRowId,
			musicLibraryPath: defaultSettings.musicLibraryPath ?? null,
			namingTemplate: defaultSettings.namingTemplate,
			outputFormat: defaultSettings.outputFormat,
		})
		.onConflictDoNothing();
	await db
		.update(settings)
		.set({ namingTemplate: defaultSettings.namingTemplate })
		.where(isNull(settings.namingTemplate));
	await db
		.update(settings)
		.set({ outputFormat: defaultSettings.outputFormat })
		.where(isNull(settings.outputFormat));
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
	if (patch.musicLibraryPath !== undefined) {
		changes.musicLibraryPath = patch.musicLibraryPath;
	}
	if (patch.namingTemplate !== undefined) {
		changes.namingTemplate = patch.namingTemplate;
	}
	if (patch.outputFormat !== undefined) {
		changes.outputFormat = patch.outputFormat;
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

// A null column becomes an absent key or the default, as in the core schema
function toSettings(row: typeof settings.$inferSelect): Settings {
	const namingTemplate = row.namingTemplate ?? defaultSettings.namingTemplate;
	const outputFormat = row.outputFormat ?? defaultSettings.outputFormat;
	return row.musicLibraryPath === null
		? { namingTemplate, outputFormat }
		: { musicLibraryPath: row.musicLibraryPath, namingTemplate, outputFormat };
}

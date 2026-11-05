import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { defaultNamingTemplate, defaultOutputFormat, defaultSettings } from '@luz/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openDatabase, type Database } from '../../server/infrastructure/database/client';
import { applyMigrations, loadMigrations } from '../../server/infrastructure/database/migrations';
import { settings } from '../../server/infrastructure/database/schema';
import {
	ensureSettings,
	readSettings,
} from '../../server/infrastructure/database/settings-repository';
import { getSettings, updateSettings } from '../../server/services/settings';
import { readMigrationsFolder, removeWhenReleased } from './support/database';

describe('settings', () => {
	let dataDir: string;
	let db: Database;

	// What useDatabase() does at startup, on a temporary data directory
	async function start(): Promise<Database> {
		const opened = openDatabase(dataDir);
		await applyMigrations(opened.$client, await loadMigrations(readMigrationsFolder));
		await ensureSettings(opened);
		return opened;
	}

	beforeEach(async () => {
		dataDir = mkdtempSync(path.join(tmpdir(), 'luz-test-'));
		db = await start();
	});

	afterEach(async () => {
		db.$client.close();
		await removeWhenReleased(dataDir);
	});

	it('writes the core defaults on first start', async () => {
		expect(await getSettings(db)).toEqual(defaultSettings);
		expect(await db.select().from(settings)).toEqual([
			{
				id: 1,
				musicLibraryPath: null,
				namingTemplate: defaultNamingTemplate,
				outputFormat: defaultOutputFormat,
			},
		]);
	});

	it('keeps stored settings when the defaults are ensured again', async () => {
		await updateSettings(db, { musicLibraryPath: '/music' });

		await ensureSettings(db);

		expect(await getSettings(db)).toEqual({
			musicLibraryPath: '/music',
			namingTemplate: defaultNamingTemplate,
			outputFormat: defaultOutputFormat,
		});
	});

	// A row written before the setting existed
	it('fills in the default naming template of an older row', async () => {
		await db.update(settings).set({ namingTemplate: null });

		await ensureSettings(db);

		expect(await getSettings(db)).toEqual(defaultSettings);
	});

	// A row written before the output format existed
	it('fills in the default output format of an older row', async () => {
		await db.update(settings).set({ outputFormat: null });

		await ensureSettings(db);

		expect(await getSettings(db)).toEqual(defaultSettings);
	});

	it('updates the output format alone', async () => {
		await updateSettings(db, { musicLibraryPath: '/music' });

		expect(await updateSettings(db, { outputFormat: 'mp3-256' })).toEqual({
			musicLibraryPath: '/music',
			namingTemplate: defaultNamingTemplate,
			outputFormat: 'mp3-256',
		});
		await ensureSettings(db);
		expect((await getSettings(db)).outputFormat).toBe('mp3-256');
	});

	it('keeps a stored naming template when the defaults are ensured again', async () => {
		await updateSettings(db, { namingTemplate: '{album}/{title}' });

		await ensureSettings(db);

		expect((await getSettings(db)).namingTemplate).toBe('{album}/{title}');
	});

	it('updates the naming template alone', async () => {
		await updateSettings(db, { musicLibraryPath: '/music' });

		expect(await updateSettings(db, { namingTemplate: '{title}' })).toEqual({
			musicLibraryPath: '/music',
			namingTemplate: '{title}',
			outputFormat: defaultOutputFormat,
		});
	});

	it('updates the library path and returns the result', async () => {
		expect(await updateSettings(db, { musicLibraryPath: '/music' })).toEqual({
			musicLibraryPath: '/music',
			namingTemplate: defaultNamingTemplate,
			outputFormat: defaultOutputFormat,
		});
	});

	it('clears the library path with null', async () => {
		await updateSettings(db, { musicLibraryPath: '/music' });

		expect(await updateSettings(db, { musicLibraryPath: null })).toEqual(defaultSettings);
	});

	it('returns the current settings for an empty patch', async () => {
		await updateSettings(db, { musicLibraryPath: '/music' });

		expect(await updateSettings(db, {})).toEqual({
			musicLibraryPath: '/music',
			namingTemplate: defaultNamingTemplate,
			outputFormat: defaultOutputFormat,
		});
	});

	it('survives closing and reopening the database', async () => {
		await updateSettings(db, { musicLibraryPath: 'D:\\Music' });
		db.$client.close();

		db = await start();

		expect(await getSettings(db)).toEqual({
			namingTemplate: defaultNamingTemplate,
			outputFormat: defaultOutputFormat,
			musicLibraryPath: 'D:\\Music',
		});
	});

	it('fails clearly when the row is missing', async () => {
		await db.delete(settings);

		await expect(readSettings(db)).rejects.toThrow('The settings row is missing');
		await expect(updateSettings(db, { musicLibraryPath: '/music' })).rejects.toThrow(
			'The settings row is missing',
		);
	});
});

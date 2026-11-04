import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	databaseFileName,
	openDatabase,
	type Database,
} from '../../server/infrastructure/database/client';
import {
	applyMigrations,
	loadMigrations,
	type Migration,
	type MigrationReader,
} from '../../server/infrastructure/database/migrations';
import { settings } from '../../server/infrastructure/database/schema';
import { readMigrationsFolder, removeWhenReleased } from './support/database';

function readerOf(files: Record<string, string>): MigrationReader {
	return async (file) => files[file];
}

function journalOf(...entries: { tag: string; when: number }[]): string {
	return JSON.stringify({ version: '7', dialect: 'sqlite', entries });
}

describe('loadMigrations', () => {
	it('reads the committed migrations in journal order', async () => {
		const migrations = await loadMigrations(readMigrationsFolder);

		expect(migrations.map((migration) => migration.tag)).toEqual([
			'0000_create_settings',
			'0001_create_library',
			'0002_add_search_keys',
			'0003_add_track_audio',
		]);
		expect(migrations[0]?.statements[0]).toMatch(/^CREATE TABLE `settings`/);
		expect(migrations[0]?.hash).toMatch(/^[\da-f]{64}$/);
	});

	// Rewriting a migration a database has applied makes it pending again under its new
	// date: its statements then run twice and the server fails to start. Pin each one here once
	// merged; unmerged ones too may have been applied by a branch's dev database. Add a migration instead.
	it('keeps the migrations already applied unchanged', async () => {
		const hashes = Object.fromEntries(
			(await loadMigrations(readMigrationsFolder)).map((migration) => [
				migration.tag,
				`${migration.createdAt}:${migration.hash}`,
			]),
		);

		expect(hashes).toMatchObject({
			'0000_create_settings':
				'1793526971211:d7d1b064768ef5bda0797cfa4696630fc8dd7422f8a29b0aab6bc05dbb9128d6',
			'0001_create_library':
				'1793542870051:3f4fdcf01f7d4b75ffcf8b0023edd168f55466183a8bf304d067c32b75f0fae9',
			'0002_add_search_keys':
				'1793549739047:90d0e6f409be9f636ac8997cabfc66973dc15ada2388d04715e4cb1c849d9423',
			'0003_add_track_audio':
				'1793821056793:369966096b82a110baad4acf547e608251cebabf79d6d9cdb44b657bd98b5682',
		});
	});

	it('splits a migration on statement breakpoints and drops empty statements', async () => {
		const migrations = await loadMigrations(
			readerOf({
				'meta/_journal.json': journalOf({ tag: '0000_a', when: 1 }),
				'0000_a.sql':
					'CREATE TABLE a (id integer);\n--> statement-breakpoint\nCREATE TABLE b (id integer);\n',
			}),
		);

		expect(migrations[0]?.statements).toEqual([
			'CREATE TABLE a (id integer);',
			'CREATE TABLE b (id integer);',
		]);
	});

	it('fails without a journal', async () => {
		await expect(loadMigrations(readerOf({}))).rejects.toThrow('Missing migrations journal');
	});

	it('fails on an invalid journal', async () => {
		await expect(
			loadMigrations(readerOf({ 'meta/_journal.json': '{"entries":[{"tag":1}]}' })),
		).rejects.toThrow('Invalid migrations journal');
	});

	it('fails when a listed migration file is missing', async () => {
		await expect(
			loadMigrations(
				readerOf({ 'meta/_journal.json': journalOf({ tag: '0000_a', when: 1 }) }),
			),
		).rejects.toThrow('Missing migration file 0000_a.sql');
	});
});

describe('database', () => {
	let root: string;
	let dataDir: string;
	let db: Database;

	beforeEach(() => {
		root = mkdtempSync(path.join(tmpdir(), 'luz-test-'));
		dataDir = path.join(root, 'nested', 'data');
		db = openDatabase(dataDir);
	});

	afterEach(async () => {
		db.$client.close();
		await removeWhenReleased(root);
	});

	// Keeps only the message: a libSQL error holds on to its native statement, which
	// would keep the file locked on Windows (see removeWhenReleased)
	async function failureOf(sql: string): Promise<string | undefined> {
		return db.$client.execute(sql).then(
			() => undefined,
			(error: unknown) => (error instanceof Error ? error.message : String(error)),
		);
	}

	async function migrate(): Promise<Migration[]> {
		return applyMigrations(db.$client, await loadMigrations(readMigrationsFolder));
	}

	it('creates the data directory and the database file', async () => {
		await migrate();

		expect(existsSync(path.join(dataDir, databaseFileName))).toBe(true);
	});

	it('applies the migrations once', async () => {
		expect((await migrate()).map((migration) => migration.tag)).toEqual([
			'0000_create_settings',
			'0001_create_library',
			'0002_add_search_keys',
			'0003_add_track_audio',
		]);
		expect(await migrate()).toEqual([]);
	});

	it('applies only the migrations newer than the last applied one', async () => {
		const first = { tag: '0000_a', when: 1, sql: 'CREATE TABLE a (id integer);' };
		const second = { tag: '0001_b', when: 2, sql: 'CREATE TABLE b (id integer);' };
		const files = {
			'0000_a.sql': first.sql,
			'0001_b.sql': second.sql,
		};

		await applyMigrations(
			db.$client,
			await loadMigrations(readerOf({ ...files, 'meta/_journal.json': journalOf(first) })),
		);
		const applied = await applyMigrations(
			db.$client,
			await loadMigrations(
				readerOf({ ...files, 'meta/_journal.json': journalOf(first, second) }),
			),
		);

		expect(applied.map((migration) => migration.tag)).toEqual(['0001_b']);
	});

	it('rolls back every statement when a migration fails', async () => {
		const migrations = await loadMigrations(
			readerOf({
				'meta/_journal.json': journalOf({ tag: '0000_a', when: 1 }),
				'0000_a.sql': 'CREATE TABLE a (id integer);\n--> statement-breakpoint\nNOT SQL;',
			}),
		);

		await expect(applyMigrations(db.$client, migrations)).rejects.toThrow();
		const tables = await db.$client.execute("SELECT name FROM sqlite_master WHERE name = 'a'");
		expect(tables.rows).toEqual([]);
		const recorded = await db.$client.execute('SELECT hash FROM __drizzle_migrations');
		expect(recorded.rows).toEqual([]);
	});

	describe('settings table', () => {
		beforeEach(async () => {
			await migrate();
		});

		it('stores a row with a theme and an optional library path', async () => {
			await db.insert(settings).values({ id: 1, theme: 'dark' });
			await db.update(settings).set({ musicLibraryPath: '/music' });

			expect(await db.select().from(settings)).toEqual([
				{ id: 1, theme: 'dark', musicLibraryPath: '/music' },
			]);
		});

		it('holds a single row', async () => {
			expect(
				await failureOf("INSERT INTO settings (id, theme) VALUES (2, 'system')"),
			).toMatch(/CHECK constraint failed: settings_single_row/);
		});

		it('rejects a theme outside the core list', async () => {
			expect(await failureOf("INSERT INTO settings (id, theme) VALUES (1, 'sepia')")).toMatch(
				/CHECK constraint failed: settings_theme/,
			);
		});

		it('requires a theme', async () => {
			expect(await failureOf('INSERT INTO settings (id) VALUES (1)')).toMatch(
				/NOT NULL constraint failed: settings.theme/,
			);
		});
	});
});

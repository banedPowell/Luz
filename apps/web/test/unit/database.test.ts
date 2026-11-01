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
		]);
		expect(migrations[0]?.statements[0]).toMatch(/^CREATE TABLE `settings`/);
		expect(migrations[0]?.hash).toMatch(/^[\da-f]{64}$/);
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

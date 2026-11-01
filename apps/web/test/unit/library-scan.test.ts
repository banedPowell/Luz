import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { trackTagsSchema } from '@luz/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openDatabase, type Database } from '../../server/infrastructure/database/client';
import { findTrackByPath } from '../../server/infrastructure/database/library-repository';
import { applyMigrations, loadMigrations } from '../../server/infrastructure/database/migrations';
import { albums, artists, tracks } from '../../server/infrastructure/database/schema';
import {
	ensureSettings,
	writeSettings,
} from '../../server/infrastructure/database/settings-repository';
import type { TagReader, TagReadResult } from '../../server/infrastructure/tag-reader';
import { ScanError, scanLibrary } from '../../server/services/library-scan';
import { readMigrationsFolder, removeWhenReleased } from './support/database';

/**
 * Stands in for music-metadata: a file named `broken*` cannot be read, any other one is
 * tagged after its folder (album) and its name (title). Records what it was asked to read.
 */
class FakeTagReader implements TagReader {
	readonly reads: string[] = [];
	gate: Promise<void> | undefined;

	async read(filePath: string): Promise<TagReadResult> {
		this.reads.push(filePath);
		await this.gate;
		const name = path.basename(filePath);
		if (name.startsWith('broken')) {
			return { ok: false, error: { kind: 'unreadable', message: 'corrupt' } };
		}
		return {
			ok: true,
			tags: trackTagsSchema.parse({
				title: name,
				artists: ['Fake Artist'],
				album: path.basename(path.dirname(filePath)),
			}),
		};
	}
}

async function scanError(promise: Promise<unknown>): Promise<ScanError> {
	try {
		await promise;
	} catch (error) {
		if (error instanceof ScanError) {
			return error;
		}
		throw error;
	}
	throw new Error('Expected the scan to fail');
}

describe('scanLibrary', () => {
	let dataDir: string;
	let music: string;
	let db: Database;
	let reader: FakeTagReader;

	beforeEach(async () => {
		dataDir = mkdtempSync(path.join(tmpdir(), 'luz-test-'));
		music = mkdtempSync(path.join(tmpdir(), 'luz-test-music-'));
		db = openDatabase(dataDir);
		await applyMigrations(db.$client, await loadMigrations(readMigrationsFolder));
		await ensureSettings(db);
		await writeSettings(db, { musicLibraryPath: music });
		reader = new FakeTagReader();
	});

	afterEach(async () => {
		db.$client.close();
		await removeWhenReleased(dataDir);
		rmSync(music, { recursive: true, force: true });
	});

	function file(relativePath: string, content = 'audio') {
		const filePath = path.join(music, relativePath);
		mkdirSync(path.dirname(filePath), { recursive: true });
		writeFileSync(filePath, content);
		return filePath;
	}

	it('indexes the audio files of nested folders', async () => {
		const deep = file('Band/Album One/01.flac', 'flac data');
		file('Band/Album One/02.mp3');
		file('Band/Album Two/Disc 1/01.M4A');

		const summary = await scanLibrary(db, reader);

		expect(summary).toEqual({ filesFound: 3, tracksIndexed: 3, filesSkipped: 0 });
		expect(
			(await db.select().from(albums).orderBy(albums.title)).map((row) => row.title),
		).toEqual(['Album One', 'Disc 1']);
		expect((await db.select().from(artists)).map((row) => row.name)).toEqual(['Fake Artist']);
		expect(await findTrackByPath(db, deep)).toMatchObject({
			title: '01.flac',
			fileSize: 'flac data'.length,
			album: { title: 'Album One' },
		});
	});

	it('ignores files that are not audio, without reading them', async () => {
		file('Album/01.mp3');
		file('Album/cover.jpg');
		file('Album/notes.txt');

		const summary = await scanLibrary(db, reader);

		expect(summary).toEqual({ filesFound: 1, tracksIndexed: 1, filesSkipped: 0 });
		expect(reader.reads.map((read) => path.basename(read))).toEqual(['01.mp3']);
	});

	it('skips and counts unreadable files, and keeps scanning', async () => {
		file('Album/01.mp3');
		file('Album/broken.flac');
		file('Album/03.ogg');

		const summary = await scanLibrary(db, reader);

		expect(summary).toEqual({ filesFound: 3, tracksIndexed: 2, filesSkipped: 1 });
		expect(await db.select().from(tracks)).toHaveLength(2);
	});

	it('returns an empty summary for an empty folder', async () => {
		expect(await scanLibrary(db, reader)).toEqual({
			filesFound: 0,
			tracksIndexed: 0,
			filesSkipped: 0,
		});
	});

	it('rebuilds the library on a second scan', async () => {
		file('Album/01.mp3');
		const removed = file('Album/02.mp3');
		await scanLibrary(db, reader);
		rmSync(removed);

		const summary = await scanLibrary(db, reader);

		expect(summary.tracksIndexed).toBe(1);
		expect(await db.select().from(tracks)).toHaveLength(1);
		expect(await findTrackByPath(db, removed)).toBeUndefined();
	});

	it('refuses to start without a library folder', async () => {
		await writeSettings(db, { musicLibraryPath: null });

		expect((await scanError(scanLibrary(db, reader))).reason).toBe('library-path-unset');
	});

	it('refuses to start when the library folder is missing', async () => {
		await writeSettings(db, { musicLibraryPath: path.join(music, 'gone') });

		expect((await scanError(scanLibrary(db, reader))).reason).toBe('library-path-missing');
	});

	it('refuses a second scan while one runs, then accepts a new one', async () => {
		file('Album/01.mp3');
		const { promise, resolve: release } = Promise.withResolvers<void>();
		reader.gate = promise;

		const first = scanLibrary(db, reader);
		expect((await scanError(scanLibrary(db, reader))).reason).toBe('scan-running');
		release();
		expect((await first).tracksIndexed).toBe(1);

		reader.gate = undefined;
		expect((await scanLibrary(db, reader)).tracksIndexed).toBe(1);
	});
});

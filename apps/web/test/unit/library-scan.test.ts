import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	renameSync,
	rmSync,
	statSync,
	utimesSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { trackTagsSchema, type ScanSummary, type TrackTags } from '@luz/core';
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
 * Stands in for music-metadata: a file named `broken*` or listed in `unreadable` cannot be
 * read, any other one is tagged after its folder (album) and its name (title), unless
 * `tags` gives its own. Records what it was asked to read.
 */
class FakeTagReader implements TagReader {
	reads: string[] = [];
	gate: Promise<void> | undefined;
	readonly unreadable = new Set<string>();
	readonly tags = new Map<string, Partial<TrackTags>>();

	async read(filePath: string): Promise<TagReadResult> {
		this.reads.push(filePath);
		await this.gate;
		const name = path.basename(filePath);
		if (name.startsWith('broken') || this.unreadable.has(filePath)) {
			return { ok: false, error: { kind: 'unreadable', message: 'corrupt' } };
		}
		return {
			ok: true,
			tags: trackTagsSchema.parse({
				title: name,
				artists: ['Fake Artist'],
				album: path.basename(path.dirname(filePath)),
				...this.tags.get(filePath),
			}),
		};
	}
}

function summary(counts: Partial<ScanSummary>): ScanSummary {
	return { added: 0, updated: 0, removed: 0, unchanged: 0, skipped: 0, ...counts };
}

// What proves the scan left a file alone: its content and its modification time
function snapshot(filePath: string) {
	return { content: readFileSync(filePath, 'utf8'), mtimeMs: statSync(filePath).mtimeMs };
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
	let otherMusic: string;
	let db: Database;
	let reader: FakeTagReader;

	beforeEach(async () => {
		dataDir = mkdtempSync(path.join(tmpdir(), 'luz-test-'));
		music = mkdtempSync(path.join(tmpdir(), 'luz-test-music-'));
		otherMusic = mkdtempSync(path.join(tmpdir(), 'luz-test-music-'));
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
		rmSync(otherMusic, { recursive: true, force: true });
	});

	function file(relativePath: string, content = 'audio', root = music) {
		const filePath = path.join(root, relativePath);
		mkdirSync(path.dirname(filePath), { recursive: true });
		writeFileSync(filePath, content);
		return filePath;
	}

	async function indexedScan() {
		await scanLibrary(db, reader);
		reader.reads = [];
	}

	async function albumTitles() {
		return (await db.select().from(albums).orderBy(albums.title)).map((row) => row.title);
	}

	it('indexes the audio files of nested folders', async () => {
		const deep = file('Band/Album One/01.flac', 'flac data');
		file('Band/Album One/02.mp3');
		file('Band/Album Two/Disc 1/01.M4A');

		expect(await scanLibrary(db, reader)).toEqual(summary({ added: 3 }));
		expect(await albumTitles()).toEqual(['Album One', 'Disc 1']);
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

		expect(await scanLibrary(db, reader)).toEqual(summary({ added: 1 }));
		expect(reader.reads.map((read) => path.basename(read))).toEqual(['01.mp3']);
	});

	it('skips and counts unreadable files, and keeps scanning', async () => {
		file('Album/01.mp3');
		file('Album/broken.flac');
		file('Album/03.ogg');

		expect(await scanLibrary(db, reader)).toEqual(summary({ added: 2, skipped: 1 }));
		expect(await db.select().from(tracks)).toHaveLength(2);
	});

	it('returns an empty summary for an empty folder', async () => {
		expect(await scanLibrary(db, reader)).toEqual(summary({}));
	});

	describe('on an indexed library', () => {
		// A fixed time, so a test can change it and know the scan sees a different one
		const indexedAt = new Date('2026-01-01T00:00:00Z');

		function indexedFile(relativePath: string, root = music) {
			const filePath = file(relativePath, 'audio', root);
			utimesSync(filePath, indexedAt, indexedAt);
			return filePath;
		}

		it('does not read unchanged files again', async () => {
			indexedFile('Album/01.mp3');
			indexedFile('Album/02.mp3');
			await indexedScan();

			expect(await scanLibrary(db, reader)).toEqual(summary({ unchanged: 2 }));
			expect(reader.reads).toEqual([]);
		});

		it('adds the new files only', async () => {
			indexedFile('Album/01.mp3');
			await indexedScan();
			const added = indexedFile('Album/02.mp3');

			expect(await scanLibrary(db, reader)).toEqual(summary({ added: 1, unchanged: 1 }));
			expect(reader.reads).toEqual([added]);
			expect(await findTrackByPath(db, added)).toMatchObject({ album: { title: 'Album' } });
		});

		it('reads a file again when its size changed, and moves it to its new album', async () => {
			const changed = indexedFile('Album/01.mp3');
			indexedFile('Album/02.mp3');
			await indexedScan();
			writeFileSync(changed, 'retagged audio');
			utimesSync(changed, indexedAt, indexedAt);
			reader.tags.set(changed, { title: 'Retagged', album: 'Other Album' });

			expect(await scanLibrary(db, reader)).toEqual(summary({ updated: 1, unchanged: 1 }));
			expect(reader.reads).toEqual([changed]);
			expect(await findTrackByPath(db, changed)).toMatchObject({
				title: 'Retagged',
				fileSize: 'retagged audio'.length,
				album: { title: 'Other Album' },
			});
			expect(await albumTitles()).toEqual(['Album', 'Other Album']);
		});

		it('reads a file again when only its modification time changed', async () => {
			const touched = indexedFile('Album/01.mp3');
			await indexedScan();
			const later = new Date('2026-02-01T00:00:00Z');
			utimesSync(touched, later, later);

			expect(await scanLibrary(db, reader)).toEqual(summary({ updated: 1 }));
			expect(await findTrackByPath(db, touched)).toMatchObject({
				modifiedAtMs: later.getTime(),
			});
		});

		it('drops a changed file whose tags can no longer be read', async () => {
			const changed = indexedFile('Album/01.mp3');
			await indexedScan();
			writeFileSync(changed, 'now corrupt');
			reader.unreadable.add(changed);

			expect(await scanLibrary(db, reader)).toEqual(summary({ skipped: 1 }));
			expect(await findTrackByPath(db, changed)).toBeUndefined();
			expect(await albumTitles()).toEqual([]);
			expect(readFileSync(changed, 'utf8')).toBe('now corrupt');
		});

		it('removes the tracks of deleted files and the groups they leave empty', async () => {
			const kept = indexedFile('Kept/01.mp3');
			const removed = indexedFile('Gone/01.mp3');
			reader.tags.set(removed, { artists: ['Gone Artist'] });
			await indexedScan();
			const before = snapshot(kept);
			rmSync(removed);

			expect(await scanLibrary(db, reader)).toEqual(summary({ removed: 1, unchanged: 1 }));
			expect(await findTrackByPath(db, removed)).toBeUndefined();
			expect(await albumTitles()).toEqual(['Kept']);
			expect((await db.select().from(artists)).map((row) => row.name)).toEqual([
				'Fake Artist',
			]);
			expect(snapshot(kept)).toEqual(before);
		});

		it('follows a file moved to another folder', async () => {
			const from = indexedFile('Old Album/01.mp3');
			indexedFile('Stays/01.mp3');
			await indexedScan();
			const to = path.join(music, 'New Album', '01.mp3');
			mkdirSync(path.dirname(to));
			renameSync(from, to);
			const before = snapshot(to);

			expect(await scanLibrary(db, reader)).toEqual(
				summary({ added: 1, removed: 1, unchanged: 1 }),
			);
			expect(await findTrackByPath(db, from)).toBeUndefined();
			expect(await findTrackByPath(db, to)).toMatchObject({ album: { title: 'New Album' } });
			expect(await albumTitles()).toEqual(['New Album', 'Stays']);
			expect(snapshot(to)).toEqual(before);
		});

		it('replaces the library when the library folder changes in the settings', async () => {
			const old = indexedFile('Old/01.mp3');
			await indexedScan();
			const current = indexedFile('Current/01.mp3', otherMusic);
			const before = snapshot(old);
			await writeSettings(db, { musicLibraryPath: otherMusic });

			expect(await scanLibrary(db, reader)).toEqual(summary({ added: 1, removed: 1 }));
			expect(await db.select().from(tracks)).toHaveLength(1);
			expect(await findTrackByPath(db, current)).toBeDefined();
			expect(await albumTitles()).toEqual(['Current']);
			expect(snapshot(old)).toEqual(before);
		});
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
		expect(await first).toEqual(summary({ added: 1 }));

		reader.gate = undefined;
		expect(await scanLibrary(db, reader)).toEqual(summary({ unchanged: 1 }));
	});
});

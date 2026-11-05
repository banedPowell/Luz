import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	renameSync,
	rmSync,
	statSync,
	symlinkSync,
	utimesSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
	trackAudioOf,
	trackTagsSchema,
	type ScanScope,
	type ScanSummary,
	type TrackAudio,
	type TrackTags,
} from '@luz/core';
import { eq } from 'drizzle-orm';
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
import { indexLibraryFiles, ScanError, scanLibrary } from '../../server/services/library-scan';
import { audioOf } from './support/audio';
import { readMigrationsFolder, removeWhenReleased } from './support/database';

/**
 * Stands in for music-metadata: a file named `broken*` or listed in `unreadable` cannot be
 * read, any other one is tagged after its folder (album) and its name (title), unless
 * `tags` gives its own, and has the codec of its extension, unless `audio` gives one.
 * Records what it was asked to read.
 */
class FakeTagReader implements TagReader {
	reads: string[] = [];
	gate: Promise<void> | undefined;
	readonly unreadable = new Set<string>();
	readonly tags = new Map<string, Partial<TrackTags>>();
	readonly audio = new Map<string, TrackAudio>();

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
			audio: this.audio.get(filePath) ?? audioOf(filePath),
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

// What migration 0003 leaves: the rows it found have no codec yet
async function forgetCodecs(db: Database) {
	await db.update(tracks).set({
		codec: null,
		lossless: null,
		codecProfile: null,
		bitrate: null,
		sampleRate: null,
		bitDepth: null,
		channels: null,
	});
}

function files(...paths: string[]): { scope: ScanScope } {
	return { scope: { kind: 'files', paths } };
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

	async function indexedScan(now?: () => number) {
		await scanLibrary(db, reader, {}, now);
		reader.reads = [];
	}

	async function albumTitles() {
		return (await db.select().from(albums).orderBy(albums.title)).map((row) => row.title);
	}

	async function albumId(title: string) {
		const [row] = await db.select().from(albums).where(eq(albums.title, title));
		if (!row) {
			throw new Error(`No album ${title}`);
		}
		return row.id;
	}

	async function trackId(filePath: string) {
		const track = await findTrackByPath(db, filePath);
		if (!track) {
			throw new Error(`No track at ${filePath}`);
		}
		return track.id;
	}

	function retag(filePath: string) {
		writeFileSync(filePath, 'retagged audio');
		reader.tags.set(filePath, { title: 'Retagged' });
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

	it('dates the tracks it adds with the time the scan started', async () => {
		const first = file('Album/01.mp3');
		const second = file('Album/02.mp3');
		let clock = 1_750_000_000_000;

		await scanLibrary(db, reader, {}, () => clock++);

		expect(clock).toBe(1_750_000_000_001);
		expect(await findTrackByPath(db, first)).toMatchObject({ addedAtMs: 1_750_000_000_000 });
		expect(await findTrackByPath(db, second)).toMatchObject({ addedAtMs: 1_750_000_000_000 });
	});

	it('ignores files that are not audio, without reading them', async () => {
		file('Album/01.mp3');
		file('Album/cover.jpg');
		file('Album/notes.txt');

		expect(await scanLibrary(db, reader)).toEqual(summary({ added: 1 }));
		expect(reader.reads.map((read) => path.basename(read))).toEqual(['01.mp3']);
	});

	it('stores the codec of each track and whether it is lossless', async () => {
		const flac = file('Album/01.flac');
		const aac = file('Album/02.m4a');
		const alac = file('Album/03.m4a');
		reader.audio.set(alac, trackAudioOf({ codec: 'ALAC' }));

		await scanLibrary(db, reader);

		expect(await findTrackByPath(db, flac)).toMatchObject({ codec: 'FLAC', lossless: true });
		expect(await findTrackByPath(db, aac)).toMatchObject({ codec: 'AAC', lossless: false });
		expect(await findTrackByPath(db, alac)).toMatchObject(trackAudioOf({ codec: 'ALAC' }));
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

		it('keeps the date added of a file read again', async () => {
			const changed = indexedFile('Album/01.mp3');
			await indexedScan(() => 1_750_000_000_000);
			writeFileSync(changed, 'retagged audio');
			const added = indexedFile('Album/02.mp3');

			expect(await scanLibrary(db, reader, {}, () => 1_760_000_000_000)).toEqual(
				summary({ added: 1, updated: 1 }),
			);
			expect(await findTrackByPath(db, changed)).toMatchObject({
				fileSize: 'retagged audio'.length,
				addedAtMs: 1_750_000_000_000,
			});
			expect(await findTrackByPath(db, added)).toMatchObject({
				addedAtMs: 1_760_000_000_000,
			});
		});

		it('refreshes the codec of a file read again', async () => {
			const changed = indexedFile('Album/01.m4a');
			await indexedScan();
			writeFileSync(changed, 'reencoded audio');
			reader.audio.set(changed, trackAudioOf({ codec: 'ALAC' }));

			expect(await scanLibrary(db, reader)).toEqual(summary({ updated: 1 }));
			expect(await findTrackByPath(db, changed)).toMatchObject({
				codec: 'ALAC',
				lossless: true,
			});
		});

		it('reads once the unchanged files indexed before codecs were stored', async () => {
			const flac = indexedFile('Album/01.flac');
			const mp3 = indexedFile('Album/02.mp3');
			await indexedScan();
			await forgetCodecs(db);

			expect(await scanLibrary(db, reader)).toEqual(summary({ updated: 2 }));
			expect(reader.reads.toSorted()).toEqual([flac, mp3].toSorted());
			expect(await findTrackByPath(db, flac)).toMatchObject({
				codec: 'FLAC',
				lossless: true,
			});
			expect(await findTrackByPath(db, mp3)).toMatchObject({ codec: 'MP3', lossless: false });

			reader.reads = [];
			expect(await scanLibrary(db, reader)).toEqual(summary({ unchanged: 2 }));
			expect(reader.reads).toEqual([]);
		});

		it('keeps an unchanged track whose codec cannot be read, and tries again later', async () => {
			const kept = indexedFile('Album/01.flac');
			await indexedScan();
			await forgetCodecs(db);
			reader.unreadable.add(kept);

			expect(await scanLibrary(db, reader)).toEqual(summary({ skipped: 1 }));
			expect(await findTrackByPath(db, kept)).toMatchObject({
				album: { title: 'Album' },
				lossless: null,
			});

			reader.unreadable.delete(kept);
			expect(await scanLibrary(db, reader)).toEqual(summary({ updated: 1 }));
			expect(await findTrackByPath(db, kept)).toMatchObject({ lossless: true });
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

		describe('with a scope', () => {
			it('reads again the changed files of the albums it is given, and only them', async () => {
				const first = indexedFile('First/01.mp3');
				const second = indexedFile('Second/01.mp3');
				indexedFile('First/02.mp3');
				await indexedScan();
				retag(first);
				retag(second);
				const scope: ScanScope = { kind: 'albums', ids: [await albumId('First')] };

				expect(await scanLibrary(db, reader, { scope })).toEqual(
					summary({ updated: 1, unchanged: 1 }),
				);
				expect(reader.reads).toEqual([first]);
				expect(await findTrackByPath(db, first)).toMatchObject({ title: 'Retagged' });
				expect(await findTrackByPath(db, second)).toMatchObject({ title: '01.mp3' });
			});

			it('adds no new file, even in a folder of the scope', async () => {
				indexedFile('Album/01.mp3');
				await indexedScan();
				const added = indexedFile('Album/02.mp3');
				const scope: ScanScope = { kind: 'albums', ids: [await albumId('Album')] };

				expect(await scanLibrary(db, reader, { scope })).toEqual(summary({ unchanged: 1 }));
				expect(reader.reads).toEqual([]);
				expect(await findTrackByPath(db, added)).toBeUndefined();
			});

			it('removes the tracks of the scope whose file is gone, and no other', async () => {
				const removed = indexedFile('Album/01.mp3');
				const outside = indexedFile('Album/02.mp3');
				await indexedScan();
				const scope: ScanScope = { kind: 'tracks', ids: [await trackId(removed)] };
				rmSync(removed);
				rmSync(outside);

				expect(await scanLibrary(db, reader, { scope })).toEqual(summary({ removed: 1 }));
				expect(await findTrackByPath(db, removed)).toBeUndefined();
				expect(await findTrackByPath(db, outside)).toBeDefined();
			});

			it('removes a track of the scope outside the library folder, leaving its file', async () => {
				const old = indexedFile('Old/01.mp3');
				await indexedScan();
				const scope: ScanScope = { kind: 'tracks', ids: [await trackId(old)] };
				const before = snapshot(old);
				await writeSettings(db, { musicLibraryPath: otherMusic });

				expect(await scanLibrary(db, reader, { scope })).toEqual(summary({ removed: 1 }));
				expect(reader.reads).toEqual([]);
				expect(await db.select().from(tracks)).toEqual([]);
				expect(snapshot(old)).toEqual(before);
			});

			it('reads the files of the scope again when forced, unchanged or not', async () => {
				const forced = indexedFile('Album/01.mp3');
				const other = indexedFile('Album/02.mp3');
				await indexedScan();
				reader.tags.set(forced, { title: 'Retagged in place' });
				const before = snapshot(forced);
				const scope: ScanScope = { kind: 'tracks', ids: [await trackId(forced)] };

				expect(await scanLibrary(db, reader, { scope, force: true })).toEqual(
					summary({ updated: 1 }),
				);
				expect(reader.reads).toEqual([forced]);
				expect(await findTrackByPath(db, forced)).toMatchObject({
					title: 'Retagged in place',
				});
				expect(await findTrackByPath(db, other)).toMatchObject({ title: '02.mp3' });
				expect(snapshot(forced)).toEqual(before);
			});

			it('keeps a forced unchanged track whose tags cannot be read', async () => {
				const kept = indexedFile('Album/01.mp3');
				await indexedScan();
				reader.unreadable.add(kept);
				const scope: ScanScope = { kind: 'tracks', ids: [await trackId(kept)] };

				expect(await scanLibrary(db, reader, { scope, force: true })).toEqual(
					summary({ skipped: 1 }),
				);
				expect(await findTrackByPath(db, kept)).toMatchObject({ title: '01.mp3' });
			});

			it('reads the whole library again when forced without a scope', async () => {
				indexedFile('Album/01.mp3');
				indexedFile('Other/01.mp3');
				await indexedScan();

				expect(await scanLibrary(db, reader, { force: true })).toEqual(
					summary({ updated: 2 }),
				);
				expect(reader.reads).toHaveLength(2);
			});

			it('does nothing for ids that match no album or track', async () => {
				indexedFile('Album/01.mp3');
				await indexedScan();

				expect(
					await scanLibrary(db, reader, {
						scope: { kind: 'albums', ids: [999] },
						force: true,
					}),
				).toEqual(summary({}));
				expect(
					await scanLibrary(db, reader, {
						scope: { kind: 'tracks', ids: [999] },
						force: true,
					}),
				).toEqual(summary({}));
				expect(reader.reads).toEqual([]);
			});
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

	describe('with a files scope', () => {
		it('adds the files it is given, and only them', async () => {
			const added = file('Band/Album/01.mp3');
			file('Band/Album/02.mp3');

			expect(await scanLibrary(db, reader, files(added))).toEqual(summary({ added: 1 }));
			expect(reader.reads).toEqual([added]);
			expect(await findTrackByPath(db, added)).toMatchObject({ title: '01.mp3' });
			// Both kinds of path name the same file, which is read once
			reader.reads = [];
			expect(
				await scanLibrary(db, reader, {
					...files('Band/Album/02.mp3', 'Band/Album/02.mp3'),
				}),
			).toEqual(summary({ added: 1 }));
			expect(reader.reads).toEqual([path.join(music, 'Band/Album/02.mp3')]);
		});

		it('updates a changed file and leaves an unchanged one', async () => {
			const changed = file('Album/01.mp3');
			const same = file('Album/02.mp3');
			await indexedScan();
			retag(changed);

			expect(await scanLibrary(db, reader, files(changed, same))).toEqual(
				summary({ updated: 1, unchanged: 1 }),
			);
			expect(await findTrackByPath(db, changed)).toMatchObject({ title: 'Retagged' });
		});

		it('skips and counts a path outside the library, missing or not audio', async () => {
			const outside = file('Album/01.mp3', 'audio', otherMusic);
			const text = file('Album/notes.txt');
			const hidden = file('.hidden/01.mp3');

			expect(
				await scanLibrary(
					db,
					reader,
					files(outside, text, hidden, path.join(music, 'gone.mp3'), '../escape.mp3'),
				),
			).toEqual(summary({ skipped: 5 }));
			expect(reader.reads).toEqual([]);
			expect(await findTrackByPath(db, outside)).toBeUndefined();
		});

		it('never follows a link out of the library', async () => {
			file('Album/01.mp3', 'audio', otherMusic);
			// A junction needs no privilege on Windows, and is a plain link elsewhere
			symlinkSync(otherMusic, path.join(music, 'Linked'), 'junction');

			expect(
				await scanLibrary(db, reader, files(path.join(music, 'Linked', 'Album', '01.mp3'))),
			).toEqual(summary({ skipped: 1 }));
			expect(reader.reads).toEqual([]);
		});

		it('never removes a track, even one whose file is gone or unreadable', async () => {
			const gone = file('Album/01.mp3');
			const broken = file('Album/02.mp3');
			await indexedScan();
			rmSync(gone);
			writeFileSync(broken, 'now broken');
			reader.unreadable.add(broken);

			expect(await scanLibrary(db, reader, files(gone, broken))).toEqual(
				summary({ skipped: 2 }),
			);
			expect(await findTrackByPath(db, gone)).toBeDefined();
			expect(await findTrackByPath(db, broken)).toBeDefined();
		});

		it('waits for a running scan before indexing, rather than being refused', async () => {
			const first = file('Album/01.mp3');
			const second = file('Album/02.mp3');
			const { promise, resolve: release } = Promise.withResolvers<void>();
			reader.gate = promise;

			const running = scanLibrary(db, reader);
			const waiting = indexLibraryFiles(db, reader, [second]);
			release();

			expect(await running).toEqual(summary({ added: 2 }));
			expect(await waiting).toEqual(summary({ unchanged: 1 }));
			expect(await findTrackByPath(db, first)).toBeDefined();
		});
	});

	it('refuses a scoped scan while a full one runs', async () => {
		file('Album/01.mp3');
		const { promise, resolve: release } = Promise.withResolvers<void>();
		reader.gate = promise;

		const first = scanLibrary(db, reader);
		const scope: ScanScope = { kind: 'tracks', ids: [1] };
		expect((await scanError(scanLibrary(db, reader, { scope }))).reason).toBe('scan-running');
		release();
		await first;
	});
});

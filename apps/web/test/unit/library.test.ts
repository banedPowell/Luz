import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { trackTagsSchema, type TrackTags } from '@luz/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openDatabase, type Database } from '../../server/infrastructure/database/client';
import {
	deleteTrack,
	deleteTracks,
	findTrackByPath,
	insertTrack,
	listIndexedFiles,
	updateTrack,
	type TrackFile,
} from '../../server/infrastructure/database/library-repository';
import { applyMigrations, loadMigrations } from '../../server/infrastructure/database/migrations';
import { albums, artists, tracks } from '../../server/infrastructure/database/schema';
import { readMigrationsFolder, removeWhenReleased } from './support/database';

function trackFile(filePath: string, tags: Partial<TrackTags> = {}): TrackFile {
	return {
		path: filePath,
		fileSize: 1024,
		modifiedAtMs: 1_700_000_000_000,
		tags: trackTagsSchema.parse(tags),
	};
}

// Drizzle wraps the libSQL error, whose message names the failed constraint; keep only
// that message, as libSQL errors carry native details that make failures hard to read
async function errorMessage(promise: Promise<unknown>): Promise<string> {
	try {
		await promise;
	} catch (error) {
		const cause = error instanceof Error ? error.cause : undefined;
		return cause instanceof Error ? cause.message : String(error);
	}
	throw new Error('Expected the promise to reject');
}

describe('library repository', () => {
	let dataDir: string;
	let db: Database;

	beforeEach(async () => {
		dataDir = mkdtempSync(path.join(tmpdir(), 'luz-test-'));
		db = openDatabase(dataDir);
		await applyMigrations(db.$client, await loadMigrations(readMigrationsFolder));
	});

	afterEach(async () => {
		db.$client.close();
		await removeWhenReleased(dataDir);
	});

	async function groups() {
		return {
			artists: (await db.select().from(artists)).map((row) => row.name),
			albums: (await db.select().from(albums)).map((row) => row.title),
		};
	}

	it('stores a track with its album and artist', async () => {
		const track = await insertTrack(
			db,
			trackFile('/music/a/1.flac', {
				title: 'Come Together',
				artists: ['The Beatles'],
				album: 'Abbey Road',
				trackNumber: 1,
				discNumber: 1,
				year: 1969,
				genre: 'Rock',
				durationMs: 259_000,
			}),
		);

		expect(track).toEqual({
			id: expect.any(Number),
			path: '/music/a/1.flac',
			title: 'Come Together',
			artists: 'The Beatles',
			trackNumber: 1,
			discNumber: 1,
			year: 1969,
			genre: 'Rock',
			durationMs: 259_000,
			fileSize: 1024,
			modifiedAtMs: 1_700_000_000_000,
			album: { id: expect.any(Number), title: 'Abbey Road' },
			artist: { id: expect.any(Number), name: 'The Beatles' },
		});
		expect(await findTrackByPath(db, '/music/a/1.flac')).toEqual(track);
	});

	it('groups tracks of one album, ignoring case', async () => {
		const first = await insertTrack(
			db,
			trackFile('/m/1.mp3', { artists: ['A'], albumArtist: 'Band', album: 'Live' }),
		);
		const second = await insertTrack(
			db,
			trackFile('/m/2.mp3', { artists: ['B'], albumArtist: 'band', album: 'LIVE' }),
		);

		expect(second.album).toEqual(first.album);
		expect(second.artist).toEqual({ id: first.artist.id, name: 'Band' });
		expect(await groups()).toEqual({ artists: ['Band'], albums: ['Live'] });
	});

	it('keeps albums of the same title apart across artists', async () => {
		const first = await insertTrack(
			db,
			trackFile('/m/1.mp3', { artists: ['A'], album: 'Greatest Hits' }),
		);
		const second = await insertTrack(
			db,
			trackFile('/m/2.mp3', { artists: ['B'], album: 'Greatest Hits' }),
		);

		expect(second.album.id).not.toBe(first.album.id);
	});

	it('groups untagged tracks under the unknown artist and album', async () => {
		const first = await insertTrack(db, trackFile('/m/1.ogg'));
		const second = await insertTrack(db, trackFile('/m/2.ogg', { artists: [' '] }));

		expect(first.artist).toEqual({ id: expect.any(Number), name: null });
		expect(first.album).toEqual({ id: expect.any(Number), title: null });
		expect(second.album).toEqual(first.album);
		expect(await findTrackByPath(db, '/m/1.ogg')).toMatchObject({ title: null, artists: null });
	});

	it('rejects a second track with the same path', async () => {
		await insertTrack(db, trackFile('/m/1.mp3', { album: 'One' }));

		expect(
			await errorMessage(insertTrack(db, trackFile('/m/1.mp3', { album: 'Two' }))),
		).toMatch(/UNIQUE constraint failed: tracks\.path/);
		// The rolled back insert leaves no album behind
		expect(await groups()).toEqual({ artists: [null], albums: ['One'] });
	});

	it('returns undefined for an unknown path', async () => {
		expect(await findTrackByPath(db, '/m/missing.mp3')).toBeUndefined();
	});

	it('updates the tags and file details of a track', async () => {
		const inserted = await insertTrack(
			db,
			trackFile('/m/1.mp3', { title: 'Old', artists: ['A'] }),
		);

		const updated = await updateTrack(db, {
			...trackFile('/m/1.mp3', { title: 'New', artists: ['A', 'B'] }),
			fileSize: 2048,
			modifiedAtMs: 1_800_000_000_000,
		});

		expect(updated).toMatchObject({
			id: inserted.id,
			title: 'New',
			artists: 'A, B',
			fileSize: 2048,
			modifiedAtMs: 1_800_000_000_000,
			album: inserted.album,
			artist: inserted.artist,
		});
	});

	it('drops the album and artist a track leaves on update', async () => {
		await insertTrack(db, trackFile('/m/1.mp3', { artists: ['A'], album: 'Old' }));
		await insertTrack(db, trackFile('/m/2.mp3', { artists: ['B'], album: 'Kept' }));

		const updated = await updateTrack(
			db,
			trackFile('/m/1.mp3', { artists: ['B'], album: 'New' }),
		);

		expect(updated?.artist.name).toBe('B');
		expect(await groups()).toEqual({ artists: ['B'], albums: ['Kept', 'New'] });
	});

	it('returns undefined and creates nothing when updating an unknown path', async () => {
		expect(
			await updateTrack(db, trackFile('/m/missing.mp3', { album: 'Ghost' })),
		).toBeUndefined();
		expect(await groups()).toEqual({ artists: [], albums: [] });
	});

	it('deletes a track and the groups it leaves empty', async () => {
		await insertTrack(db, trackFile('/m/1.mp3', { artists: ['A'], album: 'One' }));
		await insertTrack(db, trackFile('/m/2.mp3', { artists: ['A'], album: 'Two' }));

		expect(await deleteTrack(db, '/m/1.mp3')).toBe(true);
		expect(await groups()).toEqual({ artists: ['A'], albums: ['Two'] });

		expect(await deleteTrack(db, '/m/2.mp3')).toBe(true);
		expect(await groups()).toEqual({ artists: [], albums: [] });
		expect(await db.select().from(tracks)).toEqual([]);
	});

	it('returns false when deleting an unknown path', async () => {
		expect(await deleteTrack(db, '/m/missing.mp3')).toBe(false);
	});

	it('deletes several tracks at once, then the groups they leave empty', async () => {
		await insertTrack(db, trackFile('/m/1.mp3', { artists: ['A'], album: 'One' }));
		await insertTrack(db, trackFile('/m/2.mp3', { artists: ['A'], album: 'One' }));
		await insertTrack(db, trackFile('/m/3.mp3', { artists: ['B'], album: 'Two' }));

		expect(await deleteTracks(db, ['/m/1.mp3', '/m/3.mp3', '/m/missing.mp3'])).toBe(2);
		expect(await groups()).toEqual({ artists: ['A'], albums: ['One'] });
		expect(await deleteTracks(db, [])).toBe(0);
	});

	it('deletes more tracks than one statement can bind', async () => {
		const { album } = await insertTrack(db, trackFile('/m/first.mp3', { album: 'Big' }));
		const paths = Array.from({ length: 1200 }, (_, index) => `/m/${index}.mp3`);
		// One insert: a track at a time would take seconds
		await db.insert(tracks).values(
			paths.map((filePath) => ({
				path: filePath,
				albumId: album.id,
				fileSize: 1,
				modifiedAtMs: 1,
			})),
		);
		paths.push('/m/first.mp3');

		expect(await deleteTracks(db, paths)).toBe(1201);
		expect(await groups()).toEqual({ artists: [], albums: [] });
	});

	it('lists the indexed files with the size and time the rescan compares', async () => {
		await insertTrack(db, trackFile('/m/1.mp3'));

		expect(await listIndexedFiles(db)).toEqual([
			{ path: '/m/1.mp3', fileSize: 1024, modifiedAtMs: 1_700_000_000_000 },
		]);
	});

	it('enforces the foreign keys', async () => {
		expect(
			await errorMessage(
				db
					.insert(tracks)
					.values({ path: '/m/1.mp3', albumId: 999, fileSize: 1, modifiedAtMs: 1 }),
			),
		).toMatch(/FOREIGN KEY constraint failed/);
	});
});

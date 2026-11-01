import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
	albumListQuerySchema,
	artistListQuerySchema,
	trackListQuerySchema,
	trackTagsSchema,
	type TrackTags,
} from '@luz/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openDatabase, type Database } from '../../server/infrastructure/database/client';
import { insertTrack } from '../../server/infrastructure/database/library-repository';
import { applyMigrations, loadMigrations } from '../../server/infrastructure/database/migrations';
import {
	browseAlbums,
	browseArtists,
	browseTracks,
	getAlbum,
	getArtist,
} from '../../server/services/library-browse';
import { readMigrationsFolder, removeWhenReleased } from './support/database';

function titles(page: { items: { title: string | null }[] }) {
	return page.items.map((item) => item.title);
}

describe('library browse', () => {
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

	async function add(fileName: string, tags: Partial<TrackTags> = {}) {
		return insertTrack(db, {
			path: path.join(dataDir, 'music', fileName),
			fileSize: 1024,
			modifiedAtMs: 1_700_000_000_000,
			tags: trackTagsSchema.parse(tags),
		});
	}

	// Two artists, three albums, one untagged file; inserted out of order on purpose
	async function addLibrary() {
		await add('b2.flac', {
			title: 'Wave',
			artists: ['Beta'],
			album: 'Beta Two',
			year: 2020,
			trackNumber: 2,
			durationMs: 200_000,
		});
		await add('a1-d2.flac', {
			title: 'echo',
			artists: ['Alpha', 'Guest'],
			albumArtist: 'Alpha',
			album: 'Alpha One',
			year: 2001,
			discNumber: 2,
			trackNumber: 1,
			durationMs: 90_000,
		});
		await add('a1-d1-t2.flac', {
			title: 'Delta',
			artists: ['Alpha'],
			album: 'Alpha One',
			year: 2001,
			discNumber: 1,
			trackNumber: 2,
			durationMs: 120_000,
		});
		await add('a1-d1-t1.flac', {
			title: 'charlie',
			artists: ['Alpha'],
			album: 'Alpha One',
			year: 2001,
			discNumber: 1,
			trackNumber: 1,
			durationMs: 150_000,
		});
		await add('b1.flac', {
			title: 'Bravo',
			artists: ['Beta'],
			album: 'beta one',
			year: 1999,
			trackNumber: 1,
		});
		await add('untagged.mp3');
	}

	function tracks(query: object) {
		return browseTracks(db, trackListQuerySchema.parse(query));
	}

	function albums(query: object) {
		return browseAlbums(db, albumListQuerySchema.parse(query));
	}

	it('returns empty pages for an empty library', async () => {
		expect(await tracks({})).toEqual({ items: [], total: 0, page: 1, pageSize: 50 });
		expect((await browseAlbums(db, albumListQuerySchema.parse({}))).total).toBe(0);
		expect((await browseArtists(db, artistListQuerySchema.parse({}))).total).toBe(0);
	});

	it('sorts tracks by title, ignoring case, untitled last in both directions', async () => {
		await addLibrary();

		expect(titles(await tracks({}))).toEqual([
			'Bravo',
			'charlie',
			'Delta',
			'echo',
			'Wave',
			null,
		]);
		expect(titles(await tracks({ order: 'desc' }))).toEqual([
			'Wave',
			'echo',
			'Delta',
			'charlie',
			'Bravo',
			null,
		]);
	});

	it('names an untitled track after its file and groups it under the unknown entries', async () => {
		await addLibrary();

		const untagged = (await tracks({})).items.at(-1);

		expect(untagged).toMatchObject({
			title: null,
			fileName: 'untagged.mp3',
			album: { title: null },
			artist: { name: null },
		});
		expect(untagged).not.toHaveProperty('path');
	});

	it('sorts tracks by album, keeping disc and track order inside each album', async () => {
		await addLibrary();

		expect(titles(await tracks({ sort: 'album' }))).toEqual([
			'charlie',
			'Delta',
			'echo',
			'Bravo',
			'Wave',
			null,
		]);
		expect(titles(await tracks({ sort: 'album', order: 'desc' }))).toEqual([
			'Wave',
			'Bravo',
			'charlie',
			'Delta',
			'echo',
			null,
		]);
	});

	it('sorts tracks by artist, year and duration', async () => {
		await addLibrary();

		expect(titles(await tracks({ sort: 'artist' }))).toEqual([
			'charlie',
			'Delta',
			'echo',
			'Bravo',
			'Wave',
			null,
		]);
		expect(titles(await tracks({ sort: 'year', order: 'desc' }))).toEqual([
			'Wave',
			'charlie',
			'Delta',
			'echo',
			'Bravo',
			null,
		]);
		expect(titles(await tracks({ sort: 'duration' }))).toEqual([
			'echo',
			'Delta',
			'charlie',
			'Wave',
			'Bravo',
			null,
		]);
	});

	it('cuts pages without overlap and returns the total', async () => {
		await addLibrary();

		const first = await tracks({ pageSize: 4 });
		const second = await tracks({ pageSize: 4, page: 2 });
		const beyond = await tracks({ pageSize: 4, page: 3 });

		expect(first).toMatchObject({ total: 6, page: 1, pageSize: 4 });
		expect(titles(first)).toEqual(['Bravo', 'charlie', 'Delta', 'echo']);
		expect(titles(second)).toEqual(['Wave', null]);
		expect(beyond.items).toEqual([]);
	});

	it('lists albums with their artist, year and track count, sorted', async () => {
		await addLibrary();

		const byTitle = await albums({});
		expect(byTitle.total).toBe(4);
		expect(byTitle.items[0]).toMatchObject({
			title: 'Alpha One',
			artist: { name: 'Alpha' },
			year: 2001,
			trackCount: 3,
		});
		expect(titles(byTitle)).toEqual(['Alpha One', 'beta one', 'Beta Two', null]);
		expect(titles(await albums({ sort: 'year', order: 'desc' }))).toEqual([
			'Beta Two',
			'Alpha One',
			'beta one',
			null,
		]);
		// Same artist: oldest album first, whichever the direction of the artist sort
		expect(titles(await albums({ sort: 'artist', order: 'desc' }))).toEqual([
			'beta one',
			'Beta Two',
			'Alpha One',
			null,
		]);
	});

	it('lists artists by name with their album and track counts', async () => {
		await addLibrary();

		const page = await browseArtists(db, artistListQuerySchema.parse({ order: 'desc' }));

		expect(page.items).toEqual([
			{ id: expect.any(Number), name: 'Beta', albumCount: 2, trackCount: 2 },
			{ id: expect.any(Number), name: 'Alpha', albumCount: 1, trackCount: 3 },
			{ id: expect.any(Number), name: null, albumCount: 1, trackCount: 1 },
		]);
	});

	it('returns an album with its tracks by disc then track number', async () => {
		await addLibrary();
		const [summary] = (await browseAlbums(db, albumListQuerySchema.parse({}))).items;

		const album = await getAlbum(db, summary?.id ?? 0);

		expect(album).toMatchObject({ title: 'Alpha One', trackCount: 3 });
		expect(album?.tracks.map((track) => track.title)).toEqual(['charlie', 'Delta', 'echo']);
		expect(album?.tracks[2]?.artists).toBe('Alpha, Guest');
	});

	it('returns an artist with its albums, oldest first, and their tracks', async () => {
		await addLibrary();
		const beta = (await browseArtists(db, artistListQuerySchema.parse({}))).items[1];

		const artist = await getArtist(db, beta?.id ?? 0);

		expect(artist).toMatchObject({ name: 'Beta', albumCount: 2, trackCount: 2 });
		expect(
			artist?.albums.map((album) => [album.title, album.tracks.map((track) => track.title)]),
		).toEqual([
			['beta one', ['Bravo']],
			['Beta Two', ['Wave']],
		]);
	});

	it('returns nothing for an unknown album or artist', async () => {
		await addLibrary();

		expect(await getAlbum(db, 999)).toBeUndefined();
		expect(await getArtist(db, 999)).toBeUndefined();
	});
});

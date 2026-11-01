import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { librarySearchQuerySchema, trackTagsSchema, type TrackTags } from '@luz/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openDatabase, type Database } from '../../server/infrastructure/database/client';
import {
	fillSearchKeys,
	insertTrack,
	updateTrack,
} from '../../server/infrastructure/database/library-repository';
import { applyMigrations, loadMigrations } from '../../server/infrastructure/database/migrations';
import { searchLibrary } from '../../server/services/library-search';
import { readMigrationsFolder, removeWhenReleased } from './support/database';

describe('library search', () => {
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

	function file(fileName: string, tags: Partial<TrackTags>) {
		return {
			path: path.join(dataDir, 'music', fileName),
			fileSize: 1024,
			modifiedAtMs: 1_700_000_000_000,
			tags: trackTagsSchema.parse(tags),
		};
	}

	async function add(fileName: string, tags: Partial<TrackTags> = {}) {
		return insertTrack(db, file(fileName, tags));
	}

	function search(q: string) {
		return searchLibrary(db, librarySearchQuerySchema.parse({ q }));
	}

	async function addLibrary() {
		await add('1.flac', { title: 'Déjà Vu', artists: ['Beyoncé'], album: 'B’Day' });
		await add('2.flac', { title: 'Crazy in Love', artists: ['Beyoncé'], album: 'Dangerously' });
		await add('3.flac', { title: 'Hoppípolla', artists: ['Sigur Rós'], album: 'Takk...' });
		await add('4.flac', { title: 'Glósóli', artists: ['Sigur Rós'], album: 'Takk...' });
		await add('5.mp3');
	}

	it('ignores case and accents in both the query and the names', async () => {
		await addLibrary();

		const result = await search('BEYONCE');
		expect(result.artists.items.map((artist) => artist.name)).toEqual(['Beyoncé']);
		expect(result.artists.items[0]).toMatchObject({ albumCount: 2, trackCount: 2 });
		expect((await search('déja vu')).tracks.items.map((track) => track.title)).toEqual([
			'Déjà Vu',
		]);
		expect((await search('rós')).artists.total).toBe(1);
	});

	it('finds partial words anywhere in a name, starting matches first', async () => {
		await addLibrary();
		await add('6.flac', { title: 'Lovely', artists: ['Other'], album: 'Love Songs' });

		const result = await search('lov');
		expect(result.tracks.items.map((track) => track.title)).toEqual([
			'Lovely',
			'Crazy in Love',
		]);
		expect(result.albums.items.map((album) => album.title)).toEqual(['Love Songs']);
		expect((await search('ppip')).tracks.items.map((track) => track.title)).toEqual([
			'Hoppípolla',
		]);
	});

	it('groups tracks, albums and artists with what links them to the browse views', async () => {
		await addLibrary();

		const result = await search('takk');
		expect(result.tracks.total).toBe(0);
		expect(result.albums.items).toEqual([
			expect.objectContaining({
				title: 'Takk...',
				artist: expect.objectContaining({ name: 'Sigur Rós' }),
				trackCount: 2,
			}),
		]);
		const track = (await search('glosoli')).tracks.items[0];
		expect(track).toMatchObject({ album: { title: 'Takk...' }, artist: { name: 'Sigur Rós' } });
		expect(track).not.toHaveProperty('path');
	});

	it('limits each group and still counts every match', async () => {
		for (let index = 1; index <= 12; index += 1) {
			await add(`${index}.flac`, {
				title: `Song ${index}`,
				artists: ['Band'],
				album: 'Songs',
			});
		}

		const result = await search('song');
		expect(result.tracks.items).toHaveLength(10);
		expect(result.tracks.total).toBe(12);
		expect(result.albums.total).toBe(1);
	});

	it('counts the tracks of the first albums and artists only once they are picked', async () => {
		// Two tracks for odd numbers, one for even ones; "Best Mix" sorts after the
		// names that start with the query, so it falls outside the first ten
		const numbers = Array.from({ length: 11 }, (_, index) =>
			String(index + 1).padStart(2, '0'),
		);
		for (const number of numbers) {
			const tracks = Number(number) % 2 === 1 ? 2 : 1;
			for (let disc = 1; disc <= tracks; disc += 1) {
				await add(`${number}-${disc}.flac`, {
					title: `Track ${number}`,
					artists: [`Mix Band ${number}`],
					album: `Mix ${number}`,
				});
			}
		}
		await add('best.flac', { title: 'Track', artists: ['Best Mix Band'], album: 'Best Mix' });

		const result = await search('mix');
		expect(result.albums.total).toBe(12);
		expect(result.albums.items.map((album) => [album.title, album.trackCount])).toEqual(
			numbers
				.slice(0, 10)
				.map((number) => [`Mix ${number}`, Number(number) % 2 === 1 ? 2 : 1]),
		);
		expect(result.artists.total).toBe(12);
		expect(result.artists.items.map((artist) => [artist.name, artist.trackCount])).toEqual(
			numbers
				.slice(0, 10)
				.map((number) => [`Mix Band ${number}`, Number(number) % 2 === 1 ? 2 : 1]),
		);
	});

	it('takes wildcards literally', async () => {
		await add('1.flac', { title: '100% Pure', artists: ['A_B'] });
		await add('2.flac', { title: '1000 Pure', artists: ['AxB'] });

		expect((await search('100%')).tracks.items.map((track) => track.title)).toEqual([
			'100% Pure',
		]);
		expect((await search('a_b')).artists.items.map((artist) => artist.name)).toEqual(['A_B']);
	});

	it('returns nothing for an empty query, or one that normalises to nothing', async () => {
		await addLibrary();

		for (const q of ['', '   ', '́']) {
			const result = await search(q);
			expect(result.tracks).toEqual({ items: [], total: 0 });
			expect(result.albums).toEqual({ items: [], total: 0 });
			expect(result.artists).toEqual({ items: [], total: 0 });
		}
		expect((await search('  vu ')).query).toBe('vu');
	});

	it('follows a retagged track, and never matches untagged names', async () => {
		await addLibrary();
		await updateTrack(db, file('1.flac', { title: 'Ring the Alarm', artists: ['Beyoncé'] }));

		expect((await search('deja')).tracks.total).toBe(0);
		expect((await search('alarm')).tracks.total).toBe(1);
		expect((await search('unknown')).albums.total).toBe(0);
	});

	it('fills the search keys of rows indexed before the columns existed', async () => {
		await addLibrary();
		await db.$client.executeMultiple(
			'update tracks set search_title = null; update albums set search_title = null; update artists set search_name = null;',
		);
		expect((await search('beyonce')).artists.total).toBe(0);

		// Four titled tracks, three titled albums, two named artists
		expect(await fillSearchKeys(db)).toBe(9);
		expect((await search('beyonce')).artists.total).toBe(1);
		expect((await search('hoppipolla')).tracks.total).toBe(1);
		expect(await fillSearchKeys(db)).toBe(0);
	});
});

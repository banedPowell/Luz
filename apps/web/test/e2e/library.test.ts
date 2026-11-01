import { copyFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AlbumSummary, LibraryPage, LibrarySearchResult, TrackSummary } from '@luz/core';
import { $fetch, createPage, fetch, setup } from '@nuxt/test-utils/e2e';
import { afterAll, describe, expect, it } from 'vitest';
import { sharedBuild } from './build';

const fixtures = fileURLToPath(new URL('../fixtures/audio', import.meta.url));

// Temporary folders only: the data directory and a music folder copied from the fixtures
const dataDir = mkdtempSync(path.join(tmpdir(), 'luz-e2e-'));
const music = mkdtempSync(path.join(tmpdir(), 'luz-e2e-music-'));
const album = path.join(music, 'Luz Test Band', 'Luz Fixtures');
mkdirSync(album, { recursive: true });
for (const file of ['tone.flac', 'tone.mp3', 'tone.m4a', 'tone.ogg', 'tone.opus', 'corrupt.m4a']) {
	copyFileSync(path.join(fixtures, file), path.join(album, file));
}

afterAll(() => {
	rmSync(dataDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
	rmSync(music, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
});

describe('library browsing', async () => {
	await setup({
		...sharedBuild,
		env: { NUXT_DATA_DIR: dataDir },
		browser: true,
	});

	it('scans the folder from the empty library, then browses albums and artists', async () => {
		await $fetch('/api/settings', { method: 'PATCH', body: { musicLibraryPath: music } });
		const page = await createPage('/library');

		const empty = page.getByText('Your library is empty');
		await empty.waitFor();
		await page.getByRole('button', { name: 'Scan library' }).last().click();
		await page.getByText('5 tracks', { exact: true }).waitFor();
		await empty.waitFor({ state: 'detached' });

		await page.getByRole('link', { name: 'Albums', exact: true }).click();
		await page.waitForURL('**/library/albums');
		// The tracks view links to the album too: wait for the albums view to replace it
		await page.getByText('1 album', { exact: true }).waitFor();
		await page.getByRole('link', { name: 'Luz Fixtures' }).click();
		await page.waitForURL('**/library/albums/*');
		await page.getByRole('heading', { level: 2, name: 'Luz Fixtures' }).waitFor();
		expect(await page.getByRole('row', { name: /Fixture Tone/ }).count()).toBe(5);

		await page.getByRole('link', { name: 'Luz Test Band' }).click();
		await page.waitForURL('**/library/artists/*');
		await page.getByRole('heading', { level: 2, name: 'Luz Test Band' }).waitFor();
		expect(await page.getByText('1 album · 5 tracks').count()).toBe(1);

		await page.close();
	});

	it('keeps the sort in the URL, so a reload shows the same view', async () => {
		const page = await createPage('/library/albums?sort=year&order=desc');

		const reverse = page.getByRole('link', { name: /^Sort order: descending/ });
		expect(await reverse.getAttribute('href')).toBe('/library/albums?sort=year&order=asc');
		await reverse.click();
		await page.waitForURL('**/library/albums?sort=year&order=asc');
		await page.reload();
		await page.getByRole('link', { name: /^Sort order: ascending/ }).waitFor();

		await page.getByRole('columnheader', { name: 'Album' }).getByRole('link').click();
		await page.waitForURL('**/library/albums?sort=title&order=asc');
		await page.locator('th[aria-sort="ascending"]', { hasText: 'Album' }).waitFor();

		await page.close();
	});

	it('sorts and pages tracks in the API, and rejects unknown sort keys', async () => {
		const tracks = await $fetch<LibraryPage<TrackSummary>>('/api/library/tracks', {
			query: { sort: 'duration', order: 'desc', pageSize: 2, page: 3 },
		});
		expect(tracks).toMatchObject({ total: 5, page: 3, pageSize: 2 });
		expect(tracks.items).toHaveLength(1);

		const albums = await $fetch<LibraryPage<AlbumSummary>>('/api/library/albums');
		expect(albums.items).toMatchObject([
			{ title: 'Luz Fixtures', artist: { name: 'Luz Test Band' }, year: 2024, trackCount: 5 },
		]);

		expect((await fetch('/api/library/albums?sort=duration')).status).toBe(400);
		expect((await fetch('/api/library/artists/999')).status).toBe(404);
	});

	it('searches from the field of the library, keeping the query in the URL', async () => {
		const page = await createPage('/library/albums');

		const field = page.getByRole('searchbox', { name: 'Search the library' });
		await page.getByText('1 album', { exact: true }).waitFor();
		await field.focus();
		await page.keyboard.type('fîxture TONE');
		await page.waitForURL('**/library/search?q=f%C3%AExture+TONE');
		await page.getByText('5 tracks', { exact: true }).waitFor();
		await page.reload();
		await page.getByRole('heading', { level: 2, name: 'Tracks' }).waitFor();
		expect(await field.inputValue()).toBe('fîxture TONE');

		await field.fill('nothing like this');
		await page.getByText('No results for “nothing like this”').waitFor();

		await page.close();
	});

	it('matches partial names in the API, and rejects a query too long', async () => {
		const result = await $fetch<LibrarySearchResult>('/api/library/search', {
			query: { q: ' TEST BÄND ' },
		});
		expect(result.query).toBe('TEST BÄND');
		expect(result.artists.items).toMatchObject([{ name: 'Luz Test Band', trackCount: 5 }]);
		expect(result.albums.total).toBe(0);

		expect((await fetch(`/api/library/search?q=${'a'.repeat(101)}`)).status).toBe(400);
	});
});

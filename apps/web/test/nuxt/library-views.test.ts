import type {
	AlbumDetail,
	AlbumSummary,
	ArtistDetail,
	ArtistSummary,
	LibraryPage,
	TrackSummary,
} from '@luz/core';
import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime';
import { NuxtPage, UApp } from '#components';
import { getQuery } from 'h3';
import { beforeEach, describe, expect, it } from 'vitest';
import { defineComponent, h } from 'vue';

// The sort select opens a popover, which needs the providers of UApp
const LibraryPages = defineComponent({
	render: () => h(UApp, null, () => h(NuxtPage)),
});

const alpha = { id: 1, name: 'Alpha' };
const alphaOne = { id: 10, title: 'Alpha One' };

function track(id: number, overrides: Partial<TrackSummary> = {}): TrackSummary {
	return {
		id,
		title: `Track ${id}`,
		fileName: `${id}.flac`,
		artists: 'Alpha',
		trackNumber: id,
		discNumber: 1,
		year: 2001,
		durationMs: 61_000,
		album: alphaOne,
		artist: alpha,
		...overrides,
	};
}

function pageOf<T>(items: T[], total = items.length): LibraryPage<T> {
	return { items, total, page: 1, pageSize: 50 };
}

let trackPage: LibraryPage<TrackSummary>;
let albumPage: LibraryPage<AlbumSummary>;
let artistPage: LibraryPage<ArtistSummary>;
let album: AlbumDetail;
let artist: ArtistDetail;
const queries: Record<string, unknown>[] = [];

registerEndpoint('/api/settings', {
	method: 'GET',
	handler: () => ({ theme: 'system', musicLibraryPath: '/music' }),
});
registerEndpoint('/api/library/tracks', {
	method: 'GET',
	handler: (event) => {
		queries.push(getQuery(event));
		return trackPage;
	},
});
registerEndpoint('/api/library/albums', { method: 'GET', handler: () => albumPage });
registerEndpoint('/api/library/artists', { method: 'GET', handler: () => artistPage });
registerEndpoint('/api/library/albums/10', { method: 'GET', handler: () => album });
registerEndpoint('/api/library/artists/1', { method: 'GET', handler: () => artist });

async function mountAt(route: string) {
	await useSettings().load();
	return mountSuspended(LibraryPages, { route });
}

describe('library views', () => {
	beforeEach(() => {
		clearNuxtState();
		queries.length = 0;
		trackPage = pageOf([
			track(1),
			track(2, {
				title: null,
				fileName: 'untagged.mp3',
				artists: null,
				year: null,
				durationMs: null,
				album: { id: 11, title: null },
				artist: { id: 2, name: null },
			}),
		]);
		albumPage = pageOf([
			{ ...alphaOne, artist: alpha, year: 2001, trackCount: 3 },
			{ id: 11, title: null, artist: { id: 2, name: null }, year: null, trackCount: 1 },
		]);
		artistPage = pageOf([{ ...alpha, albumCount: 1, trackCount: 3 }]);
		album = {
			...alphaOne,
			artist: alpha,
			year: 2001,
			trackCount: 3,
			tracks: [
				track(1),
				track(2),
				track(3, { discNumber: 2, trackNumber: 1, artists: 'Alpha, Guest' }),
			],
		};
		artist = { ...alpha, albumCount: 1, trackCount: 3, albums: [album] };
	});

	it('lists tracks with their artist and album, naming untagged values', async () => {
		const wrapper = await mountAt('/library');

		expect(wrapper.text()).toContain('2 tracks');
		expect(wrapper.text()).toContain('Track 1');
		expect(wrapper.text()).toContain('1:01');
		expect(wrapper.text()).toContain('untagged.mp3');
		expect(wrapper.text()).toContain('Unknown artist');
		expect(wrapper.find('a[href="/library/albums/11"]').text()).toBe('Unknown album');
	});

	it('asks the API for the sort and page of the URL, and links to the reverse order', async () => {
		const wrapper = await mountAt('/library?sort=year&order=desc&page=2');

		expect(queries.at(-1)).toMatchObject({ sort: 'year', order: 'desc', page: '2' });
		const reverse = wrapper.find('a[aria-label^="Sort order: descending"]');
		// Reversing the order goes back to the first page
		expect(reverse.attributes('href')).toBe('/library?sort=year&order=asc');
	});

	it('falls back to the default sort when the URL holds an invalid one', async () => {
		await mountAt('/library?sort=colour');

		expect(queries.at(-1)).toMatchObject({ sort: 'title', order: 'asc', page: '1' });
	});

	it('paginates with links that keep the sort', async () => {
		trackPage = pageOf([track(1)], 120);

		const wrapper = await mountAt('/library?sort=album');

		expect(wrapper.text()).toContain('120 tracks');
		expect(wrapper.find('a[href="/library?sort=album&page=3"]').exists()).toBe(true);
	});

	it('hides the pagination when everything fits on one page', async () => {
		const wrapper = await mountAt('/library');

		expect(wrapper.find('a[href*="page="]').exists()).toBe(false);
	});

	it('points an empty library to the scan', async () => {
		trackPage = pageOf([]);

		const wrapper = await mountAt('/library');

		expect(wrapper.text()).toContain('Your library is empty');
		expect(
			wrapper.findAll('button').filter((button) => button.text() === 'Scan library'),
		).toHaveLength(2);
	});

	it('lists albums linking to the album and its artist', async () => {
		const wrapper = await mountAt('/library/albums');

		expect(wrapper.text()).toContain('2 albums');
		expect(wrapper.find('a[href="/library/albums/10"]').text()).toBe('Alpha One');
		expect(wrapper.find('a[href="/library/artists/1"]').text()).toBe('Alpha');
		expect(wrapper.find('a[href="/library/artists/2"]').text()).toBe('Unknown artist');
	});

	it('lists artists with their counts', async () => {
		const wrapper = await mountAt('/library/artists');

		expect(wrapper.text()).toContain('1 artist');
		expect(wrapper.find('a[href="/library/artists/1"]').text()).toBe('Alpha');
	});

	it('shows an album with its tracks numbered by disc when it has several', async () => {
		const wrapper = await mountAt('/library/albums/10');

		expect(wrapper.find('h2#album-title').text()).toBe('Alpha One');
		expect(wrapper.text()).toContain('2001');
		const rows = wrapper.findAll('tbody tr').map((row) => row.text());
		expect(rows[0]).toContain('1.1');
		expect(rows[2]).toContain('2.1');
		expect(rows[2]).toContain('Alpha, Guest');
	});

	it('shows an artist with each album and its tracks', async () => {
		const wrapper = await mountAt('/library/artists/1');

		expect(wrapper.find('h2#artist-name').text()).toBe('Alpha');
		expect(wrapper.text()).toContain('1 album · 3 tracks');
		expect(wrapper.find('h3 a[href="/library/albums/10"]').text()).toBe('Alpha One');
		expect(wrapper.findAll('tbody tr')).toHaveLength(3);
	});

	it('marks the view of a detail page as current', async () => {
		const wrapper = await mountAt('/library/albums/10');

		const views = wrapper.find('nav[aria-label="Library views"]');
		expect(views.find('[aria-current="page"]').text()).toBe('Albums');
	});
});

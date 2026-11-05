import type {
	AlbumDetail,
	AlbumSummary,
	ArtistDetail,
	ArtistSummary,
	LibraryPage,
	TrackDetail,
	TrackSummary,
} from '@luz/core';
import { cassetteColor } from '@luz/core';
import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime';
import { NuxtPage, UApp } from '#components';
import { createError, getQuery, readBody } from 'h3';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h, nextTick } from 'vue';

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
		path: `/music/Alpha/Alpha One/${id}.flac`,
		fileName: `${id}.flac`,
		artists: 'Alpha',
		trackNumber: id,
		discNumber: 1,
		year: 2001,
		durationMs: 61_000,
		codec: 'FLAC',
		bitrate: 900_000,
		addedAtMs: Date.UTC(2026, 0, 15, 12),
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
let detail: TrackDetail | undefined;
// Set to make the track endpoint fail with this message
let detailFailure: string | undefined;
const queries: Record<string, unknown>[] = [];
const scanRequests: unknown[] = [];
let scanRefused = false;
// Set to make the album page find no album, as after a rescan that emptied it
let albumGone = false;

registerEndpoint('/api/settings', {
	method: 'GET',
	handler: () => ({ musicLibraryPath: '/music' }),
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
registerEndpoint('/api/library/albums/10', {
	method: 'GET',
	handler: () => {
		if (albumGone) {
			throw createError({ statusCode: 404, message: 'No such album' });
		}
		return album;
	},
});
registerEndpoint('/api/library/scan', {
	method: 'POST',
	handler: async (event) => {
		scanRequests.push(await readBody(event));
		if (scanRefused) {
			throw createError({ statusCode: 409, data: { reason: 'scan-running' } });
		}
		return { added: 0, updated: 2, removed: 1, unchanged: 0, skipped: 0 };
	},
});
registerEndpoint('/api/library/artists/1', { method: 'GET', handler: () => artist });
registerEndpoint('/api/library/tracks/1', {
	method: 'GET',
	handler: () => {
		if (detailFailure) {
			throw createError({ statusCode: 500, message: detailFailure });
		}
		if (!detail) {
			throw createError({ statusCode: 404, message: 'No such track' });
		}
		return detail;
	},
});

function trackDetail(overrides: Partial<TrackDetail> = {}): TrackDetail {
	return {
		...track(1),
		path: '/music/Alpha/Alpha One/01 Track 1.mp3',
		fileName: '01 Track 1.mp3',
		genre: null,
		fileSize: 4_234_567,
		modifiedAtMs: 1_700_000_000_000,
		codec: 'MP3',
		codecProfile: 'V0',
		lossless: false,
		bitrate: 245_872,
		sampleRate: 44_100,
		bitDepth: null,
		channels: 2,
		...overrides,
	};
}

// The menu and the window open in a portal outside the mounted page
async function chooseFromMenu(
	wrapper: Awaited<ReturnType<typeof mountAt>>,
	title: string,
	label: string,
) {
	await wrapper.find(`button[aria-label="More actions for ${title}"]`).trigger('click');
	await vi.waitFor(() => {
		const item = [...document.querySelectorAll('[role="menuitem"]')].find(
			(element) => element.textContent?.trim() === label,
		);
		if (!(item instanceof HTMLElement)) {
			throw new Error('The menu is not open');
		}
		item.click();
	});
}

async function openDetails(wrapper: Awaited<ReturnType<typeof mountAt>>, title: string) {
	await wrapper.find(`button[aria-label="Show details of ${title}"]`).trigger('click');
	await nextTick();
	return vi.waitFor(() => {
		const dialog = document.querySelector('[role="dialog"]');
		if (!dialog?.textContent?.includes('File')) {
			throw new Error('The details are not loaded');
		}
		return dialog;
	});
}

async function mountAt(route: string) {
	await useSettings().load();
	return mountSuspended(LibraryPages, { route });
}

describe('library views', () => {
	beforeEach(() => {
		clearNuxtState();
		queries.length = 0;
		scanRequests.length = 0;
		scanRefused = false;
		albumGone = false;
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
			{ ...alphaOne, artist: alpha, year: 2001, trackCount: 3, quality: 'lossless' },
			{
				id: 11,
				title: null,
				artist: { id: 2, name: null },
				year: null,
				trackCount: 1,
				quality: 'mixed',
			},
		]);
		artistPage = pageOf([{ ...alpha, albumCount: 1, trackCount: 3 }]);
		album = {
			...alphaOne,
			artist: alpha,
			year: 2001,
			trackCount: 3,
			quality: 'lossless',
			folders: [
				{ path: '/music/Alpha/Alpha One/CD1', relativePath: 'Alpha/Alpha One/CD1' },
				{ path: '/elsewhere/Alpha One', relativePath: null },
			],
			tracks: [
				track(1),
				track(2),
				track(3, { discNumber: 2, trackNumber: 1, artists: 'Alpha, Guest' }),
			],
		};
		artist = { ...alpha, albumCount: 1, trackCount: 3, albums: [album] };
		detail = trackDetail();
		detailFailure = undefined;
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

	it('sorts by a column from its header, reversing the column already sorted', async () => {
		const wrapper = await mountAt('/library?sort=added&order=asc&page=2');

		const header = (name: string) => wrapper.findAll('th').find((cell) => cell.text() === name);
		expect(header('Date added')?.attributes('aria-sort')).toBe('ascending');
		expect(header('Title')?.attributes('aria-sort')).toBe('none');
		// Both links go back to the first page
		expect(header('Date added')?.find('a').attributes('href')).toBe(
			'/library?sort=added&order=desc',
		);
		expect(header('Album')?.find('a').attributes('href')).toBe('/library?sort=album&order=asc');
	});

	it('shows the tracks with their artist under the title, then album, duration and date added', async () => {
		const wrapper = await mountAt('/library?page=2');

		expect(wrapper.findAll('thead th').map((cell) => cell.text())).toEqual([
			'#',
			'Title',
			'Album',
			'Duration',
			'Date added',
			'Actions',
		]);
		const cells = wrapper.findAll('tbody tr')[0]?.findAll('td') ?? [];
		// Numbered across pages
		expect(cells[0]?.text()).toBe('51');
		const title = cells[1]?.findAll('span[title]') ?? [];
		expect(title.map((line) => [line.text(), line.attributes('title')])).toEqual([
			['Track 1', 'Track 1'],
			['Alpha', 'Alpha'],
		]);
		expect(cells[4]?.text()).toBe(
			new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(
				Date.UTC(2026, 0, 15, 12),
			),
		);
	});

	it('groups the sort selector with its order button, still sorting by artist', async () => {
		const wrapper = await mountAt('/library?sort=artist&order=desc');

		const group = wrapper.find('[role="group"][aria-label="Sort"]');
		expect(group.find('[aria-label="Sort by"]').text()).toContain('Artist');
		expect(group.find('a[aria-label^="Sort order: descending"]').text()).toBe('Descending');
		expect(queries.at(-1)).toMatchObject({ sort: 'artist', order: 'desc' });
	});

	it('marks a descending column, and leaves unsortable columns plain', async () => {
		const wrapper = await mountAt('/library/albums?sort=artist&order=desc');

		const cells = wrapper.findAll('th');
		const byArtist = cells.find((cell) => cell.text() === 'Artist');
		expect(byArtist?.attributes('aria-sort')).toBe('descending');
		expect(byArtist?.find('a').attributes('href')).toBe(
			'/library/albums?sort=artist&order=asc',
		);
		const tracks = cells.find((cell) => cell.text() === 'Tracks');
		expect(tracks?.attributes('aria-sort')).toBeUndefined();
		expect(tracks?.find('a').exists()).toBe(false);
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

	it('truncates album titles and artists so the table fits the screen, the full text on hover', async () => {
		const wrapper = await mountAt('/library/albums');

		const row = wrapper.find('tbody tr');
		const title = row.find('a[href="/library/albums/10"]');
		expect(title.attributes('title')).toBe('Alpha One');
		expect(title.classes()).toContain('truncate');
		// The cells shrink to the room left instead of widening the table
		const cells = row.findAll('td');
		expect(cells[0]?.classes()).toContain('max-w-0');
		expect(cells[1]?.classes()).toEqual(expect.arrayContaining(['max-w-0', 'hidden']));
		// Under the title on narrow screens, in its own column from sm up
		const artists = row.findAll('a[href="/library/artists/1"]');
		expect(artists.map((link) => link.classes())).toEqual([
			expect.arrayContaining(['truncate', 'sm:hidden']),
			expect.arrayContaining(['truncate']),
		]);
		expect(artists.map((link) => link.attributes('title'))).toEqual(['Alpha', 'Alpha']);
		expect(wrapper.find('thead th:nth-child(2)').classes()).toContain('hidden');
	});

	it('shows the quality of each album in the list', async () => {
		const wrapper = await mountAt('/library/albums');

		const rows = wrapper.findAll('tbody tr').map((row) => row.text());
		expect(rows[0]).toContain('Lossless');
		expect(rows[1]).toContain('Mixed');
	});

	it('shows no quality badge while an album has tracks of unknown codec', async () => {
		albumPage = pageOf([
			{ ...alphaOne, artist: alpha, year: 2001, trackCount: 3, quality: null },
		]);

		const wrapper = await mountAt('/library/albums');

		const row = wrapper.find('tbody tr').text();
		expect(row).not.toContain('Lossless');
		expect(row).not.toContain('Mixed');
	});

	it('offers a table and grid switch on the album list, the table first', async () => {
		const wrapper = await mountAt('/library/albums?sort=year&page=2');

		const group = wrapper.find('[role="group"][aria-label="View"]');
		const table = group.find('a[aria-label="Table view"]');
		const grid = group.find('a[aria-label="Grid view"]');
		expect(table.attributes('aria-current')).toBe('true');
		expect(grid.attributes('aria-current')).toBeUndefined();
		// Switching keeps the sort and the page
		expect(grid.attributes('href')).toBe('/library/albums?sort=year&page=2&view=grid');
		expect(wrapper.find('table').exists()).toBe(true);
	});

	it.each(['/library', '/library/artists'])('offers no view switch on %s', async (route) => {
		const wrapper = await mountAt(route);

		expect(wrapper.find('[aria-label="View"]').exists()).toBe(false);
	});

	it('shows albums as a grid of covers with title, artist and quality', async () => {
		const wrapper = await mountAt('/library/albums?view=grid');

		expect(wrapper.find('table').exists()).toBe(false);
		const cards = wrapper.findAll('ul[aria-label="Albums"] > li');
		expect(cards).toHaveLength(2);
		expect(cards[0]?.find('[data-color]').exists()).toBe(true);
		expect(cards[0]?.find('a[href="/library/albums/10"][title="Alpha One"]').text()).toBe(
			'Alpha One',
		);
		expect(cards[0]?.find('a[href="/library/artists/1"]').text()).toBe('Alpha');
		expect(cards[0]?.text()).toContain('Lossless');
		expect(cards[1]?.text()).toContain('Unknown album');
		expect(cards[1]?.text()).toContain('Unknown artist');
		expect(cards[1]?.text()).toContain('Mixed');
		const table = wrapper.find('a[aria-label="Table view"]');
		expect(table.attributes('aria-current')).toBeUndefined();
		// The default view stays out of the URL
		expect(table.attributes('href')).toBe('/library/albums');
	});

	it('falls back to the table when the URL holds an unknown view', async () => {
		const wrapper = await mountAt('/library/albums?view=cards');

		expect(wrapper.find('table').exists()).toBe(true);
	});

	it('paginates the grid with links that keep the view and the sort', async () => {
		albumPage = { ...albumPage, total: 120 };

		const wrapper = await mountAt('/library/albums?view=grid&sort=artist');

		expect(
			wrapper.find('a[href="/library/albums?view=grid&sort=artist&page=3"]').exists(),
		).toBe(true);
	});

	it('shows the same empty state in the grid', async () => {
		albumPage = pageOf([]);

		const wrapper = await mountAt('/library/albums?view=grid');

		expect(wrapper.text()).toContain('Your library is empty');
		expect(wrapper.find('ul[aria-label="Albums"]').exists()).toBe(false);
	});

	it('switches the view with the v key, but not while typing', async () => {
		await useSettings().load();
		// Attached, so the search field can take the focus
		const wrapper = await mountSuspended(LibraryPages, {
			route: '/library/albums?sort=year',
			attachTo: document.body,
		});
		const router = useRouter();

		const search = wrapper.find('input[type="search"]').element;
		if (!(search instanceof HTMLInputElement)) {
			throw new Error('No search field');
		}
		// Nuxt UI looks at the focused element, not at the event target
		search.focus();
		expect(document.activeElement).toBe(search);
		window.dispatchEvent(new KeyboardEvent('keydown', { key: 'v' }));
		await nextTick();
		await new Promise((resolve) => setTimeout(resolve, 50));
		expect(router.currentRoute.value.fullPath).toBe('/library/albums?sort=year');
		search.blur();
		await nextTick();

		window.dispatchEvent(new KeyboardEvent('keydown', { key: 'v' }));
		await vi.waitFor(() => {
			expect(router.currentRoute.value.fullPath).toBe('/library/albums?sort=year&view=grid');
		});
		await vi.waitFor(() => {
			expect(wrapper.find('ul[aria-label="Albums"]').exists()).toBe(true);
		});

		window.dispatchEvent(new KeyboardEvent('keydown', { key: 'v' }));
		await vi.waitFor(() => {
			expect(router.currentRoute.value.fullPath).toBe('/library/albums?sort=year');
		});
	});

	it('lists artists with their counts', async () => {
		const wrapper = await mountAt('/library/artists');

		expect(wrapper.text()).toContain('1 artist');
		expect(wrapper.find('a[href="/library/artists/1"]').text()).toBe('Alpha');
	});

	it('shows an album with its tracks numbered by disc when it has several', async () => {
		const wrapper = await mountAt('/library/albums/10');

		expect(wrapper.find('h2#album-title').text()).toBe('Alpha One');
		expect(wrapper.find('h2#album-title').element.parentElement?.textContent).toContain(
			'Lossless',
		);
		expect(wrapper.text()).toContain('2001');
		const rows = wrapper.findAll('tbody tr').map((row) => row.text());
		expect(rows[0]).toContain('1.1');
		expect(rows[2]).toContain('2.1');
		expect(rows[2]).toContain('Alpha, Guest');
	});

	it('shows the folders of an album in the library, each copying its full path', async () => {
		const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
		const wrapper = await mountAt('/library/albums/10');

		const folders = wrapper.findAll('ul[aria-label="Folders"] li span[title]');
		// A folder outside the library has no shorter name
		expect(folders.map((folder) => [folder.text(), folder.attributes('title')])).toEqual([
			['Alpha/Alpha One/CD1', '/music/Alpha/Alpha One/CD1'],
			['/elsewhere/Alpha One', '/elsewhere/Alpha One'],
		]);
		const button = wrapper.find('button[aria-label="Copy path /music/Alpha/Alpha One/CD1"]');
		await button.trigger('click');

		expect(writeText).toHaveBeenCalledWith('/music/Alpha/Alpha One/CD1');
		// A quiet check on the button, no toast
		await vi.waitFor(() => {
			expect(button.find('[data-slot="leadingIcon"]').classes()).toContain(
				'i-pixelarticons:clipboard-note',
			);
		});
		expect(document.body.textContent).not.toContain('copied');
		writeText.mockRestore();
	});

	it('copies the path of a track from its row menu', async () => {
		const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
		const wrapper = await mountAt('/library');

		await chooseFromMenu(wrapper, 'Track 1', 'Copy path');

		await vi.waitFor(() => {
			expect(writeText).toHaveBeenCalledWith('/music/Alpha/Alpha One/1.flac');
		});
		writeText.mockRestore();
	});

	it('rescans a track from its row menu, reading it again, and sums it up', async () => {
		const wrapper = await mountAt('/library');

		await chooseFromMenu(wrapper, 'Track 1', 'Rescan');

		await vi.waitFor(() => {
			expect(document.body.textContent).toContain('Rescan complete');
		});
		expect(document.body.textContent).toContain('2 updated, 1 removed');
		expect(scanRequests).toEqual([{ scope: { kind: 'tracks', ids: [1] }, force: true }]);
	});

	it.each([
		['the album table', '/library/albums'],
		['the album grid', '/library/albums?view=grid'],
		['the album page', '/library/albums/10'],
		['the artist page', '/library/artists/1'],
	])('rescans an album from its row menu in %s', async (_, route) => {
		const wrapper = await mountAt(route);

		await chooseFromMenu(wrapper, 'Alpha One', 'Rescan');

		await vi.waitFor(() => {
			expect(scanRequests).toEqual([{ scope: { kind: 'albums', ids: [10] }, force: true }]);
		});
	});

	it('says when a rescan is refused', async () => {
		scanRefused = true;
		const wrapper = await mountAt('/library/albums');

		await chooseFromMenu(wrapper, 'Alpha One', 'Rescan');

		await vi.waitFor(() => {
			expect(document.body.textContent).toContain('Could not rescan');
		});
		expect(document.body.textContent).toContain('A scan is already running');
	});

	it('returns to the album list when a rescan leaves the album page without its album', async () => {
		const wrapper = await mountAt('/library/albums/10');
		albumGone = true;

		await chooseFromMenu(wrapper, 'Alpha One', 'Rescan');

		await vi.waitFor(() => {
			expect(useRoute().fullPath).toBe('/library/albums');
		});
	});

	it('says when the clipboard refuses a path', async () => {
		const writeText = vi
			.spyOn(navigator.clipboard, 'writeText')
			.mockRejectedValue(new Error('Denied'));
		const wrapper = await mountAt('/library/albums/10');

		await wrapper
			.find('button[aria-label="Copy path /music/Alpha/Alpha One/CD1"]')
			.trigger('click');

		await vi.waitFor(() => {
			expect(document.body.textContent).toContain('Could not copy the path');
		});
		writeText.mockRestore();
	});

	it('keeps the technical details of an album track behind its info button', async () => {
		album.tracks = [
			track(1),
			track(2, { title: null, fileName: 'untitled.mp3', addedAtMs: null }),
		];
		const wrapper = await mountAt('/library/albums/10');

		expect(wrapper.findAll('thead th').map((cell) => cell.text())).toEqual([
			'#',
			'Title',
			'Duration',
			'Date added',
			'Actions',
		]);
		const rows = wrapper.findAll('tbody tr');
		expect(rows[0]?.text()).toContain('Alpha');
		expect(rows[0]?.text()).not.toContain('FLAC');
		expect(rows[0]?.text()).not.toContain('1.flac');
		// An untitled track shows its file name as its title; an old one has no date added
		expect(rows[1]?.findAll('td')[1]?.text()).toContain('untitled.mp3');
		expect(rows[1]?.findAll('td')[3]?.text()).toBe('');
		expect(rows[0]?.find('button[aria-label="Show details of Track 1"]').exists()).toBe(true);
	});

	it('shows an artist with each album and its tracks', async () => {
		const wrapper = await mountAt('/library/artists/1');

		expect(wrapper.find('h2#artist-name').text()).toBe('Alpha');
		expect(wrapper.text()).toContain('1 album · 3 tracks');
		expect(wrapper.find('h3 a[href="/library/albums/10"]').text()).toBe('Alpha One');
		expect(wrapper.find('h3').element.parentElement?.textContent).toContain('Lossless');
		expect(wrapper.findAll('tbody tr')).toHaveLength(3);
	});

	// One cover per album row, none repeated on the track rows of an album or artist page
	it.each([
		['/library', ['alpha', 'neutral']],
		['/library/albums', ['alpha', 'neutral']],
		['/library/albums/10', ['alpha']],
		['/library/artists/1', ['alpha']],
	])('shows a cassette for each album on %s, grey when unknown', async (path, expected) => {
		const wrapper = await mountAt(path);
		const alphaColor = cassetteColor('Alpha One', 'Alpha');

		expect(
			wrapper.findAll('[data-color]').map((cover) => cover.attributes('data-color')),
		).toEqual(expected.map((color) => (color === 'alpha' ? alphaColor : color)));
	});

	it('marks the view of a detail page as current', async () => {
		const wrapper = await mountAt('/library/albums/10');

		const views = wrapper.find('nav[aria-label="Library views"]');
		expect(views.find('[aria-current="page"]').text()).toBe('Albums');
	});

	it('shows the audio, tags and file of a track from its row menu', async () => {
		const wrapper = await mountAt('/library');

		const dialog = await openDetails(wrapper, 'Track 1');

		const text = dialog.textContent ?? '';
		expect(text).toContain('Track details');
		expect(text).toContain('MP3 (V0)');
		expect(text).toContain('Lossy');
		expect(text).toContain('246 kbps');
		expect(text).toContain('44.1 kHz');
		expect(text).toContain('Stereo');
		expect(text).toContain('/music/Alpha/Alpha One/01 Track 1.mp3');
		expect(text).toContain('4.2 MB');
		expect(text).toContain('Added');
		// A lossy file has no bit depth, and an untagged genre says so
		expect(text).not.toContain('Bit depth');
		expect(text).toMatch(/Genre\s*Not tagged/);
	});

	it('opens the details from the tracks of an album too', async () => {
		detail = trackDetail({ codec: 'FLAC', codecProfile: null, lossless: true, bitDepth: 24 });
		const wrapper = await mountAt('/library/albums/10');

		const dialog = await openDetails(wrapper, 'Track 1');

		expect(dialog.textContent).toContain('Lossless');
		expect(dialog.textContent).toContain('24-bit');
	});

	it('says when the audio of a track is read at the next scan', async () => {
		detail = trackDetail({
			codec: null,
			codecProfile: null,
			lossless: null,
			bitrate: null,
			sampleRate: null,
			channels: null,
		});
		const wrapper = await mountAt('/library');

		const dialog = await openDetails(wrapper, 'Track 1');

		expect(dialog.textContent).toContain('read at the next scan');
		expect(dialog.textContent).toMatch(/Format\s*Unknown/);
	});

	it('does not show the message of a failure', async () => {
		detailFailure = 'Internal detail of the server';
		const wrapper = await mountAt('/library');
		await wrapper.find('button[aria-label="Show details of Track 1"]').trigger('click');

		await vi.waitFor(() => {
			expect(document.querySelector('[role="dialog"]')?.textContent).toContain(
				'Try again in a moment.',
			);
		});
		expect(document.querySelector('[role="dialog"]')?.textContent).not.toContain(
			'Internal detail of the server',
		);
	});

	it('says when a track is no longer in the library', async () => {
		detail = undefined;
		const wrapper = await mountAt('/library');
		await wrapper.find('button[aria-label="Show details of Track 1"]').trigger('click');

		await vi.waitFor(() => {
			expect(document.querySelector('[role="dialog"]')?.textContent).toContain(
				'no longer in the library',
			);
		});
	});
});

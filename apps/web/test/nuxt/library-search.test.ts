import type { LibrarySearchResult, TrackSummary } from '@luz/core';
import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime';
import { NuxtPage, UApp } from '#components';
import { getQuery } from 'h3';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h } from 'vue';

const LibraryPages = defineComponent({
	render: () => h(UApp, null, () => h(NuxtPage)),
});

const beyonce = { id: 1, name: 'Beyoncé' };
const bDay = { id: 10, title: 'B’Day' };

function track(id: number, overrides: Partial<TrackSummary> = {}): TrackSummary {
	return {
		id,
		title: `Déjà Vu ${id}`,
		fileName: `${id}.flac`,
		artists: 'Beyoncé, Jay-Z',
		trackNumber: id,
		discNumber: 1,
		year: 2006,
		durationMs: 240_000,
		album: bDay,
		artist: beyonce,
		...overrides,
	};
}

const none = { items: [], total: 0 };
let result: Omit<LibrarySearchResult, 'query'>;
const queries: Record<string, unknown>[] = [];

registerEndpoint('/api/settings', {
	method: 'GET',
	handler: () => ({ theme: 'system', musicLibraryPath: '/music' }),
});
registerEndpoint('/api/library/tracks', {
	method: 'GET',
	handler: () => ({ items: [track(1)], total: 1, page: 1, pageSize: 50 }),
});
registerEndpoint('/api/library/search', {
	method: 'GET',
	handler: (event): LibrarySearchResult => {
		const query = getQuery(event);
		queries.push(query);
		const q = typeof query.q === 'string' ? query.q : '';
		return q === ''
			? { query: q, tracks: none, albums: none, artists: none }
			: { query: q, ...result };
	},
});

async function mountAt(route: string) {
	await useSettings().load();
	return mountSuspended(LibraryPages, { route });
}

function searchField(wrapper: Awaited<ReturnType<typeof mountAt>>) {
	return wrapper.find('form[role="search"] input[aria-label="Search the library"]');
}

describe('library search', () => {
	beforeEach(() => {
		clearNuxtState();
		queries.length = 0;
		result = {
			tracks: {
				items: [track(1), track(2, { title: null, fileName: 'untagged.mp3' })],
				total: 14,
			},
			albums: { items: [{ ...bDay, artist: beyonce, year: 2006, trackCount: 2 }], total: 1 },
			artists: { items: [{ ...beyonce, albumCount: 1, trackCount: 2 }], total: 1 },
		};
	});

	it('invites to type when the query is empty', async () => {
		const wrapper = await mountAt('/library/search');

		expect(wrapper.text()).toContain('Search your library');
		expect(searchField(wrapper).element).toHaveProperty('value', '');
	});

	it('groups the results with links to the album and artist pages', async () => {
		const wrapper = await mountAt('/library/search?q=beyonce');

		expect(queries.at(-1)).toEqual({ q: 'beyonce' });
		expect(searchField(wrapper).element).toHaveProperty('value', 'beyonce');
		expect(wrapper.find('h2#search-tracks').text()).toBe('Tracks');
		expect(wrapper.text()).toContain('First 2 of 14 tracks');
		expect(wrapper.text()).toContain('untagged.mp3');
		expect(wrapper.text()).toContain('Beyoncé, Jay-Z · B’Day');
		expect(wrapper.find('section[aria-labelledby="search-tracks"] a').attributes('href')).toBe(
			'/library/albums/10',
		);
		const albums = wrapper.find('section[aria-labelledby="search-albums"]');
		expect(albums.text()).toContain('1 album');
		expect(albums.find('a[href="/library/artists/1"]').text()).toBe('Beyoncé');
		const artists = wrapper.find('section[aria-labelledby="search-artists"]');
		expect(artists.find('a[href="/library/artists/1"]').text()).toBe('Beyoncé');
		expect(artists.text()).toContain('1 album · 2 tracks');
	});

	it('leaves out the groups without results', async () => {
		result = { ...result, tracks: none, artists: none };

		const wrapper = await mountAt('/library/search?q=day');

		expect(wrapper.find('#search-tracks').exists()).toBe(false);
		expect(wrapper.find('#search-artists').exists()).toBe(false);
		expect(wrapper.find('#search-albums').exists()).toBe(true);
	});

	it('says when nothing matches', async () => {
		result = { tracks: none, albums: none, artists: none };

		const wrapper = await mountAt('/library/search?q=zzz');

		expect(wrapper.text()).toContain('No results for “zzz”');
	});

	it('treats a query the schema rejects as no query', async () => {
		const wrapper = await mountAt(`/library/search?q=${'a'.repeat(101)}`);

		expect(wrapper.text()).toContain('Search your library');
	});

	it('puts the trimmed query in the URL once typing pauses', async () => {
		const wrapper = await mountAt('/library');
		const router = useRouter();

		await searchField(wrapper).setValue('  deja');
		await searchField(wrapper).setValue('  deja vu ');
		// Not on every key: the URL changes only after the pause
		expect(router.currentRoute.value.path).toBe('/library');
		await vi.waitFor(() => {
			expect(router.currentRoute.value.fullPath).toBe('/library/search?q=deja+vu');
		});
		await vi.waitFor(() => {
			expect(wrapper.text()).toContain('First 2 of 14 tracks');
		});
		// The space being typed stays in the field
		expect(searchField(wrapper).element).toHaveProperty('value', '  deja vu ');
	});

	it('goes back to the view the search started from when the field is cleared', async () => {
		const wrapper = await mountAt('/library/albums?sort=year');
		const router = useRouter();

		await searchField(wrapper).setValue('day');
		await vi.waitFor(() => {
			expect(router.currentRoute.value.fullPath).toBe('/library/search?q=day');
		});
		await searchField(wrapper).setValue('');
		await vi.waitFor(() => {
			expect(router.currentRoute.value.fullPath).toBe('/library/albums?sort=year');
		});
	});

	it('goes to the tracks when a search opened from its URL is cleared', async () => {
		const wrapper = await mountAt('/library/search?q=day');
		const router = useRouter();

		await searchField(wrapper).setValue(' ');
		await wrapper.find('form[role="search"]').trigger('submit');
		await vi.waitFor(() => {
			expect(router.currentRoute.value.fullPath).toBe('/library');
		});
		expect(wrapper.text()).not.toContain('Search your library');
	});

	it('searches at once on Enter, and clears the field when another view opens', async () => {
		const wrapper = await mountAt('/library/search?q=old');
		const router = useRouter();

		await searchField(wrapper).setValue('new');
		await wrapper.find('form[role="search"]').trigger('submit');
		await vi.waitFor(() => {
			expect(router.currentRoute.value.fullPath).toBe('/library/search?q=new');
		});

		await router.push('/library/albums');
		await vi.waitFor(() => {
			expect(searchField(wrapper).element).toHaveProperty('value', '');
		});
	});
});

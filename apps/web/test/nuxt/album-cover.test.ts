import { cassetteColor } from '@luz/core';
import { mountSuspended } from '@nuxt/test-utils/runtime';
import { AlbumCover } from '#components';
import { describe, expect, it } from 'vitest';

describe('AlbumCover', () => {
	it('draws a cassette in the colour of the album name, hidden from screen readers', async () => {
		const wrapper = await mountSuspended(AlbumCover, {
			props: { album: 'Abbey Road', artist: 'The Beatles' },
		});
		const cover = wrapper.get('[data-color]');
		expect(cover.attributes('data-color')).toBe(cassetteColor('Abbey Road', 'The Beatles'));
		expect(cover.classes()).toContain('text-red-500');
		expect(cover.attributes('aria-hidden')).toBe('true');
		expect(cover.find('svg').exists()).toBe(true);
	});

	it.each([
		[null, 'The Beatles'],
		['Abbey Road', null],
	])('is grey for album %j by artist %j', async (album, artist) => {
		const wrapper = await mountSuspended(AlbumCover, { props: { album, artist } });
		const cover = wrapper.get('[data-color]');
		expect(cover.attributes('data-color')).toBe('neutral');
		expect(cover.classes()).toContain('text-neutral-400');
	});
});

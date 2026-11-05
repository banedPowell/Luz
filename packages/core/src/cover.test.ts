import { describe, expect, it } from 'vitest';

import { cassetteColor, cassetteColors } from './cover.ts';

describe('cassetteColor', () => {
	// Pinned: changing the rule would repaint every cassette of every library
	it.each([
		['Abbey Road', 'red'],
		['Kind of Blue', 'emerald'],
		['Discovery', 'teal'],
		['Random Access Memories', 'lime'],
	])('gives %s the colour %s', (album, color) => {
		expect(cassetteColor(album, 'Artist')).toBe(color);
	});

	it('ignores case, surrounding spaces and the Unicode form of the name', () => {
		const color = cassetteColor('Café Tacvba', 'Artist');
		expect(cassetteColor('  CAFÉ TACVBA ', 'Artist')).toBe(color);
		expect(cassetteColor('Café Tacvba', 'Artist')).toBe(color);
	});

	it('depends on the album name only, not on its artist', () => {
		expect(cassetteColor('Greatest Hits', 'Queen')).toBe(
			cassetteColor('Greatest Hits', 'ABBA'),
		);
	});

	it.each([
		[null, 'Artist'],
		['', 'Artist'],
		['   ', 'Artist'],
		['Album', null],
		['Album', '  '],
		[null, null],
	])('is grey for album %j by artist %j', (album, artist) => {
		expect(cassetteColor(album, artist)).toBe('neutral');
	});

	it('uses the whole palette', () => {
		const used = new Set(
			Array.from({ length: 500 }, (_, index) => cassetteColor(`Album ${index}`, 'Artist')),
		);
		expect([...used].toSorted()).toEqual([...cassetteColors].toSorted());
	});
});

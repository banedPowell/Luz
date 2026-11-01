import { describe, expect, it } from 'vite-plus/test';

import {
	albumOf,
	artistOf,
	formatArtists,
	groupingKey,
	isAudioFile,
	trackTagsSchema,
	unknownKey,
} from './library.ts';

const unknown = { key: unknownKey, name: null };

describe('trackTagsSchema', () => {
	it('accepts a file without any tag', () => {
		expect(trackTagsSchema.parse({})).toEqual({ artists: [] });
	});

	it('keeps every tag Luz reads', () => {
		const tags = {
			title: 'Song',
			artists: ['A', 'B'],
			album: 'Album',
			albumArtist: 'A',
			trackNumber: 3,
			discNumber: 1,
			year: 1999,
			genre: 'Rock',
			durationMs: 215_000,
		};
		expect(trackTagsSchema.parse(tags)).toEqual(tags);
	});

	it.each([
		{ trackNumber: 0 },
		{ discNumber: 1.5 },
		{ year: 1999.5 },
		{ durationMs: -1 },
		{ artists: 'A' },
		{ title: 1 },
	])('rejects %j', (tags) => {
		expect(trackTagsSchema.safeParse(tags).success).toBe(false);
	});
});

describe('groupingKey', () => {
	it('ignores case and surrounding spaces', () => {
		expect(groupingKey('  The Beatles ')).toBe(groupingKey('the beatles'));
	});

	it('treats composed and decomposed accents alike', () => {
		expect(groupingKey('Beyoncé')).toBe(groupingKey('Beyoncé'));
	});

	it('keeps inner punctuation and spaces', () => {
		expect(groupingKey('AC/DC')).toBe('ac/dc');
		expect(groupingKey('AC DC')).not.toBe(groupingKey('AC/DC'));
	});
});

describe('artistOf', () => {
	it('uses the album artist first', () => {
		expect(artistOf(trackTagsSchema.parse({ albumArtist: 'Various', artists: ['A'] }))).toEqual(
			{
				key: 'various',
				name: 'Various',
			},
		);
	});

	it('falls back to the first track artist', () => {
		expect(artistOf(trackTagsSchema.parse({ artists: ['A', 'B'] }))).toEqual({
			key: 'a',
			name: 'A',
		});
	});

	it('skips blank values before falling back', () => {
		expect(artistOf(trackTagsSchema.parse({ albumArtist: ' ', artists: ['', ' B '] }))).toEqual(
			{
				key: 'b',
				name: 'B',
			},
		);
	});

	it('groups untagged tracks under the unknown artist', () => {
		expect(artistOf(trackTagsSchema.parse({}))).toEqual(unknown);
		expect(artistOf(trackTagsSchema.parse({ albumArtist: '', artists: [' '] }))).toEqual(
			unknown,
		);
	});
});

describe('albumOf', () => {
	it('uses the trimmed album title', () => {
		expect(albumOf(trackTagsSchema.parse({ album: ' Abbey Road ' }))).toEqual({
			key: 'abbey road',
			name: 'Abbey Road',
		});
	});

	it.each([{}, { album: '' }, { album: '   ' }])('groups %j under the unknown album', (tags) => {
		expect(albumOf(trackTagsSchema.parse(tags))).toEqual(unknown);
	});
});

describe('formatArtists', () => {
	it('joins the track artists', () => {
		expect(formatArtists(['A', ' B '])).toBe('A, B');
	});

	it('returns null without a tagged artist', () => {
		expect(formatArtists([])).toBeNull();
		expect(formatArtists(['', ' '])).toBeNull();
	});
});

describe('isAudioFile', () => {
	it.each(['song.mp3', 'a/b/01 Song.FLAC', 'C:\\Music\\track.m4a', 'x.ogg', 'x.opus', 'x.wav'])(
		'keeps %s',
		(name) => {
			expect(isAudioFile(name)).toBe(true);
		},
	);

	it.each(['cover.jpg', 'notes.txt', 'playlist.m3u', 'mp3', 'song.mp3.part', 'video.mp4'])(
		'ignores %s',
		(name) => {
			expect(isAudioFile(name)).toBe(false);
		},
	);
});

import { describe, expect, it } from 'vite-plus/test';

import type { TrackTags } from './library.ts';
import {
	defaultNamingTemplate,
	maxSegmentBytes,
	namingTemplateSchema,
	parseNamingTemplate,
	renderTrackPath,
	sampleTrackTags,
	sanitizePathSegment,
	utf8ByteLength,
} from './naming.ts';

const tags: TrackTags = {
	title: 'Digital Love',
	artists: ['Daft Punk'],
	album: 'Discovery',
	albumArtist: 'Daft Punk',
	trackNumber: 3,
	discNumber: 1,
	year: 2001,
};

const untagged: TrackTags = { artists: [] };

describe('renderTrackPath', () => {
	it('renders the default template with the extension', () => {
		expect(renderTrackPath(defaultNamingTemplate, tags, '.flac')).toBe(
			'Daft Punk/Discovery/1-03 Digital Love.flac',
		);
	});

	it('accepts the extension with or without a dot, in any case', () => {
		expect(renderTrackPath('{title}', tags, 'MP3')).toBe('Digital Love.mp3');
		expect(renderTrackPath('{title}', tags, '.Opus')).toBe('Digital Love.opus');
	});

	it('renders every placeholder and keeps literal text', () => {
		expect(
			renderTrackPath(
				'{artist} - {albumartist}/{album} ({year})/{disc}.{track} {title}',
				tags,
				'mp3',
			),
		).toBe('Daft Punk - Daft Punk/Discovery (2001)/1.3 Digital Love.mp3');
	});

	it('pads numbers with zeros to the given width', () => {
		expect(renderTrackPath('{disc:02}-{track:03} {year:05}', tags, 'mp3')).toBe(
			'01-003 02001.mp3',
		);
	});

	it('never shortens a number longer than its width', () => {
		expect(renderTrackPath('{track:02}', { ...tags, trackNumber: 123 }, 'mp3')).toBe('123.mp3');
	});

	it('joins several track artists', () => {
		expect(renderTrackPath('{artist}', { ...tags, artists: ['A', 'B'] }, 'mp3')).toBe(
			'A, B.mp3',
		);
	});

	it('takes the first track artist when the album artist is missing', () => {
		const path = renderTrackPath(
			'{albumartist}',
			{ ...tags, albumArtist: ' ', artists: ['A', 'B'] },
			'mp3',
		);
		expect(path).toBe('A.mp3');
	});

	it('takes the album artist when no track artist is tagged', () => {
		expect(renderTrackPath('{artist}', { ...tags, artists: [] }, 'mp3')).toBe('Daft Punk.mp3');
	});

	it('falls back to the unknown names for missing tags', () => {
		expect(
			renderTrackPath('{albumartist}/{album}/{artist} - {title} ({year})', untagged, 'mp3'),
		).toBe('Unknown artist/Unknown album/Unknown artist - Unknown title (Unknown year).mp3');
	});

	it('treats a blank tag as missing', () => {
		expect(renderTrackPath('{album}/{title}', { ...tags, album: '  ', title: '' }, 'mp3')).toBe(
			'Unknown album/Unknown title.mp3',
		);
	});

	it('puts a track without numbers on disc 1 as track 0', () => {
		expect(renderTrackPath('{disc}-{track:02}', untagged, 'mp3')).toBe('1-00.mp3');
	});

	it('accepts a backslash as folder separator', () => {
		expect(renderTrackPath('{albumartist}\\{title}', tags, 'mp3')).toBe(
			'Daft Punk/Digital Love.mp3',
		);
	});

	it('keeps a tag holding a slash in its own folder', () => {
		expect(
			renderTrackPath('{albumartist}/{title}', { ...tags, albumArtist: 'AC/DC' }, 'mp3'),
		).toBe('AC_DC/Digital Love.mp3');
	});

	it('cannot leave the library folder through a tag', () => {
		const path = renderTrackPath(
			'{album}/{title}',
			{ ...tags, album: '..', title: '../../etc' },
			'mp3',
		);
		expect(path).toBe('_/.._.._etc.mp3');
		expect(path.split('/')).not.toContain('..');
	});

	it('keeps the extension when the name is capped', () => {
		const path = renderTrackPath('{title}', { ...tags, title: 'a'.repeat(400) }, 'flac');
		expect(path.endsWith('.flac')).toBe(true);
		expect(utf8ByteLength(path)).toBeLessThanOrEqual(maxSegmentBytes);
	});

	it('throws on an invalid template', () => {
		expect(() => renderTrackPath('{genre}', tags, 'mp3')).toThrow('Invalid naming template');
	});

	it('renders the sample tags', () => {
		expect(renderTrackPath(defaultNamingTemplate, sampleTrackTags, 'mp3')).toBe(
			'Daft Punk/Discovery/1-03 Digital Love.mp3',
		);
	});
});

describe('sanitizePathSegment', () => {
	it.each(['<', '>', ':', '"', '/', '\\', '|', '?', '*'])('replaces %j', (char) => {
		expect(sanitizePathSegment(`a${char}b`)).toBe('a_b');
	});

	it('replaces control characters', () => {
		expect(sanitizePathSegment('a\u0000b\tc\nd\u007fe')).toBe('a_b_c_d_e');
	});

	it('removes trailing dots and spaces and leading spaces', () => {
		expect(sanitizePathSegment('  Vol. 2 . . ')).toBe('Vol. 2');
	});

	it.each(['', '   ', '.', '..', '...', ' . '])('never returns an empty name for %j', (value) => {
		expect(sanitizePathSegment(value)).toBe('_');
	});

	it.each([
		['CON', 'CON_'],
		['con', 'con_'],
		['Nul', 'Nul_'],
		['PRN', 'PRN_'],
		['AUX', 'AUX_'],
		['COM1', 'COM1_'],
		['lpt9', 'lpt9_'],
		['CON.txt', 'CON_.txt'],
		['COM¹', 'COM¹_'],
	])('escapes the reserved name %j', (value, expected) => {
		expect(sanitizePathSegment(value)).toBe(expected);
	});

	it.each(['Console', 'CONTACT', 'COM10', 'icon', 'Nullset'])(
		'keeps %j, which is not reserved',
		(value) => {
			expect(sanitizePathSegment(value)).toBe(value);
		},
	);

	it('caps the length in UTF-8 bytes', () => {
		expect(sanitizePathSegment('a'.repeat(300))).toBe('a'.repeat(maxSegmentBytes));
		expect(sanitizePathSegment('é'.repeat(300), 11)).toBe('é'.repeat(5));
	});

	it('never cuts a character in half', () => {
		expect(sanitizePathSegment('🎵🎵🎵', 6)).toBe('🎵');
	});

	it('removes trailing dots and spaces left by the cap', () => {
		expect(sanitizePathSegment('abc. def', 5)).toBe('abc');
	});

	it('normalizes Unicode to the composed form', () => {
		expect(sanitizePathSegment('Beyonce\u0301')).toBe('Beyonc\u00e9');
	});
});

describe('utf8ByteLength', () => {
	it.each([
		['', 0],
		['abc', 3],
		['é', 2],
		['€', 3],
		['🎵', 4],
	])('counts %j as %i bytes', (value, bytes) => {
		expect(utf8ByteLength(value)).toBe(bytes);
	});
});

describe('parseNamingTemplate', () => {
	it('splits folders and placeholders', () => {
		expect(parseNamingTemplate('{album}/{track:02} {title}')).toEqual({
			success: true,
			template: [
				[{ kind: 'placeholder', name: 'album', width: 0 }],
				[
					{ kind: 'placeholder', name: 'track', width: 2 },
					{ kind: 'text', text: ' ' },
					{ kind: 'placeholder', name: 'title', width: 0 },
				],
			],
		});
	});
});

describe('namingTemplateSchema', () => {
	it.each([
		defaultNamingTemplate,
		'{title}',
		'{album} ({year})/{title}',
		'Music/{artist}/{title}',
	])('accepts %j', (template) => {
		expect(namingTemplateSchema.parse(template)).toBe(template);
	});

	it('trims the template', () => {
		expect(namingTemplateSchema.parse('  {title}  ')).toBe('{title}');
	});

	it.each([
		['', 'Enter a template'],
		['   ', 'Enter a template'],
		['{genre}', 'Unknown placeholder {genre}. Use {artist}, {albumartist}'],
		['{Title}', 'Unknown placeholder {Title}'],
		['{}', 'Unknown placeholder {}'],
		['{track:2}', 'Unknown placeholder {track:2}'],
		['{title:02}', 'Only {year}, {track} and {disc} can be padded'],
		['{title', 'never closed'],
		['title}', 'no matching'],
		['/{title}', 'relative to the library folder'],
		['\\{title}', 'relative to the library folder'],
		['C:/{title}', 'relative to the library folder'],
		['C:{title}', 'relative to the library folder'],
		['~/{title}', 'relative to the library folder'],
		['{album}/../{title}', 'cannot be "." or ".."'],
		['./{title}', 'cannot be "." or ".."'],
		['{album}//{title}', 'empty folder name'],
		['{album}/', 'empty folder name'],
		['{album}/ /{title}', 'empty folder name'],
	])('rejects %j with a readable message', (template, message) => {
		const result = namingTemplateSchema.safeParse(template);
		expect(result.success).toBe(false);
		expect(result.error?.issues[0]?.message).toContain(message);
	});

	it('rejects a non-string', () => {
		expect(namingTemplateSchema.safeParse(42).success).toBe(false);
	});
});

import { z } from 'zod';

import { artistOf, formatArtists, type TrackTags } from './library.ts';

/**
 * Where a downloaded file lands in the library, relative to its folder, built from a
 * template such as `{albumartist}/{album}/{disc}-{track:02} {title}`. Pure: the path is
 * joined with `/` and the server adapter converts it for the file system.
 */

export const namingPlaceholders = [
	'artist',
	'albumartist',
	'album',
	'title',
	'year',
	'track',
	'disc',
] as const;

export type NamingPlaceholder = (typeof namingPlaceholders)[number];

// Only numbers make sense padded with zeros
const numericPlaceholders: ReadonlySet<NamingPlaceholder> = new Set(['year', 'track', 'disc']);

export const defaultNamingTemplate = '{albumartist}/{album}/{disc}-{track:02} {title}';

/** The names a missing tag takes, the same as the "unknown" entries of the library. */
export const unknownArtistName = 'Unknown artist';
export const unknownAlbumName = 'Unknown album';
export const unknownTitleName = 'Unknown title';
export const unknownYearName = 'Unknown year';

// A track without a disc number is on the only disc; one without a track number is 0
const defaultDisc = 1;
const defaultTrack = 0;

// Enough for a name to stay readable, well under the 255 bytes most file systems allow
export const maxSegmentBytes = 180;

type TemplatePart =
	| { kind: 'text'; text: string }
	| { kind: 'placeholder'; name: NamingPlaceholder; width: number };

/** A template split into folder segments, the last one being the file name. */
export type ParsedNamingTemplate = TemplatePart[][];

export type NamingTemplateResult =
	| { success: true; template: ParsedNamingTemplate }
	| { success: false; message: string };

const placeholderPattern = /^([a-z]+)(?::0([1-9]))?$/;

const placeholderList = namingPlaceholders.map((name) => `{${name}}`).join(', ');

function isPlaceholder(name: string): name is NamingPlaceholder {
	return (namingPlaceholders as readonly string[]).includes(name);
}

function parseSegment(segment: string): TemplatePart[] | string {
	const parts: TemplatePart[] = [];
	let text = '';
	let index = 0;
	while (index < segment.length) {
		const char = segment[index]!;
		if (char === '}') {
			return 'A "}" has no matching "{".';
		}
		if (char !== '{') {
			text += char;
			index += 1;
			continue;
		}
		const end = segment.indexOf('}', index);
		if (end === -1) {
			return 'A "{" is never closed with "}".';
		}
		const body = segment.slice(index + 1, end);
		const match = placeholderPattern.exec(body);
		const name = match?.[1];
		if (name === undefined || !isPlaceholder(name)) {
			return `Unknown placeholder {${body}}. Use ${placeholderList}.`;
		}
		const width = match?.[2] === undefined ? 0 : Number(match[2]);
		if (width > 0 && !numericPlaceholders.has(name)) {
			return `Only {year}, {track} and {disc} can be padded with zeros, not {${name}}.`;
		}
		if (text !== '') {
			parts.push({ kind: 'text', text });
			text = '';
		}
		parts.push({ kind: 'placeholder', name, width });
		index = end + 1;
	}
	if (text !== '') {
		parts.push({ kind: 'text', text });
	}
	return parts;
}

// POSIX root, Windows drive (C:, C:\) or UNC share, and the home directory of shells
const absoluteStart = /^(?:[/\\]|[A-Za-z]:|~)/;

/** Parses a template, or says in plain words why it cannot be used. */
export function parseNamingTemplate(template: string): NamingTemplateResult {
	const trimmed = template.trim();
	if (trimmed === '') {
		return { success: false, message: 'Enter a template, such as ' + defaultNamingTemplate };
	}
	if (absoluteStart.test(trimmed)) {
		return {
			success: false,
			message: 'Use a path relative to the library folder, without a leading / or drive.',
		};
	}
	const parsed: ParsedNamingTemplate = [];
	// Both separators split folders, so a template typed on Windows means the same
	for (const segment of trimmed.split(/[/\\]/)) {
		if (segment.trim() === '') {
			return {
				success: false,
				message: 'Remove the empty folder name (two / in a row or a / at the end).',
			};
		}
		if (/^\.+$/.test(segment.trim())) {
			return {
				success: false,
				message: 'A folder cannot be "." or "..": files stay in the library folder.',
			};
		}
		const parts = parseSegment(segment);
		if (typeof parts === 'string') {
			return { success: false, message: parts };
		}
		parsed.push(parts);
	}
	return { success: true, template: parsed };
}

export const namingTemplateSchema = z
	.string()
	.trim()
	.superRefine((template, context) => {
		const result = parseNamingTemplate(template);
		if (!result.success) {
			context.addIssue({ code: 'custom', message: result.message });
		}
	});

const forbiddenCharacters = new Set('<>:"/\\|?*');

// Checked by code rather than in a regular expression, which lint rightly flags for control characters
function isForbidden(char: string): boolean {
	const code = char.codePointAt(0) ?? 0;
	return code < 0x20 || code === 0x7f || forbiddenCharacters.has(char);
}

function replaceForbidden(value: string): string {
	return Array.from(value, (char) => (isForbidden(char) ? '_' : char)).join('');
}

// Windows refuses these names, whatever their case and whatever follows a dot
const reservedName = /^(?:con|prn|aux|nul|com[0-9¹²³]|lpt[0-9¹²³])$/i;

/** The length of a string in UTF-8, the encoding file systems count name limits in. */
export function utf8ByteLength(value: string): number {
	let bytes = 0;
	for (const char of value) {
		bytes += utf8CharBytes(char);
	}
	return bytes;
}

function utf8CharBytes(char: string): number {
	const code = char.codePointAt(0) ?? 0;
	return code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4;
}

function capBytes(value: string, maxBytes: number): string {
	let result = '';
	let bytes = 0;
	// By code point, so a character outside the BMP is never cut in half
	for (const char of value) {
		const size = utf8CharBytes(char);
		if (bytes + size > maxBytes) {
			break;
		}
		result += char;
		bytes += size;
	}
	return result;
}

function trimEnds(value: string): string {
	return value.replace(/^\s+/, '').replace(/[\s.]+$/, '');
}

/**
 * A folder or file name that works on Windows, macOS and Linux: forbidden and control
 * characters become "_", trailing dots and spaces go, reserved names get a "_" and the
 * length is capped in UTF-8 bytes. Never empty, never "." or "..".
 */
export function sanitizePathSegment(value: string, maxBytes = maxSegmentBytes): string {
	let segment = trimEnds(replaceForbidden(value.normalize('NFC')));
	segment = trimEnds(capBytes(segment, maxBytes));
	if (segment === '') {
		return '_';
	}
	const dot = segment.indexOf('.');
	const stem = dot === -1 ? segment : segment.slice(0, dot);
	if (reservedName.test(stem.trimEnd())) {
		segment = `${stem}_${segment.slice(stem.length)}`;
	}
	return segment;
}

function clean(value: string | undefined): string | undefined {
	const trimmed = value?.trim();
	return trimmed === undefined || trimmed === '' ? undefined : trimmed;
}

// Text values fall back to the unknown names; numbers are padded to the placeholder width
const placeholderValues: Record<NamingPlaceholder, (tags: TrackTags) => string | number> = {
	artist: (tags) => formatArtists(tags.artists) ?? clean(tags.albumArtist) ?? unknownArtistName,
	albumartist: (tags) => artistOf(tags).name ?? unknownArtistName,
	album: (tags) => clean(tags.album) ?? unknownAlbumName,
	title: (tags) => clean(tags.title) ?? unknownTitleName,
	year: (tags) => tags.year ?? unknownYearName,
	track: (tags) => tags.trackNumber ?? defaultTrack,
	disc: (tags) => tags.discNumber ?? defaultDisc,
};

function valueOf(name: NamingPlaceholder, width: number, tags: TrackTags): string {
	const value = placeholderValues[name](tags);
	return typeof value === 'number' ? String(value).padStart(width, '0') : value;
}

function renderSegment(parts: TemplatePart[], tags: TrackTags): string {
	// A tag value holding "/" stays in its segment: separators are replaced afterwards
	return parts
		.map((part) => (part.kind === 'text' ? part.text : valueOf(part.name, part.width, tags)))
		.join('');
}

/**
 * The path of a track relative to the library folder, joined with `/` and ending with
 * the extension (".flac" or "flac"). Throws on an invalid template: validate it with
 * `namingTemplateSchema` first.
 */
export function renderTrackPath(template: string, tags: TrackTags, extension: string): string {
	const result = parseNamingTemplate(template);
	if (!result.success) {
		throw new Error(`Invalid naming template: ${result.message}`);
	}
	const suffix = sanitizePathSegment(extension.replace(/^\.+/, '').toLowerCase(), 16);
	const segments = result.template.map((parts) => renderSegment(parts, tags));
	const fileName = segments.pop() ?? '';
	const folders = segments.map((segment) => sanitizePathSegment(segment));
	// The cap leaves room for the extension, so it is never cut off
	const name = sanitizePathSegment(fileName, maxSegmentBytes - suffix.length - 1);
	return [...folders, `${name}.${suffix}`].join('/');
}

/** Tags of a made-up track, to show what a template gives before anything is downloaded. */
export const sampleTrackTags: TrackTags = {
	title: 'Digital Love',
	artists: ['Daft Punk'],
	album: 'Discovery',
	albumArtist: 'Daft Punk',
	trackNumber: 3,
	discNumber: 1,
	year: 2001,
};

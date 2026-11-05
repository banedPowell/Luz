import { groupingKey } from './library.ts';

/**
 * The accent colours of the cassette drawn for an album without cover art: a fixed palette
 * (Tailwind colour names) rather than any hue, so each one can be tuned to read well in the
 * light and dark themes.
 */
export const cassetteColors = [
	'red',
	'orange',
	'amber',
	'lime',
	'emerald',
	'teal',
	'cyan',
	'sky',
	'indigo',
	'violet',
	'fuchsia',
	'rose',
] as const;

/** The colour of a cassette: one of the palette, or `neutral` for an unknown album. */
export type CassetteColor = (typeof cassetteColors)[number] | 'neutral';

// FNV-1a, 32 bits, over UTF-16 code units: tiny, stable across runtimes and spreads short
// strings well. Core has no TextEncoder (no DOM or Node types), hence code units, not bytes.
function fnv1a(text: string): number {
	let hash = 0x811c9dc5;
	for (let index = 0; index < text.length; index++) {
		hash ^= text.charCodeAt(index);
		hash = Math.imul(hash, 0x01000193);
	}
	return hash >>> 0;
}

/**
 * The colour of the cassette of an album, from its name only: the same album always gets the
 * same colour, whatever its artist, and the case or Unicode form of the tag does not change it
 * (see `groupingKey`). Grey when the album or its artist is unknown, so an untagged album does
 * not look like a real one.
 */
export function cassetteColor(album: string | null, artist: string | null): CassetteColor {
	const albumKey = album === null ? '' : groupingKey(album);
	const artistKey = artist === null ? '' : groupingKey(artist);
	if (albumKey === '' || artistKey === '') {
		return 'neutral';
	}
	return cassetteColors[fnv1a(albumKey) % cassetteColors.length] ?? 'neutral';
}

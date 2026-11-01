import { z } from 'zod';

const positiveInteger = z.number().int().positive();

/**
 * The tags Luz reads from an audio file. Every tag can be missing; the grouping rules
 * below decide what an absent or blank value means.
 */
export const trackTagsSchema = z.object({
	title: z.string().optional(),
	// Several values when the file holds a multi-value artist tag
	artists: z.array(z.string()).default([]),
	album: z.string().optional(),
	albumArtist: z.string().optional(),
	trackNumber: positiveInteger.optional(),
	discNumber: positiveInteger.optional(),
	year: z.number().int().optional(),
	genre: z.string().optional(),
	durationMs: z.number().int().nonnegative().optional(),
});

export type TrackTags = z.infer<typeof trackTagsSchema>;

/**
 * An artist or album a track is grouped under. Tracks whose `key` match share the
 * group; `name` is what is shown, and `null` marks the "unknown" entry that collects
 * untagged tracks instead of dropping them.
 */
export interface LibraryGroup {
	key: string;
	name: string | null;
}

/** The key of the "unknown" artist or album: no tagged value normalises to it. */
export const unknownKey = '';

const unknownGroup: LibraryGroup = { key: unknownKey, name: null };

function clean(value: string | undefined): string | undefined {
	const trimmed = value?.trim();
	return trimmed === undefined || trimmed === '' ? undefined : trimmed;
}

/**
 * The grouping key of a tag value. Case and Unicode form are ignored, so "AC/DC" and
 * "ac/dc", or composed and decomposed accents, end up in one group.
 */
export function groupingKey(value: string): string {
	return value.normalize('NFKC').trim().toLowerCase();
}

function toGroup(value: string | undefined): LibraryGroup {
	const name = clean(value);
	return name === undefined ? unknownGroup : { key: groupingKey(name), name };
}

/**
 * The artist a track's album belongs to: the album artist, falling back to the first
 * track artist. Joining several track artists would invent an artist ("A, B") that
 * none of the files names.
 */
export function artistOf(tags: TrackTags): LibraryGroup {
	return toGroup(clean(tags.albumArtist) ?? tags.artists.map(clean).find(Boolean));
}

/** The album a track belongs to, within its artist (see `artistOf`). */
export function albumOf(tags: TrackTags): LibraryGroup {
	return toGroup(tags.album);
}

/** The track artists as one display string, or `null` when none is tagged. */
export function formatArtists(artists: string[]): string | null {
	const names = artists.map(clean).filter((name) => name !== undefined);
	return names.length === 0 ? null : names.join(', ');
}

/**
 * The file extensions a scan keeps, lowercase: the formats of ADR 0005 and the
 * uncompressed ones music-metadata also reads. Anything else in the folder is ignored.
 */
export const audioFileExtensions = [
	'.aac',
	'.aif',
	'.aiff',
	'.flac',
	'.m4a',
	'.mp3',
	'.oga',
	'.ogg',
	'.opus',
	'.wav',
] as const;

/** Whether a file name or path ends with a supported audio extension, in any case. */
export function isAudioFile(fileName: string): boolean {
	const name = fileName.toLowerCase();
	return audioFileExtensions.some((extension) => name.endsWith(extension));
}

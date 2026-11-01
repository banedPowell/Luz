import { trackTagsSchema, type TrackTags } from '@luz/core';
import {
	CouldNotDetermineFileTypeError,
	UnsupportedFileTypeError,
	parseFile,
	type ICommonTagsResult,
	type IFormat,
} from 'music-metadata';

/**
 * Why a file's tags could not be read: `unsupported` when it is not an audio format
 * Luz knows, `unreadable` when it is missing, inaccessible or corrupt.
 */
export type TagReadErrorKind = 'unsupported' | 'unreadable';

export interface TagReadError {
	kind: TagReadErrorKind;
	message: string;
}

// A result rather than an exception: a scan skips a bad file and keeps going
export type TagReadResult = { ok: true; tags: TrackTags } | { ok: false; error: TagReadError };

/** Reads the tags of an audio file without ever writing to it. */
export interface TagReader {
	read(filePath: string): Promise<TagReadResult>;
}

/** The tag reader backed by music-metadata (ADR 0005). */
export function createTagReader(): TagReader {
	return {
		async read(filePath) {
			try {
				// music-metadata opens the file with O_RDONLY
				const { common, format } = await parseFile(filePath, { skipCovers: true });
				const parsed = trackTagsSchema.safeParse(toTrackTags(common, format));
				return parsed.success
					? { ok: true, tags: parsed.data }
					: {
							ok: false,
							error: {
								kind: 'unreadable',
								message: 'Tags do not match the track schema',
							},
						};
			} catch (error) {
				return { ok: false, error: toTagReadError(error) };
			}
		},
	};
}

function toTagReadError(error: unknown): TagReadError {
	const unsupported =
		error instanceof CouldNotDetermineFileTypeError ||
		error instanceof UnsupportedFileTypeError;
	return {
		kind: unsupported ? 'unsupported' : 'unreadable',
		message: error instanceof Error ? error.message : String(error),
	};
}

function text(value: string | undefined): string | undefined {
	return value?.trim() ? value : undefined;
}

// Files hold 0 or garbage where the schema wants a positive integer: drop the value, keep the file
function positive(value: number | null | undefined): number | undefined {
	return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : undefined;
}

function toTrackTags(common: ICommonTagsResult, format: IFormat): TrackTags {
	const artists = common.artists ?? (common.artist === undefined ? [] : [common.artist]);
	const year = common.year;
	const duration = format.duration;
	return {
		title: text(common.title),
		artists: artists.filter((artist) => text(artist) !== undefined),
		album: text(common.album),
		albumArtist: text(common.albumartist),
		trackNumber: positive(common.track.no),
		discNumber: positive(common.disk.no),
		year: Number.isInteger(year) ? year : undefined,
		genre: text(common.genre?.[0]),
		durationMs:
			duration !== undefined && Number.isFinite(duration) && duration >= 0
				? Math.round(duration * 1000)
				: undefined,
	};
}

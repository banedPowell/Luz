import { z } from 'zod';

import type { AlbumQuality } from './quality.ts';

export const trackSortKeys = ['title', 'artist', 'album', 'year', 'duration', 'added'] as const;
export const albumSortKeys = ['title', 'artist', 'year'] as const;
export const artistSortKeys = ['name'] as const;
export const sortOrders = ['asc', 'desc'] as const;

export type TrackSortKey = (typeof trackSortKeys)[number];
export type AlbumSortKey = (typeof albumSortKeys)[number];
export type ArtistSortKey = (typeof artistSortKeys)[number];
export type SortOrder = (typeof sortOrders)[number];

/** The most items a list page can hold, so one request never loads a whole library. */
export const maxPageSize = 100;

export const defaultPageSize = 50;

// Query strings arrive as text, hence the coercion
const pagination = {
	order: z.enum(sortOrders).default('asc'),
	page: z.coerce.number().int().positive().default(1),
	pageSize: z.coerce.number().int().positive().max(maxPageSize).default(defaultPageSize),
};

export const trackListQuerySchema = z.object({
	sort: z.enum(trackSortKeys).default('title'),
	...pagination,
});

export const albumListQuerySchema = z.object({
	sort: z.enum(albumSortKeys).default('title'),
	...pagination,
});

export const artistListQuerySchema = z.object({
	sort: z.enum(artistSortKeys).default('name'),
	...pagination,
});

export type TrackListQuery = z.infer<typeof trackListQuerySchema>;
export type AlbumListQuery = z.infer<typeof albumListQuerySchema>;
export type ArtistListQuery = z.infer<typeof artistListQuerySchema>;

/** The id in the path of an album or artist detail endpoint. */
export const libraryIdSchema = z.object({ id: z.coerce.number().int().positive() });

/** One page of a sorted list, with the total so the client can paginate. */
export interface LibraryPage<T> {
	items: T[];
	total: number;
	page: number;
	pageSize: number;
}

/** A track as the library views show it. `null` values are untagged. */
export interface TrackSummary {
	id: number;
	title: string | null;
	// The absolute path: Luz shows the files it manages
	path: string;
	// Shown in place of a missing title
	fileName: string;
	artists: string | null;
	trackNumber: number | null;
	discNumber: number | null;
	year: number | null;
	durationMs: number | null;
	// `null` until a scan reads the file again, for a track indexed before codecs were stored
	codec: string | null;
	bitrate: number | null;
	// When the scan first indexed the file; `null` for a track indexed before it was stored
	addedAtMs: number | null;
	album: { id: number; title: string | null };
	artist: { id: number; name: string | null };
}

export interface AlbumSummary {
	id: number;
	title: string | null;
	artist: { id: number; name: string | null };
	// The latest year among its tracks
	year: number | null;
	trackCount: number;
	// `null` until every track's codec is known (see albumQuality)
	quality: AlbumQuality | null;
}

export interface ArtistSummary {
	id: number;
	name: string | null;
	albumCount: number;
	trackCount: number;
}

/**
 * A track with everything the index knows of its file: the audio read with its tags and the
 * file itself. The audio values stay `null` while `lossless` is, for a track indexed before
 * they were stored, until the next scan reads it again.
 */
export interface TrackDetail extends TrackSummary {
	genre: string | null;
	fileSize: number;
	modifiedAtMs: number;
	codecProfile: string | null;
	lossless: boolean | null;
	sampleRate: number | null;
	bitDepth: number | null;
	channels: number | null;
}

/** A folder holding tracks of an album. */
export interface AlbumFolder {
	path: string;
	// Relative to the music library, shorter to read; `null` for the library itself or a
	// folder outside it
	relativePath: string | null;
}

/** An album with its tracks, by disc then track number. */
export interface AlbumDetail extends AlbumSummary {
	// The folders holding its tracks, sorted by path: usually one, several when the discs or
	// tracks of one album sit in different folders
	folders: AlbumFolder[];
	tracks: TrackSummary[];
}

/** An artist with its albums, oldest first, each with its tracks by disc then track number. */
export interface ArtistDetail extends ArtistSummary {
	albums: AlbumDetail[];
}

/** A duration as `m:ss`, or `h:mm:ss` from one hour; `null` stays unknown. */
export function formatDuration(durationMs: number | null): string | null {
	if (durationMs === null) {
		return null;
	}
	const totalSeconds = Math.round(durationMs / 1000);
	const hours = Math.floor(totalSeconds / 3600);
	const minutes = Math.floor((totalSeconds % 3600) / 60);
	const seconds = String(totalSeconds % 60).padStart(2, '0');
	return hours > 0
		? `${hours}:${String(minutes).padStart(2, '0')}:${seconds}`
		: `${minutes}:${seconds}`;
}

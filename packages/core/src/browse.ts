import { z } from 'zod';

export const trackSortKeys = ['title', 'artist', 'album', 'year', 'duration'] as const;
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
	// Shown in place of a missing title
	fileName: string;
	artists: string | null;
	trackNumber: number | null;
	discNumber: number | null;
	year: number | null;
	durationMs: number | null;
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
}

export interface ArtistSummary {
	id: number;
	name: string | null;
	albumCount: number;
	trackCount: number;
}

/** An album with its tracks, by disc then track number. */
export interface AlbumDetail extends AlbumSummary {
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

import { z } from 'zod';

import type { AlbumSummary, ArtistSummary, TrackSummary } from './browse.ts';

/** The longest search query accepted, after trimming. */
export const maxSearchQueryLength = 100;

/** The most results a search returns for each of tracks, albums and artists. */
export const searchResultLimit = 10;

export const librarySearchQuerySchema = z.object({
	q: z.string().trim().max(maxSearchQueryLength).default(''),
});

export type LibrarySearchQuery = z.infer<typeof librarySearchQuerySchema>;

/**
 * The form a name is searched in: compatibility-decomposed, without combining marks,
 * lowercase, with whitespace collapsed. The query and the stored names go through the
 * same function, so "beyonce" finds "Beyoncé" and "ＡＢＣ" finds "ABC".
 */
export function searchKey(value: string): string {
	return value
		.normalize('NFKD')
		.replace(/\p{M}/gu, '')
		.toLowerCase()
		.replace(/\s+/gu, ' ')
		.trim();
}

/** The first results of one kind, and how many match in all. */
export interface SearchGroup<T> {
	items: T[];
	total: number;
}

export interface LibrarySearchResult {
	// The trimmed query the results are for; '' returns no results
	query: string;
	tracks: SearchGroup<TrackSummary>;
	albums: SearchGroup<AlbumSummary>;
	artists: SearchGroup<ArtistSummary>;
}

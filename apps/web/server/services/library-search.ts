import {
	searchKey,
	searchResultLimit,
	type LibrarySearchQuery,
	type LibrarySearchResult,
} from '@luz/core';

import type { Database } from '../infrastructure/database/client';
import {
	searchAlbums,
	searchArtists,
	searchTracks,
} from '../infrastructure/database/library-repository';

const noResults = { items: [], total: 0 };

/**
 * Tracks by title, albums by title and artists by name, each limited to the first
 * results. Matching ignores case and accents and finds partial words (see searchKey).
 */
export async function searchLibrary(
	db: Database,
	{ q }: LibrarySearchQuery,
): Promise<LibrarySearchResult> {
	const key = searchKey(q);
	// A query of marks or blanks only normalises to nothing, which would match everything
	if (key === '') {
		return { query: q, tracks: noResults, albums: noResults, artists: noResults };
	}
	const [tracks, albums, artists] = await Promise.all([
		searchTracks(db, key, searchResultLimit),
		searchAlbums(db, key, searchResultLimit),
		searchArtists(db, key, searchResultLimit),
	]);
	return { query: q, tracks, albums, artists };
}

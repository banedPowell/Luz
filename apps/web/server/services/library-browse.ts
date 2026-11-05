import type {
	AlbumDetail,
	AlbumListQuery,
	AlbumSummary,
	ArtistDetail,
	ArtistListQuery,
	ArtistSummary,
	LibraryPage,
	TrackDetail,
	TrackListQuery,
	TrackSummary,
} from '@luz/core';

import type { Database } from '../infrastructure/database/client';
import {
	countAlbums,
	countArtists,
	countTracks,
	findAlbum,
	findArtist,
	findTrack,
	listAlbums,
	listArtists,
	listTracks,
	type ListWindow,
} from '../infrastructure/database/library-repository';
import { readSettings } from '../infrastructure/database/settings-repository';

// The database sorts and cuts the page; a page past the end is empty, not an error

function windowOf<Sort extends string>(query: {
	sort: Sort;
	order: ListWindow<Sort>['order'];
	page: number;
	pageSize: number;
}): ListWindow<Sort> {
	return {
		sort: query.sort,
		order: query.order,
		limit: query.pageSize,
		offset: (query.page - 1) * query.pageSize,
	};
}

async function pageOf<T>(
	query: { page: number; pageSize: number },
	items: Promise<T[]>,
	total: Promise<number>,
): Promise<LibraryPage<T>> {
	return { items: await items, total: await total, page: query.page, pageSize: query.pageSize };
}

export function browseTracks(
	db: Database,
	query: TrackListQuery,
): Promise<LibraryPage<TrackSummary>> {
	return pageOf(query, listTracks(db, windowOf(query)), countTracks(db));
}

export function browseAlbums(
	db: Database,
	query: AlbumListQuery,
): Promise<LibraryPage<AlbumSummary>> {
	return pageOf(query, listAlbums(db, windowOf(query)), countAlbums(db));
}

export function browseArtists(
	db: Database,
	query: ArtistListQuery,
): Promise<LibraryPage<ArtistSummary>> {
	return pageOf(query, listArtists(db, windowOf(query)), countArtists(db));
}

// Folders are shown relative to the music library, which the settings hold
export async function getAlbum(db: Database, id: number): Promise<AlbumDetail | undefined> {
	return findAlbum(db, id, (await readSettings(db)).musicLibraryPath);
}

export async function getArtist(db: Database, id: number): Promise<ArtistDetail | undefined> {
	return findArtist(db, id, (await readSettings(db)).musicLibraryPath);
}

export function getTrack(db: Database, id: number): Promise<TrackDetail | undefined> {
	return findTrack(db, id);
}

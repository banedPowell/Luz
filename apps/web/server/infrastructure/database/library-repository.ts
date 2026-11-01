import { basename } from 'node:path';
import {
	albumOf,
	artistOf,
	formatArtists,
	type AlbumDetail,
	type AlbumSortKey,
	type AlbumSummary,
	type ArtistDetail,
	type ArtistSortKey,
	type ArtistSummary,
	type SortOrder,
	type TrackSortKey,
	type TrackSummary,
	type TrackTags,
} from '@luz/core';
import {
	asc,
	count,
	countDistinct,
	eq,
	max,
	notExists,
	sql,
	type SQL,
	type SQLWrapper,
} from 'drizzle-orm';

import type { Database } from './client';
import { albums, artists, tracks } from './schema';

type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];

/** An audio file of the library, as the scan sees it. */
export interface TrackFile {
	path: string;
	fileSize: number;
	modifiedAtMs: number;
	tags: TrackTags;
}

/** A stored track with the album and artist it is grouped under. */
export interface LibraryTrack {
	id: number;
	path: string;
	title: string | null;
	artists: string | null;
	trackNumber: number | null;
	discNumber: number | null;
	year: number | null;
	genre: string | null;
	durationMs: number | null;
	fileSize: number;
	modifiedAtMs: number;
	album: { id: number; title: string | null };
	artist: { id: number; name: string | null };
}

/** Stores a new track, creating its album and artist if needed. Fails if the path exists. */
export async function insertTrack(db: Database, file: TrackFile): Promise<LibraryTrack> {
	await db.transaction(async (tx) => {
		await tx.insert(tracks).values(await toTrackRow(tx, file));
	});
	return requireTrack(db, file.path);
}

/**
 * Replaces the stored tags of a track. A track whose tags moved it to another album
 * leaves the old album, which is dropped once empty, as is its artist.
 * Returns `undefined` when no track has this path.
 */
export async function updateTrack(
	db: Database,
	file: TrackFile,
): Promise<LibraryTrack | undefined> {
	const updated = await db.transaction(async (tx) => {
		const rows = await tx
			.update(tracks)
			.set(await toTrackRow(tx, file))
			.where(eq(tracks.path, file.path))
			.returning({ id: tracks.id });
		// Also drops the album and artist just created for a path that does not exist
		await pruneEmptyGroups(tx);
		return rows.length > 0;
	});
	return updated ? requireTrack(db, file.path) : undefined;
}

export async function findTrackByPath(
	db: Database,
	path: string,
): Promise<LibraryTrack | undefined> {
	const [row] = await db
		.select({
			track: tracks,
			album: { id: albums.id, title: albums.title },
			artist: { id: artists.id, name: artists.name },
		})
		.from(tracks)
		.innerJoin(albums, eq(albums.id, tracks.albumId))
		.innerJoin(artists, eq(artists.id, albums.artistId))
		.where(eq(tracks.path, path));
	if (!row) {
		return undefined;
	}
	const { albumId: _albumId, ...track } = row.track;
	return { ...track, album: row.album, artist: row.artist };
}

/** Removes a track and the album and artist it leaves empty. Returns whether it existed. */
export async function deleteTrack(db: Database, path: string): Promise<boolean> {
	return db.transaction(async (tx) => {
		const rows = await tx
			.delete(tracks)
			.where(eq(tracks.path, path))
			.returning({ id: tracks.id });
		await pruneEmptyGroups(tx);
		return rows.length > 0;
	});
}

/** Removes every track, album and artist, for a scan that rebuilds the library. */
export async function clearLibrary(db: Database): Promise<void> {
	await db.transaction(async (tx) => {
		await tx.delete(tracks);
		await tx.delete(albums);
		await tx.delete(artists);
	});
}

async function requireTrack(db: Database, path: string): Promise<LibraryTrack> {
	const track = await findTrackByPath(db, path);
	if (!track) {
		throw new Error(`The track ${path} was just written but cannot be read back`);
	}
	return track;
}

async function toTrackRow(tx: Transaction, file: TrackFile): Promise<typeof tracks.$inferInsert> {
	const { tags } = file;
	return {
		path: file.path,
		albumId: await ensureAlbum(tx, file.tags),
		title: tags.title ?? null,
		artists: formatArtists(tags.artists),
		trackNumber: tags.trackNumber ?? null,
		discNumber: tags.discNumber ?? null,
		year: tags.year ?? null,
		genre: tags.genre ?? null,
		durationMs: tags.durationMs ?? null,
		fileSize: file.fileSize,
		modifiedAtMs: file.modifiedAtMs,
	};
}

// The no-op update makes RETURNING give the existing row's id; the name first seen stays
async function ensureAlbum(tx: Transaction, tags: TrackTags): Promise<number> {
	const artist = artistOf(tags);
	const [artistRow] = await tx
		.insert(artists)
		.values({ key: artist.key, name: artist.name })
		.onConflictDoUpdate({ target: artists.key, set: { key: artist.key } })
		.returning({ id: artists.id });

	const album = albumOf(tags);
	const [albumRow] = await tx
		.insert(albums)
		.values({ artistId: requireId(artistRow), key: album.key, title: album.name })
		.onConflictDoUpdate({ target: [albums.artistId, albums.key], set: { key: album.key } })
		.returning({ id: albums.id });
	return requireId(albumRow);
}

function requireId(row: { id: number } | undefined): number {
	if (!row) {
		throw new Error('An upsert returned no row');
	}
	return row.id;
}

// Albums first: dropping them is what leaves artists empty
async function pruneEmptyGroups(tx: Transaction): Promise<void> {
	await tx
		.delete(albums)
		.where(notExists(tx.select().from(tracks).where(eq(tracks.albumId, albums.id))));
	await tx
		.delete(artists)
		.where(notExists(tx.select().from(albums).where(eq(albums.artistId, artists.id))));
}

/** A sort and a window of a library list; the order is validated by @luz/core. */
export interface ListWindow<Sort extends string> {
	sort: Sort;
	order: SortOrder;
	limit: number;
	offset: number;
}

// Unknown values come last in both directions: they are the least useful to browse.
// NOCASE only folds ASCII letters, which is enough until a locale-aware sort is needed.
function by(expression: SQLWrapper, order: SortOrder, text = false): SQL {
	return text
		? sql`${expression} collate nocase ${sql.raw(order)} nulls last`
		: sql`${expression} ${sql.raw(order)} nulls last`;
}

// A track without a disc number is on the first disc
const inAlbumOrder = [
	sql`coalesce(${tracks.discNumber}, 1) asc`,
	by(tracks.trackNumber, 'asc'),
	by(tracks.title, 'asc', true),
];

const albumYear = max(tracks.year);

// What a track list shows as its artist: the track artists, else the album's
const trackArtist = sql`coalesce(${tracks.artists}, ${artists.name})`;

function selectTracks(db: Database) {
	return db
		.select({
			id: tracks.id,
			path: tracks.path,
			title: tracks.title,
			artists: tracks.artists,
			trackNumber: tracks.trackNumber,
			discNumber: tracks.discNumber,
			year: tracks.year,
			durationMs: tracks.durationMs,
			album: { id: albums.id, title: albums.title },
			artist: { id: artists.id, name: artists.name },
		})
		.from(tracks)
		.innerJoin(albums, eq(albums.id, tracks.albumId))
		.innerJoin(artists, eq(artists.id, albums.artistId));
}

type TrackRow = Awaited<ReturnType<typeof selectTracks>>[number];

// The path stays on the server; the file name stands in for a missing title
function toTrackSummary({ path: filePath, ...row }: TrackRow): TrackSummary {
	return { ...row, fileName: basename(filePath) };
}

// Inner joins: an album or artist always has tracks, empty groups being pruned
function selectAlbums(db: Database, where?: SQL) {
	return db
		.select({
			id: albums.id,
			title: albums.title,
			artist: { id: artists.id, name: artists.name },
			year: albumYear,
			trackCount: count(tracks.id),
		})
		.from(albums)
		.innerJoin(artists, eq(artists.id, albums.artistId))
		.innerJoin(tracks, eq(tracks.albumId, albums.id))
		.where(where)
		.groupBy(albums.id);
}

function selectArtists(db: Database, where?: SQL) {
	return db
		.select({
			id: artists.id,
			name: artists.name,
			albumCount: countDistinct(albums.id),
			trackCount: count(tracks.id),
		})
		.from(artists)
		.innerJoin(albums, eq(albums.artistId, artists.id))
		.innerJoin(tracks, eq(tracks.albumId, albums.id))
		.where(where)
		.groupBy(artists.id);
}

function trackOrder(sort: TrackSortKey, order: SortOrder): SQL[] {
	const byAlbum = [by(albums.title, 'asc', true), asc(albums.id), ...inAlbumOrder];
	const orders: Record<TrackSortKey, SQL[]> = {
		title: [by(tracks.title, order, true)],
		artist: [by(trackArtist, order, true), ...byAlbum],
		album: [by(albums.title, order, true), asc(albums.id), ...inAlbumOrder],
		year: [by(tracks.year, order), ...byAlbum],
		duration: [by(tracks.durationMs, order)],
	};
	return orders[sort];
}

function albumOrder(sort: AlbumSortKey, order: SortOrder): SQL[] {
	const orders: Record<AlbumSortKey, SQL[]> = {
		title: [by(albums.title, order, true), by(artists.name, 'asc', true)],
		artist: [
			by(artists.name, order, true),
			by(albumYear, 'asc'),
			by(albums.title, 'asc', true),
		],
		year: [by(albumYear, order), by(artists.name, 'asc', true), by(albums.title, 'asc', true)],
	};
	return orders[sort];
}

/** A sorted window of the tracks; ties end on the id, so pages never overlap. */
export async function listTracks(
	db: Database,
	{ sort, order, limit, offset }: ListWindow<TrackSortKey>,
): Promise<TrackSummary[]> {
	const rows = await selectTracks(db)
		.orderBy(...trackOrder(sort, order), asc(tracks.id))
		.limit(limit)
		.offset(offset);
	return rows.map(toTrackSummary);
}

export async function listAlbums(
	db: Database,
	{ sort, order, limit, offset }: ListWindow<AlbumSortKey>,
): Promise<AlbumSummary[]> {
	return selectAlbums(db)
		.orderBy(...albumOrder(sort, order), asc(albums.id))
		.limit(limit)
		.offset(offset);
}

export async function listArtists(
	db: Database,
	{ order, limit, offset }: ListWindow<ArtistSortKey>,
): Promise<ArtistSummary[]> {
	return selectArtists(db)
		.orderBy(by(artists.name, order, true), asc(artists.id))
		.limit(limit)
		.offset(offset);
}

export function countTracks(db: Database): Promise<number> {
	return db.$count(tracks);
}

export function countAlbums(db: Database): Promise<number> {
	return db.$count(albums);
}

export function countArtists(db: Database): Promise<number> {
	return db.$count(artists);
}

/** An album with its tracks by disc then track number, or `undefined` if there is none with this id. */
export async function findAlbum(db: Database, id: number): Promise<AlbumDetail | undefined> {
	const [album] = await selectAlbums(db, eq(albums.id, id));
	if (!album) {
		return undefined;
	}
	const rows = await selectTracks(db)
		.where(eq(tracks.albumId, id))
		.orderBy(...inAlbumOrder, asc(tracks.id));
	return { ...album, tracks: rows.map(toTrackSummary) };
}

/** An artist with its albums, oldest first, each with its tracks; `undefined` if there is none with this id. */
export async function findArtist(db: Database, id: number): Promise<ArtistDetail | undefined> {
	const [artist] = await selectArtists(db, eq(artists.id, id));
	if (!artist) {
		return undefined;
	}
	const albumRows = await selectAlbums(db, eq(albums.artistId, id)).orderBy(
		by(albumYear, 'asc'),
		by(albums.title, 'asc', true),
		asc(albums.id),
	);
	const trackRows = await selectTracks(db)
		.where(eq(albums.artistId, id))
		.orderBy(...inAlbumOrder, asc(tracks.id));
	const tracksByAlbum = Map.groupBy(trackRows.map(toTrackSummary), (track) => track.album.id);
	return {
		...artist,
		albums: albumRows.map((album) => ({ ...album, tracks: tracksByAlbum.get(album.id) ?? [] })),
	};
}

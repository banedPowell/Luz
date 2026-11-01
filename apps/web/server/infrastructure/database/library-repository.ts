import { albumOf, artistOf, formatArtists, type TrackTags } from '@luz/core';
import { eq, notExists } from 'drizzle-orm';

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

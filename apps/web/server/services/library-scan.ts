import { isAudioFile, type ScanErrorReason, type ScanSummary } from '@luz/core';

import type { Database } from '../infrastructure/database/client';
import {
	deleteTracks,
	insertTrack,
	listIndexedFiles,
	updateTrack,
} from '../infrastructure/database/library-repository';
import { readSettings } from '../infrastructure/database/settings-repository';
import { isDirectory, walkFiles } from '../infrastructure/file-system';
import type { TagReader } from '../infrastructure/tag-reader';

export class ScanError extends Error {
	constructor(readonly reason: ScanErrorReason) {
		super(scanErrorMessages[reason]);
		this.name = 'ScanError';
	}
}

const scanErrorMessages: Record<ScanErrorReason, string> = {
	'library-path-unset': 'No music library folder is set',
	'library-path-missing': 'The music library folder does not exist or is not a folder',
	'scan-running': 'A scan is already running',
};

// One scan per server: two would compare against and write the same tables at once
let running = false;

/**
 * Brings the index up to date with the music library folder of the settings: new files
 * are added, files whose size or modification time changed are read again, and tracks
 * whose file is gone (removed, moved, or outside a new library folder) are removed with
 * the albums and artists they leave empty. Unchanged files are not read, unless their track
 * was indexed before its codec was stored. Files are only
 * read, never modified. A file whose tags cannot be read is skipped and counted (a changed
 * one leaves the index, its stored tags being stale); the scan goes on. The tracks it adds
 * are dated by `now` when the scan starts.
 */
export async function scanLibrary(
	db: Database,
	tagReader: TagReader,
	now: () => number = Date.now,
): Promise<ScanSummary> {
	if (running) {
		throw new ScanError('scan-running');
	}
	running = true;
	try {
		return await scan(db, tagReader, now());
	} finally {
		running = false;
	}
}

// The tracks a scan adds share its start time as their date added
async function scan(db: Database, tagReader: TagReader, startedAtMs: number): Promise<ScanSummary> {
	const { musicLibraryPath } = await readSettings(db);
	if (musicLibraryPath === undefined) {
		throw new ScanError('library-path-unset');
	}
	if (!(await isDirectory(musicLibraryPath))) {
		throw new ScanError('library-path-missing');
	}

	const indexed = new Map((await listIndexedFiles(db)).map((file) => [file.path, file]));
	const summary: ScanSummary = { added: 0, updated: 0, removed: 0, unchanged: 0, skipped: 0 };
	// Tracks to drop although their file is still there: their tags could not be read again
	const unreadable: string[] = [];
	for await (const file of walkFiles(musicLibraryPath)) {
		if (!isAudioFile(file.path)) {
			continue;
		}
		const known = indexed.get(file.path);
		indexed.delete(file.path);
		const changed =
			!known || known.fileSize !== file.size || known.modifiedAtMs !== file.modifiedAtMs;
		// A track indexed before codecs were stored is read again once, changed or not
		if (!changed && known.audioKnown) {
			summary.unchanged++;
			continue;
		}
		const result = await tagReader.read(file.path);
		if (!result.ok) {
			summary.skipped++;
			// An unchanged file keeps the tags it had; only its codec stays unknown
			if (known && changed) {
				unreadable.push(file.path);
			}
			continue;
		}
		const track = {
			path: file.path,
			fileSize: file.size,
			modifiedAtMs: file.modifiedAtMs,
			tags: result.tags,
			audio: result.audio,
		};
		if (known) {
			await updateTrack(db, track);
			summary.updated++;
		} else {
			await insertTrack(db, track, startedAtMs);
			summary.added++;
		}
	}
	// What the walk did not meet is gone. Removed last, so that a file moved to another folder
	// with the same tags keeps its album and artist rows, and their ids, in between
	const gone = [...indexed.keys()];
	await deleteTracks(db, [...gone, ...unreadable]);
	summary.removed = gone.length;
	return summary;
}

import path from 'node:path';
import {
	isAudioFile,
	type ScanErrorReason,
	type ScanOptions,
	type ScanScope,
	type ScanSummary,
} from '@luz/core';

import type { Database } from '../infrastructure/database/client';
import {
	deleteTracks,
	insertTrack,
	listIndexedFiles,
	updateTrack,
	type IndexedFile,
} from '../infrastructure/database/library-repository';
import { readSettings } from '../infrastructure/database/settings-repository';
import {
	isDirectory,
	statFile,
	statFileInside,
	walkFiles,
	type FileEntry,
} from '../infrastructure/file-system';
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
let running: Promise<unknown> | undefined;

/** Runs a scan once no other one is running: refused, or after waiting for it. */
async function exclusive<T>(run: () => Promise<T>, wait: boolean): Promise<T> {
	// Another caller may have started a scan by the time a wait ends: check again
	for (let busy = running; busy; busy = running) {
		if (!wait) {
			throw new ScanError('scan-running');
		}
		await busy.catch(() => undefined);
	}
	// Set before anything awaits, so a second caller sees it
	const current = run();
	running = current;
	try {
		return await current;
	} finally {
		running = undefined;
	}
}

/**
 * Brings the index up to date with the music library folder of the settings: new files
 * are added, files whose size or modification time changed are read again, and tracks
 * whose file is gone (removed, moved, or outside a new library folder) are removed with
 * the albums and artists they leave empty. Unchanged files are not read, unless `force`
 * is set or their track was indexed before its codec was stored. Files are only read,
 * never modified. A file whose tags cannot be read is skipped and counted (a changed one
 * leaves the index, its stored tags being stale); the scan goes on. The tracks it adds
 * are dated by `now` when the scan starts.
 *
 * An album or track scope looks only at the tracks already indexed in it: their files are
 * compared one by one, the folder is never listed, so nothing is added. A files scope reads
 * the files it names, adding or updating them, and never removes a track: a path outside the
 * library, missing, reached through a link or not audio is skipped and counted.
 *
 * A scan already running refuses this one.
 */
export async function scanLibrary(
	db: Database,
	tagReader: TagReader,
	options: Partial<ScanOptions> = {},
	now: () => number = Date.now,
): Promise<ScanSummary> {
	return exclusive(
		() =>
			scan(
				db,
				tagReader,
				options.scope ?? { kind: 'library' },
				options.force ?? false,
				now(),
			),
		false,
	);
}

/**
 * Indexes files just written to the library, as a files scan does, once the scan running,
 * if any, has ended: a download waits for it rather than being refused.
 */
export async function indexLibraryFiles(
	db: Database,
	tagReader: TagReader,
	paths: readonly string[],
	now: () => number = Date.now,
): Promise<ScanSummary> {
	return exclusive(
		() => scan(db, tagReader, { kind: 'files', paths: [...paths] }, false, now()),
		true,
	);
}

async function scan(
	db: Database,
	tagReader: TagReader,
	scope: ScanScope,
	force: boolean,
	startedAtMs: number,
): Promise<ScanSummary> {
	const { musicLibraryPath } = await readSettings(db);
	if (musicLibraryPath === undefined) {
		throw new ScanError('library-path-unset');
	}
	if (!(await isDirectory(musicLibraryPath))) {
		throw new ScanError('library-path-missing');
	}

	if (scope.kind === 'files') {
		return scanFiles(db, tagReader, musicLibraryPath, scope.paths, force, startedAtMs);
	}
	const indexed = new Map((await listIndexedFiles(db, scope)).map((file) => [file.path, file]));
	const pass = new ScanPass(db, tagReader, force, startedAtMs, true);
	if (scope.kind === 'library') {
		for await (const file of walkFiles(musicLibraryPath)) {
			if (isAudioFile(file.path)) {
				await pass.compare(file, indexed.get(file.path));
				indexed.delete(file.path);
			}
		}
	} else {
		for (const known of indexed.values()) {
			// What the walk would not meet counts as gone, so both scans agree on the index
			const file = isInLibrary(musicLibraryPath, known.path)
				? await statFile(known.path)
				: undefined;
			if (file) {
				await pass.compare(file, known);
				indexed.delete(known.path);
			}
		}
	}
	// What the scan did not meet is gone. Removed last, so that a file moved to another folder
	// with the same tags keeps its album and artist rows, and their ids, in between
	return pass.finish([...indexed.keys()]);
}

async function scanFiles(
	db: Database,
	tagReader: TagReader,
	musicLibraryPath: string,
	paths: readonly string[],
	force: boolean,
	startedAtMs: number,
): Promise<ScanSummary> {
	const library = path.resolve(musicLibraryPath);
	// Stored as the walk writes them: absolute, resolved from the library folder
	const resolved = [...new Set(paths.map((filePath) => path.resolve(library, filePath)))];
	const indexed = new Map(
		(await listIndexedFiles(db, { kind: 'files', paths: resolved })).map((file) => [
			file.path,
			file,
		]),
	);
	const pass = new ScanPass(db, tagReader, force, startedAtMs, false);
	for (const filePath of resolved) {
		const file = isInLibrary(library, filePath)
			? await statFileInside(library, filePath)
			: undefined;
		if (file) {
			await pass.compare(file, indexed.get(filePath));
		} else {
			pass.skip();
		}
	}
	return pass.finish([]);
}

// The walk only meets audio files inside the library folder, out of hidden entries
function isInLibrary(libraryPath: string, filePath: string): boolean {
	const relativePath = path.relative(path.resolve(libraryPath), filePath);
	return (
		relativePath !== '' &&
		!path.isAbsolute(relativePath) &&
		relativePath.split(path.sep).every((part) => part !== '..' && !part.startsWith('.')) &&
		isAudioFile(filePath)
	);
}

/** The comparison of a file on disk with its indexed track, shared by every scope. */
class ScanPass {
	private readonly summary: ScanSummary = {
		added: 0,
		updated: 0,
		removed: 0,
		unchanged: 0,
		skipped: 0,
	};
	// Tracks to drop although their file is still there: their tags could not be read again
	private readonly unreadable: string[] = [];

	constructor(
		private readonly db: Database,
		private readonly tagReader: TagReader,
		private readonly force: boolean,
		private readonly startedAtMs: number,
		// Only a scan that meets every file of its scope may drop a track
		private readonly removes: boolean,
	) {}

	skip(): void {
		this.summary.skipped++;
	}

	async compare(file: FileEntry, known: IndexedFile | undefined): Promise<void> {
		const changed =
			!known || known.fileSize !== file.size || known.modifiedAtMs !== file.modifiedAtMs;
		// A track indexed before codecs were stored is read again once, changed or not
		if (!changed && !this.force && known.audioKnown) {
			this.summary.unchanged++;
			return;
		}
		const result = await this.tagReader.read(file.path);
		if (!result.ok) {
			this.summary.skipped++;
			// An unchanged file keeps the tags it had; only its codec stays unknown
			if (known && changed && this.removes) {
				this.unreadable.push(file.path);
			}
			return;
		}
		const track = {
			path: file.path,
			fileSize: file.size,
			modifiedAtMs: file.modifiedAtMs,
			tags: result.tags,
			audio: result.audio,
		};
		if (known) {
			await updateTrack(this.db, track);
			this.summary.updated++;
		} else {
			await insertTrack(this.db, track, this.startedAtMs);
			this.summary.added++;
		}
	}

	async finish(gone: string[]): Promise<ScanSummary> {
		await deleteTracks(this.db, [...gone, ...this.unreadable]);
		return { ...this.summary, removed: gone.length };
	}
}

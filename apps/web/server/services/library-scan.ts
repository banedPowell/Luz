import { isAudioFile, type ScanErrorReason, type ScanSummary } from '@luz/core';

import type { Database } from '../infrastructure/database/client';
import { clearLibrary, insertTrack } from '../infrastructure/database/library-repository';
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

// One scan per server: two would clear and fill the same tables at once
let running = false;

/**
 * Scans the music library folder of the settings into the index, replacing what it held
 * (detecting changes is #35). Files are only read, never modified. A file whose tags cannot
 * be read is skipped and counted; the scan goes on.
 */
export async function scanLibrary(db: Database, tagReader: TagReader): Promise<ScanSummary> {
	if (running) {
		throw new ScanError('scan-running');
	}
	running = true;
	try {
		return await scan(db, tagReader);
	} finally {
		running = false;
	}
}

async function scan(db: Database, tagReader: TagReader): Promise<ScanSummary> {
	const { musicLibraryPath } = await readSettings(db);
	if (musicLibraryPath === undefined) {
		throw new ScanError('library-path-unset');
	}
	if (!(await isDirectory(musicLibraryPath))) {
		throw new ScanError('library-path-missing');
	}

	await clearLibrary(db);
	const summary: ScanSummary = { filesFound: 0, tracksIndexed: 0, filesSkipped: 0 };
	for await (const file of walkFiles(musicLibraryPath)) {
		if (!isAudioFile(file.path)) {
			continue;
		}
		summary.filesFound++;
		const result = await tagReader.read(file.path);
		if (!result.ok) {
			summary.filesSkipped++;
			continue;
		}
		await insertTrack(db, {
			path: file.path,
			fileSize: file.size,
			modifiedAtMs: file.modifiedAtMs,
			tags: result.tags,
		});
		summary.tracksIndexed++;
	}
	return summary;
}

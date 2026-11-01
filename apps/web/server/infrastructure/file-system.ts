import { mkdirSync } from 'node:fs';
import { opendir, stat } from 'node:fs/promises';
import path from 'node:path';

/**
 * Creates the directory and its parents if needed.
 * Returns true when something was created, false when it already existed.
 */
export function ensureDirectory(directory: string): boolean {
	// Synchronous because Nitro 2 does not await plugins, and this runs once at startup
	return mkdirSync(directory, { recursive: true }) !== undefined;
}

/** Whether the path exists and is a directory (following a link at the path itself). */
export async function isDirectory(directory: string): Promise<boolean> {
	try {
		return (await stat(directory)).isDirectory();
	} catch {
		return false;
	}
}

/** A regular file met while walking a directory. */
export interface FileEntry {
	path: string;
	size: number;
	modifiedAtMs: number;
}

/**
 * Lists the regular files under a directory, recursively and in name order, without
 * opening them. Symbolic links (and Windows junctions) are not followed, so a link cannot
 * loop or pull in files from outside the folder; hidden entries (names starting with a
 * dot) are skipped with their content. A subfolder or file that cannot be read is
 * skipped too: only a root that cannot be listed rejects.
 */
export async function* walkFiles(root: string): AsyncGenerator<FileEntry> {
	yield* walk(path.resolve(root), true);
}

async function* walk(directory: string, isRoot: boolean): AsyncGenerator<FileEntry> {
	let names: { name: string; isFile: boolean; isDirectory: boolean }[];
	try {
		names = [];
		for await (const entry of await opendir(directory)) {
			// Dirent describes the entry itself: a link is neither a file nor a directory here
			names.push({
				name: entry.name,
				isFile: entry.isFile(),
				isDirectory: entry.isDirectory(),
			});
		}
	} catch (error) {
		if (isRoot) {
			throw error;
		}
		return;
	}
	names.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

	for (const entry of names) {
		if (entry.name.startsWith('.')) {
			continue;
		}
		const entryPath = path.join(directory, entry.name);
		if (entry.isDirectory) {
			yield* walk(entryPath, false);
		} else if (entry.isFile) {
			try {
				const stats = await stat(entryPath);
				yield {
					path: entryPath,
					size: stats.size,
					modifiedAtMs: Math.trunc(stats.mtimeMs),
				};
			} catch {
				// Removed or locked between the listing and now
			}
		}
	}
}

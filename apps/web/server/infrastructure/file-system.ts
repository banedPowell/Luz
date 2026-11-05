import { mkdirSync } from 'node:fs';
import { constants } from 'node:fs';
import { copyFile, lstat, mkdir, opendir, rm, stat } from 'node:fs/promises';
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

/**
 * The size and modification time of a regular file, or `undefined` when there is none at
 * this path. Like the walk, it does not follow a symbolic link: a link is no file here.
 */
export async function statFile(filePath: string): Promise<FileEntry | undefined> {
	try {
		const stats = await lstat(filePath);
		return stats.isFile()
			? { path: filePath, size: stats.size, modifiedAtMs: Math.trunc(stats.mtimeMs) }
			: undefined;
	} catch {
		return undefined;
	}
}

/**
 * Like `statFile`, for a file under `root`, and only when no folder between the root and
 * the file is a symbolic link or a junction: a link inside the library could lead outside.
 */
export async function statFileInside(
	root: string,
	filePath: string,
): Promise<FileEntry | undefined> {
	const top = path.resolve(root);
	const parts = path.relative(top, path.resolve(filePath)).split(path.sep);
	if (
		parts.some((part) => part === '..' || part === '') ||
		path.isAbsolute(parts.join(path.sep))
	) {
		return undefined;
	}
	// The folders between the root and the file, the root itself left out
	let folder = top;
	for (const part of parts.slice(0, -1)) {
		folder = path.join(folder, part);
		try {
			if ((await lstat(folder)).isSymbolicLink()) {
				return undefined;
			}
		} catch {
			return undefined;
		}
	}
	return statFile(filePath);
}

/**
 * The names of the regular files directly inside a directory, or an empty list when
 * there is no readable directory at this path. Links are not followed, like the walk.
 */
export async function listFileNames(directory: string): Promise<string[]> {
	try {
		const names: string[] = [];
		for await (const entry of await opendir(directory)) {
			if (entry.isFile()) {
				names.push(entry.name);
			}
		}
		return names;
	} catch {
		return [];
	}
}

/** What became of a file moved into the library: `exists` leaves both files as they were. */
export type MoveOutcome = 'moved' | 'exists';

/**
 * Moves a finished download into the music library, creating the folders it needs. An
 * existing file at the target is never replaced: the outcome says so and nothing changes.
 * This is the only write to the music library (ADR 0007).
 */
export async function moveIntoLibrary(source: string, target: string): Promise<MoveOutcome> {
	await mkdir(path.dirname(target), { recursive: true });
	try {
		// A copy, not a rename: the data directory and the library can be on different drives,
		// and the exclusive flag refuses an existing target in the same step as the write
		await copyFile(source, target, constants.COPYFILE_EXCL);
	} catch (error) {
		if (isErrorCode(error, 'EEXIST')) {
			return 'exists';
		}
		// The target did not exist before the copy: what is there is our own partial file
		await rm(target, { force: true });
		throw error;
	}
	await rm(source, { force: true });
	return 'moved';
}

function isErrorCode(error: unknown, code: string): boolean {
	return error instanceof Error && 'code' in error && error.code === code;
}

/** Creates a folder of the data directory and its parents, if needed. */
export async function createDirectory(directory: string): Promise<void> {
	await mkdir(directory, { recursive: true });
}

/**
 * Removes a folder of the data directory with its content, and does nothing when there is
 * none. Never called on the music library: only on a download job's own folder.
 */
export async function removeDirectory(directory: string): Promise<void> {
	await rm(directory, { recursive: true, force: true, maxRetries: 3 });
}

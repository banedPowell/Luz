import { mkdirSync } from 'node:fs';

/**
 * Creates the directory and its parents if needed.
 * Returns true when something was created, false when it already existed.
 */
export function ensureDirectory(directory: string): boolean {
	// Synchronous because Nitro 2 does not await plugins, and this runs once at startup
	return mkdirSync(directory, { recursive: true }) !== undefined;
}

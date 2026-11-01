import { existsSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';

import type { MigrationReader } from '../../../server/infrastructure/database/migrations';

const migrationsFolder = path.join(
	import.meta.dirname,
	'../../../server/infrastructure/database/migrations',
);

// The committed migrations, read from disk instead of Nitro's server assets
export const readMigrationsFolder: MigrationReader = async (file) => {
	const filePath = path.join(migrationsFolder, file);
	return existsSync(filePath) ? readFileSync(filePath, 'utf8') : undefined;
};

/**
 * Deletes a folder holding a closed database. close() leaves native statements to the
 * garbage collector, and Windows keeps the file locked until their finalizers run
 * (--expose-gc in vite.config.ts), which can take a few collections.
 */
export async function removeWhenReleased(folder: string): Promise<void> {
	for (let attempt = 1; ; attempt++) {
		globalThis.gc?.();
		await new Promise((resolve) => setTimeout(resolve, 10));
		try {
			rmSync(folder, { recursive: true, force: true });
			return;
		} catch (error) {
			if (attempt === 20) {
				throw error;
			}
		}
	}
}

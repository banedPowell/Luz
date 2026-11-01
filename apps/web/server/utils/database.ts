import path from 'node:path';

import { databaseFileName, openDatabase, type Database } from '../infrastructure/database/client';
import { fillSearchKeys } from '../infrastructure/database/library-repository';
import { applyMigrations, loadMigrations } from '../infrastructure/database/migrations';
import { ensureSettings } from '../infrastructure/database/settings-repository';
import { useLuzConfig } from './config';
import { logger } from './logger';

let database: Promise<Database> | undefined;

/**
 * The database, once its migrations are applied, the settings row exists and every name has
 * its search key. Started at startup by the database plugin; awaiting it here means a failed
 * migration surfaces as an error to the caller.
 */
export function useDatabase(): Promise<Database> {
	database ??= initializeDatabase();
	return database;
}

async function initializeDatabase(): Promise<Database> {
	const { dataDir } = useLuzConfig();
	const db = openDatabase(dataDir);

	// Bundled with the server (nitro.serverAssets in nuxt.config.ts), in dev and in .output
	const assets = useStorage('assets:migrations');
	const migrations = await loadMigrations(async (file) => {
		const content = await assets.getItemRaw<unknown>(file.replaceAll('/', ':'));
		return decode(content);
	});
	const applied = await applyMigrations(db.$client, migrations);

	const file = path.join(dataDir, databaseFileName);
	if (applied.length > 0) {
		logger.info(
			`Database ${file}: applied ${applied.map((migration) => migration.tag).join(', ')}`,
		);
	} else {
		logger.info(`Database ${file}: up to date`);
	}

	// On first start, the defaults from @luz/core; later starts keep the stored choices
	await ensureSettings(db);
	const filled = await fillSearchKeys(db);
	if (filled > 0) {
		logger.info(`Database ${file}: indexed ${filled} names for search`);
	}
	return db;
}

// Server assets come back as a string or as bytes depending on the preset and the dev server
function decode(content: unknown): string | undefined {
	if (typeof content === 'string') {
		return content;
	}
	if (content instanceof Uint8Array) {
		return new TextDecoder().decode(content);
	}
	return undefined;
}

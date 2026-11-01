import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';

import { ensureDirectory } from '../file-system';
import * as schema from './schema';

/** The database file, inside the data directory. */
export const databaseFileName = 'luz.db';

export type Database = ReturnType<typeof openDatabase>;

/** Opens (and creates if needed) the SQLite database of a data directory. */
export function openDatabase(dataDir: string) {
	// The data directory plugin usually created it already; plugin order is not relied upon
	ensureDirectory(dataDir);
	const client = createClient({ url: pathToFileURL(path.join(dataDir, databaseFileName)).href });
	return drizzle(client, { schema });
}

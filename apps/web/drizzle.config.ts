import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

import { defineConfig } from 'drizzle-kit';

import { databaseFileName } from './server/infrastructure/database/client';
import { resolveDataDirectory } from './server/infrastructure/data-directory';

// drizzle-kit does not read .env like the Nuxt CLI does; load it so studio opens
// the same database as `vp run dev`
if (existsSync('.env')) {
	process.loadEnvFile('.env');
}

const dataDir = resolveDataDirectory(process.env.NUXT_DATA_DIR ?? '', {
	platform: process.platform,
	env: process.env,
	homeDir: homedir(),
	cwd: process.cwd(),
});

export default defineConfig({
	dialect: 'sqlite',
	schema: './server/infrastructure/database/schema.ts',
	out: './server/infrastructure/database/migrations',
	// Only studio connects; generate works from the schema and the snapshots
	dbCredentials: {
		url: `file:${path.join(dataDir, databaseFileName)}`,
	},
});

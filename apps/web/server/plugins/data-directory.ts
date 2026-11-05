import { ensureDirectory } from '../infrastructure/file-system';
import { useLuzConfig } from '../utils/config';
import { logger } from '../utils/logger';

// Runs once at startup, before any request: everything stored later (database,
// cookies, caches) can rely on the data directory existing.
export default defineNitroPlugin(() => {
	const config = useLuzConfig();

	if (ensureDirectory(config.dataDir)) {
		logger.info(`Created the data directory ${config.dataDir}`);
	} else {
		logger.info(`Data directory: ${config.dataDir}`);
	}
});

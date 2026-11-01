import { useDatabase } from '../utils/database';
import { logger } from '../utils/logger';

// Nitro 2 does not await plugins, but it awaits the request hook: holding requests
// until the migrations are done means no handler ever sees an outdated schema.
export default defineNitroPlugin((nitroApp) => {
	const database = useDatabase();
	const ready = database.then(
		() => undefined,
		(error: unknown) => {
			// Logged once here; useDatabase() rethrows to every caller
			logger.error('Could not open or migrate the database', error);
		},
	);

	nitroApp.hooks.hook('request', () => ready);
	nitroApp.hooks.hook('close', async () => {
		(await database.catch(() => undefined))?.$client.close();
	});
});

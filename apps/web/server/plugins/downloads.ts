import { useDownloadQueue } from '../utils/downloads';
import { logger } from '../utils/logger';

// Not awaited: Nitro 2 does not wait for plugins. The queue first marks the jobs a stopped
// server left running as interrupted, then runs those still queued.
export default defineNitroPlugin((nitroApp) => {
	const queue = useDownloadQueue();
	queue
		.then((downloads) => downloads.start())
		.catch((error: unknown) => {
			logger.error('Could not start the download queue', error);
		});
	nitroApp.hooks.hook('close', async () => {
		(await queue.catch(() => undefined))?.stop();
	});
});

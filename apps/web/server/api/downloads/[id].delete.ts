import { libraryIdSchema } from '@luz/core';

import { findDownloadJob } from '../../infrastructure/database/download-repository';

// Cancelling never deletes music: only the job's own folder in the data directory goes
export default defineEventHandler(async (event) => {
	const { id } = await getValidatedRouterParams(event, (value) => libraryIdSchema.parse(value));
	const outcome = await (await useDownloadQueue()).cancel(id);
	if (outcome === 'not-found') {
		throw createError({
			statusCode: 404,
			statusMessage: 'Not Found',
			message: 'No such download',
		});
	}
	if (outcome === 'finished') {
		throw createError({ statusCode: 409, message: 'This download has already ended.' });
	}
	return findDownloadJob(await useDatabase(), id);
});

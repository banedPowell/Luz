import { scanRequestSchema } from '@luz/core';

import { createTagReader } from '../../infrastructure/tag-reader';
import { ScanError, scanLibrary } from '../../services/library-scan';

// No body scans the whole library; a body that does not match the schema is a 400. A scan
// that cannot start is a 409 whose data names the reason, for the page to explain
export default defineEventHandler(async (event) => {
	const request = await readValidatedBody(event, (body) => scanRequestSchema.parse(body ?? {}));
	try {
		return await scanLibrary(await useDatabase(), createTagReader(), request);
	} catch (error) {
		if (error instanceof ScanError) {
			throw createError({
				statusCode: 409,
				statusMessage: 'Conflict',
				message: error.message,
				data: { reason: error.reason },
			});
		}
		throw error;
	}
});

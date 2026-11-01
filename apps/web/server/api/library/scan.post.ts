import { createTagReader } from '../../infrastructure/tag-reader';
import { ScanError, scanLibrary } from '../../services/library-scan';

// A scan that cannot start is a 409 whose data names the reason, for the page to explain
export default defineEventHandler(async () => {
	try {
		return await scanLibrary(await useDatabase(), createTagReader());
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

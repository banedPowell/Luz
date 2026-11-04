import { libraryIdSchema } from '@luz/core';

import { getTrack } from '../../../services/library-browse';

export default defineEventHandler(async (event) => {
	const { id } = await getValidatedRouterParams(event, (value) => libraryIdSchema.parse(value));
	const track = await getTrack(await useDatabase(), id);
	if (!track) {
		throw createError({
			statusCode: 404,
			statusMessage: 'Not Found',
			message: 'No such track',
		});
	}
	return track;
});

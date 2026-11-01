import { libraryIdSchema } from '@luz/core';

import { getAlbum } from '../../../services/library-browse';

export default defineEventHandler(async (event) => {
	const { id } = await getValidatedRouterParams(event, (value) => libraryIdSchema.parse(value));
	const album = await getAlbum(await useDatabase(), id);
	if (!album) {
		throw createError({
			statusCode: 404,
			statusMessage: 'Not Found',
			message: 'No such album',
		});
	}
	return album;
});

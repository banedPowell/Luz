import { libraryIdSchema } from '@luz/core';

import { getArtist } from '../../../services/library-browse';

export default defineEventHandler(async (event) => {
	const { id } = await getValidatedRouterParams(event, (value) => libraryIdSchema.parse(value));
	const artist = await getArtist(await useDatabase(), id);
	if (!artist) {
		throw createError({
			statusCode: 404,
			statusMessage: 'Not Found',
			message: 'No such artist',
		});
	}
	return artist;
});

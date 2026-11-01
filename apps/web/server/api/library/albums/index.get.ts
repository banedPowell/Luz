import { albumListQuerySchema } from '@luz/core';

import { browseAlbums } from '../../../services/library-browse';

export default defineEventHandler(async (event) => {
	const query = await getValidatedQuery(event, (value) => albumListQuerySchema.parse(value));
	return browseAlbums(await useDatabase(), query);
});

import { artistListQuerySchema } from '@luz/core';

import { browseArtists } from '../../../services/library-browse';

export default defineEventHandler(async (event) => {
	const query = await getValidatedQuery(event, (value) => artistListQuerySchema.parse(value));
	return browseArtists(await useDatabase(), query);
});

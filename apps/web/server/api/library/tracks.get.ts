import { trackListQuerySchema } from '@luz/core';

import { browseTracks } from '../../services/library-browse';

// An unknown sort key or an invalid page is answered with a 400 listing the Zod issues
export default defineEventHandler(async (event) => {
	const query = await getValidatedQuery(event, (value) => trackListQuerySchema.parse(value));
	return browseTracks(await useDatabase(), query);
});

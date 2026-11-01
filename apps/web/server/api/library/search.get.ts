import { librarySearchQuerySchema } from '@luz/core';

import { searchLibrary } from '../../services/library-search';

// A query too long or repeated is answered with a 400 listing the Zod issues
export default defineEventHandler(async (event) => {
	const query = await getValidatedQuery(event, (value) => librarySearchQuerySchema.parse(value));
	return searchLibrary(await useDatabase(), query);
});

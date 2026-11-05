import { analyzeRequestSchema } from '@luz/core';

import { analyzeUrl } from '../../services/download-analysis';

// A body that does not match the schema (no URL, or not http or https) is a 400
export default defineEventHandler(async (event) => {
	const { url } = await readValidatedBody(event, (body) => analyzeRequestSchema.parse(body));
	try {
		return await analyzeUrl(url, await useAnalysisDependencies());
	} catch (error) {
		throw downloadHttpError(error);
	}
});

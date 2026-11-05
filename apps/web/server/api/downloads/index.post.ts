import { createDownloadRequestSchema } from '@luz/core';

import { createDownload } from '../../services/downloads';

// Answers once the job is queued, not downloaded: GET /api/downloads follows it
export default defineEventHandler(async (event) => {
	const request = await readValidatedBody(event, (body) =>
		createDownloadRequestSchema.parse(body),
	);
	try {
		const job = await createDownload(
			await useDatabase(),
			request,
			await useAnalysisDependencies(),
		);
		useDownloadEvents().emit({ type: 'job-added', job });
		void (await useDownloadQueue()).wake();
		setResponseStatus(event, 201);
		return job;
	} catch (error) {
		throw downloadHttpError(error);
	}
});

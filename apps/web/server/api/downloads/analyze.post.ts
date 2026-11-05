import { analyzeRequestSchema } from '@luz/core';

import { listFileNames } from '../../infrastructure/file-system';
import { createProcessRunner } from '../../infrastructure/process-runner';
import { createYtDlp } from '../../infrastructure/yt-dlp';
import { AnalysisError, analyzeUrl } from '../../services/download-analysis';
import { getSettings } from '../../services/settings';

// The user can fix the request or the setup (4xx), or the site or the tool failed (5xx).
// The data names the reason, for the page to explain, and keeps the yt-dlp output
const statusCodes = {
	'library-path-unset': 409,
	'tool-unavailable': 503,
	'unsupported-url': 422,
	unavailable: 422,
	network: 502,
	'timed-out': 504,
	failed: 502,
} as const;

// A body that does not match the schema (no URL, or not http or https) is a 400
export default defineEventHandler(async (event) => {
	const { url } = await readValidatedBody(event, (body) => analyzeRequestSchema.parse(body));
	const { ytDlpPath } = useLuzConfig();
	const ytDlpStatus = useToolStatus().find((tool) => tool.tool === 'yt-dlp') ?? {
		tool: 'yt-dlp',
		command: ytDlpPath,
		state: 'pending',
	};
	try {
		return await analyzeUrl(url, {
			ytDlp: createYtDlp(createProcessRunner(), ytDlpPath),
			ytDlpStatus,
			settings: await getSettings(await useDatabase()),
			listFileNames,
		});
	} catch (error) {
		if (error instanceof AnalysisError) {
			throw createError({
				statusCode: statusCodes[error.reason],
				message: error.message,
				data: { reason: error.reason, details: error.details },
			});
		}
		throw error;
	}
});

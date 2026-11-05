import { AnalysisError } from '../services/download-analysis';
import { DownloadRequestError } from '../services/downloads';

// The user can fix the request or the setup (4xx), or the site or the tool failed (5xx).
// The data names the reason, for the page to explain, and keeps the yt-dlp output
const analysisStatusCodes = {
	'library-path-unset': 409,
	'tool-unavailable': 503,
	'unsupported-url': 422,
	unavailable: 422,
	network: 502,
	'timed-out': 504,
	failed: 502,
} as const;

/** The HTTP error to throw for an analysis or download request failure; other errors as they are. */
export function downloadHttpError(error: unknown): unknown {
	if (error instanceof AnalysisError) {
		return createError({
			statusCode: analysisStatusCodes[error.reason],
			message: error.message,
			data: { reason: error.reason, details: error.details },
		});
	}
	if (error instanceof DownloadRequestError) {
		return createError({
			statusCode: 422,
			message: error.message,
			data: { reason: 'unknown-items', itemIds: error.unknownItemIds },
		});
	}
	return error;
}

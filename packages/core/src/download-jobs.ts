import { z } from 'zod';

import {
	analyzeRequestSchema,
	type AnalysisErrorReason,
	type AnalyzedKind,
} from './download-analysis.ts';
import type { TrackTags } from './library.ts';

/**
 * Download jobs as the queue runs them and the API returns them (ADR 0007). Pure: the
 * queue, the database and yt-dlp live on the server.
 */

// The most items one request may select: a long playlist, not a whole channel
export const maxDownloadItems = 1000;

export const createDownloadRequestSchema = z.strictObject({
	url: analyzeRequestSchema.shape.url,
	itemIds: z
		.array(z.string().min(1))
		.min(1, 'Select at least one track')
		.max(maxDownloadItems, `Select at most ${maxDownloadItems} tracks`)
		.refine((ids) => new Set(ids).size === ids.length, 'A track is selected twice'),
});

export type CreateDownloadRequest = z.infer<typeof createDownloadRequestSchema>;

export const downloadStates = ['queued', 'running', 'completed', 'failed', 'cancelled'] as const;

export type DownloadState = (typeof downloadStates)[number];

/** The states a job or an item never leaves. */
export function isFinishedState(state: DownloadState): boolean {
	return state === 'completed' || state === 'failed' || state === 'cancelled';
}

export type DownloadFailureReason =
	| 'interrupted'
	| 'tool-unavailable'
	| 'unavailable'
	| 'network'
	| 'timed-out'
	| 'failed';

/** What the user reads for each failure; the tool output stays in the item log. */
export const downloadFailureMessages: Record<DownloadFailureReason, string> = {
	interrupted: 'Luz stopped while this download was running. Start it again to retry.',
	'tool-unavailable': 'yt-dlp is not available. See the Tools section of Settings.',
	unavailable: 'This video is private, removed or not available in your country.',
	network: 'The site could not be reached. Check your internet connection and try again.',
	'timed-out': 'The site took too long to answer. Try again later.',
	failed: 'yt-dlp could not download this track.',
};

/** The failure of a download, from the reason yt-dlp's error lines give (see classifyYtDlpError). */
export function downloadFailureFromAnalysis(reason: AnalysisErrorReason): DownloadFailureReason {
	switch (reason) {
		case 'tool-unavailable':
		case 'unavailable':
		case 'network':
		case 'timed-out': {
			return reason;
		}
		default: {
			return 'failed';
		}
	}
}

export interface DownloadFailure {
	reason: DownloadFailureReason;
	message: string;
}

export function downloadFailure(reason: DownloadFailureReason): DownloadFailure {
	return { reason, message: downloadFailureMessages[reason] };
}

export interface DownloadItem {
	id: number;
	/** The order of the item in the job, from 0. */
	position: number;
	sourceId: string;
	url?: string;
	thumbnailUrl?: string;
	title: string;
	tags: TrackTags;
	/** Where the file will land in the library, as in the preview (format chosen in #84). */
	pathWithoutExtension: string;
	state: DownloadState;
	error?: DownloadFailure;
	/** The technical output of the tools, oldest lines dropped past the cap. */
	log: string[];
}

export interface DownloadJob {
	id: number;
	url: string;
	kind: AnalyzedKind;
	title: string;
	state: DownloadState;
	error?: DownloadFailure;
	/** Milliseconds since the epoch. */
	createdAt: number;
	startedAt?: number;
	finishedAt?: number;
	itemCount: number;
	completedCount: number;
	failedCount: number;
	items: DownloadItem[];
}

// Enough to explain a failure; a full download prints a few dozen lines
export const maxLogLines = 500;

/**
 * Appends lines to a log, dropping the oldest ones past `maxLines` and saying so on the first
 * line, so the log stays capped however long a tool talks.
 */
export function appendToLog(
	log: readonly string[],
	lines: readonly string[],
	maxLines = maxLogLines,
): string[] {
	const marker = /^… (\d+) earlier lines dropped$/;
	const match = marker.exec(log[0] ?? '');
	const dropped = match ? Number(match[1]) : 0;
	const all = [...(match ? log.slice(1) : log), ...lines];
	if (dropped === 0 && all.length <= maxLines) {
		return all;
	}
	const tail = all.slice(-(maxLines - 1));
	return [`… ${dropped + all.length - tail.length} earlier lines dropped`, ...tail];
}

/**
 * How a job that ran through all its items ends: completed when at least one item was
 * downloaded, failed when none was.
 */
export function finishedJobState(itemStates: readonly DownloadState[]): DownloadState {
	return itemStates.some((state) => state === 'completed') ? 'completed' : 'failed';
}

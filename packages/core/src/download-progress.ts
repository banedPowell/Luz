import type { DownloadItem, DownloadJob } from './download-jobs.ts';

/**
 * Progress of a download as yt-dlp reports it, and the events that carry it to the browser
 * (ADR 0007). Pure: the process, the database and the stream live on the server.
 */

/** The step an item is at, in the order it goes through them. */
export const downloadSteps = ['downloading', 'converting', 'tagging', 'added'] as const;

export type DownloadStep = (typeof downloadSteps)[number];

/** What the user reads for each step. */
export const downloadStepLabels: Record<DownloadStep, string> = {
	downloading: 'Downloading',
	converting: 'Converting',
	tagging: 'Writing tags',
	added: 'Added to the library',
};

// Marks our own lines among everything yt-dlp prints, whatever its version words them
const progressPrefix = 'luz-progress';

/**
 * The value of yt-dlp's `--progress-template` for downloads: one line per update, fields
 * separated by "|", "NA" for a field yt-dlp does not know.
 */
export const progressTemplate = `download:${progressPrefix}|%(progress.downloaded_bytes)s|%(progress.total_bytes)s|%(progress.total_bytes_estimate)s|%(progress.speed)s`;

export interface DownloadProgress {
	/** Whole percent, 0 to 100. */
	percent: number;
	/** Bytes per second, when yt-dlp could measure it. */
	speedBytesPerSecond?: number;
}

/**
 * Reads a line of `progressTemplate`. Anything else gives undefined, and so does a line whose
 * size is still unknown, since a percentage cannot be told from it.
 */
export function parseProgressLine(line: string): DownloadProgress | undefined {
	const fields = line.trim().split('|');
	if (fields.length !== 5 || fields[0] !== progressPrefix) {
		return undefined;
	}
	const downloaded = positiveNumber(fields[1]);
	// The exact size when yt-dlp knows it, else its estimate (fragmented streams)
	const total = positiveNumber(fields[2]) ?? positiveNumber(fields[3]);
	if (downloaded === undefined || total === undefined) {
		return undefined;
	}
	const speed = positiveNumber(fields[4]);
	return {
		percent: Math.min(100, Math.floor((downloaded / total) * 100)),
		...(speed === undefined ? {} : { speedBytesPerSecond: Math.round(speed) }),
	};
}

function positiveNumber(field: string | undefined): number | undefined {
	if (field === undefined || field === 'NA') {
		return undefined;
	}
	const value = Number(field);
	return Number.isFinite(value) && value > 0 ? value : undefined;
}

// A few updates per second: enough to look alive, few enough to spare the database
export const progressIntervalMs = 250;

/**
 * Whether an update is worth writing and sending: the first one, the end, and any change once
 * `intervalMs` has passed since the last one sent.
 */
export function shouldPublishProgress(
	last: { percent: number; atMs: number } | undefined,
	percent: number,
	nowMs: number,
	intervalMs = progressIntervalMs,
): boolean {
	if (last === undefined) {
		return true;
	}
	if (percent === last.percent) {
		return false;
	}
	return percent >= 100 || nowMs - last.atMs >= intervalMs;
}

/** An item as an event carries it: the log stays out, the list endpoint serves it. */
export type DownloadItemUpdate = Omit<
	DownloadItem,
	| 'position'
	| 'sourceId'
	| 'url'
	| 'thumbnailUrl'
	| 'title'
	| 'tags'
	| 'pathWithoutExtension'
	| 'log'
>;

export type DownloadJobUpdate = Omit<DownloadJob, 'items'>;

/**
 * What `GET /api/downloads/events` streams. Hints only: the client reloads the list when it
 * (re)opens the stream, so a missed event never leaves the screen wrong.
 */
export type DownloadEvent =
	/** A job was queued: the whole of it, so a screen can show it at once. */
	| { type: 'job-added'; job: DownloadJob }
	| { type: 'job'; job: DownloadJobUpdate }
	| { type: 'item'; jobId: number; item: DownloadItemUpdate };

export function toItemUpdate(item: DownloadItem): DownloadItemUpdate {
	return {
		id: item.id,
		state: item.state,
		...(item.error === undefined ? {} : { error: item.error }),
		...(item.step === undefined ? {} : { step: item.step }),
		...(item.progressPercent === undefined ? {} : { progressPercent: item.progressPercent }),
		...(item.speedBytesPerSecond === undefined
			? {}
			: { speedBytesPerSecond: item.speedBytesPerSecond }),
	};
}

export function toJobUpdate(job: DownloadJob): DownloadJobUpdate {
	const { items: _items, ...update } = job;
	return update;
}

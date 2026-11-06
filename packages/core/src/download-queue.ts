import {
	isFinishedState,
	type DownloadItem,
	type DownloadJob,
	type DownloadState,
} from './download-jobs.ts';
import { downloadStepLabels, type DownloadEvent } from './download-progress.ts';

/**
 * The queue as a screen shows it: the jobs the list endpoint returns, kept current by the
 * events of the stream (ADR 0007). Pure: the fetching and the stream live in the client.
 */

/** Queued or running: a job the user can still cancel. */
export function isActiveState(state: DownloadState): boolean {
	return !isFinishedState(state);
}

type ProgressOf = Pick<DownloadJob, 'itemCount' | 'completedCount' | 'failedCount' | 'items'>;

// Ended items count whole, the running one by its percent; whole items so far, unrounded
function itemsDone(job: ProgressOf): number {
	const running = job.items
		.filter((item) => item.state === 'running')
		.reduce((sum, item) => sum + (item.progressPercent ?? 0) / 100, 0);
	return job.completedCount + job.failedCount + running;
}

/** The overall progress of a job, whole percent from 0 to 100. */
export function jobProgressPercent(job: ProgressOf): number {
	if (job.itemCount === 0) {
		return 0;
	}
	return Math.min(100, Math.floor((itemsDone(job) / job.itemCount) * 100));
}

/** Items of a job that have not ended yet. */
export function remainingItemCount(job: Pick<DownloadJob, 'items'>): number {
	return job.items.filter((item) => isActiveState(item.state)).length;
}

export interface ActiveDownloads {
	/** Queued and running jobs. */
	jobCount: number;
	/** Whole percent over the items of those jobs. */
	percent: number;
}

/** What the sidebar sums up: undefined while nothing is queued or running. */
export function activeDownloads(
	jobs: readonly (ProgressOf & Pick<DownloadJob, 'state'>)[],
): ActiveDownloads | undefined {
	const active = jobs.filter((job) => isActiveState(job.state));
	if (active.length === 0) {
		return undefined;
	}
	const items = active.reduce((sum, job) => sum + job.itemCount, 0);
	const done = active.reduce((sum, job) => sum + itemsDone(job), 0);
	return {
		jobCount: active.length,
		percent: items === 0 ? 0 : Math.min(100, Math.floor((done / items) * 100)),
	};
}

/** The step of a running item in plain words, with the format it converts to. */
export function itemStepLabel(
	item: Pick<DownloadItem, 'step'>,
	job: Pick<DownloadJob, 'outputFormat'>,
): string {
	if (item.step === undefined) {
		return 'Starting';
	}
	if (item.step === 'converting' && job.outputFormat !== 'source') {
		return 'Converting to MP3';
	}
	return downloadStepLabels[item.step];
}

/** What an event changes, or 'reload' when the list must be fetched again to be right. */
export type QueueChange = DownloadJob[] | 'reload';

/**
 * Applies an event to the jobs on screen, newest first. An event about a job the screen does
 * not know, or one that ends a job (its items end without events of their own, and their logs
 * only come with the list), asks for a reload.
 */
export function applyDownloadEvent(
	jobs: readonly DownloadJob[],
	event: DownloadEvent,
): QueueChange {
	switch (event.type) {
		case 'job-added': {
			if (jobs.some((job) => job.id === event.job.id)) {
				return [...jobs];
			}
			return [event.job, ...jobs];
		}
		case 'job': {
			const current = jobs.find((job) => job.id === event.job.id);
			if (!current || isFinishedState(event.job.state)) {
				return 'reload';
			}
			// The update replaces the job's fields, so an error it no longer carries goes away
			return jobs.map((job) =>
				job === current ? { ...event.job, items: current.items } : job,
			);
		}
		// 'item', the last kind of event
		default: {
			const current = jobs.find((job) => job.id === event.jobId);
			const item = current?.items.find((candidate) => candidate.id === event.item.id);
			if (!current || !item) {
				return 'reload';
			}
			const items = current.items.map((candidate) =>
				candidate === item ? { ...staticFields(item), ...event.item } : candidate,
			);
			return jobs.map((job) => (job === current ? { ...job, items } : job));
		}
	}
}

// What an item update never carries; the rest comes from the update, absent fields included
function staticFields(item: DownloadItem): Omit<DownloadItem, keyof DownloadItemState> {
	return {
		position: item.position,
		sourceId: item.sourceId,
		...(item.url === undefined ? {} : { url: item.url }),
		...(item.thumbnailUrl === undefined ? {} : { thumbnailUrl: item.thumbnailUrl }),
		title: item.title,
		tags: item.tags,
		pathWithoutExtension: item.pathWithoutExtension,
		log: item.log,
	};
}

type DownloadItemState = Pick<
	DownloadItem,
	'id' | 'state' | 'error' | 'step' | 'progressPercent' | 'speedBytesPerSecond'
>;

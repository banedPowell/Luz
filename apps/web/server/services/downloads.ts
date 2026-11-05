import path from 'node:path';

import {
	appendToLog,
	downloadFailureFromAnalysis,
	finishedJobState,
	isFinishedState,
	shouldPublishProgress,
	toItemUpdate,
	toJobUpdate,
	type DownloadEvent,
	type CreateDownloadRequest,
	type DownloadItem,
	type DownloadJob,
} from '@luz/core';

import type { Database } from '../infrastructure/database/client';
import {
	endUnfinishedItems,
	findDownloadJob,
	finishDownloadItem,
	finishDownloadJob,
	insertDownloadJob,
	nextQueuedJob,
	runningDownloadJobIds,
	startDownloadItem,
	startDownloadJob,
	updateDownloadItemProgress,
} from '../infrastructure/database/download-repository';
import type { YtDlp } from '../infrastructure/yt-dlp';
import { analyzeUrl, type AnalysisDependencies } from './download-analysis';

export class DownloadRequestError extends Error {
	constructor(readonly unknownItemIds: string[]) {
		super('Some selected tracks are no longer at this address. Analyse it again.');
		this.name = 'DownloadRequestError';
	}
}

/**
 * Queues a job for the selected items of a URL. The URL is analysed again rather than
 * trusting the client's copy, so the tags and paths are the server's own and current.
 */
export async function createDownload(
	db: Database,
	request: CreateDownloadRequest,
	analysis: AnalysisDependencies,
	nowMs = Date.now(),
): Promise<DownloadJob> {
	const preview = await analyzeUrl(request.url, analysis);
	const known = new Set(preview.items.map((item) => item.sourceId));
	const unknown = request.itemIds.filter((id) => !known.has(id));
	if (unknown.length > 0) {
		throw new DownloadRequestError(unknown);
	}
	const selected = new Set(request.itemIds);
	const id = await insertDownloadJob(
		db,
		{
			url: request.url,
			kind: preview.kind,
			title: preview.title,
			// In the order of the analysis, whatever the order of the selection
			items: preview.items
				.filter((item) => selected.has(item.sourceId))
				.map((item) => ({
					sourceId: item.sourceId,
					...(item.url === undefined ? {} : { url: item.url }),
					...(item.thumbnailUrl === undefined ? {} : { thumbnailUrl: item.thumbnailUrl }),
					title: item.tags.title ?? item.sourceId,
					tags: item.tags,
					pathWithoutExtension: item.pathWithoutExtension,
				})),
		},
		nowMs,
	);
	const job = await findDownloadJob(db, id);
	if (!job) {
		throw new Error(`Download job ${id} vanished after it was written`);
	}
	return job;
}

export interface DownloadQueueDependencies {
	db: Database;
	ytDlp: YtDlp;
	/** `<dataDir>/downloads`: each job writes to its own folder inside. */
	downloadsDirectory: string;
	createDirectory: (directory: string) => Promise<void>;
	removeDirectory: (directory: string) => Promise<void>;
	/** Where job and item updates go, for the stream of events. */
	events: { emit: (event: DownloadEvent) => void };
	logger: { info: (message: string) => void; error: (message: string, error?: unknown) => void };
	now?: () => number;
}

export type CancelOutcome = 'cancelled' | 'finished' | 'not-found';

export interface DownloadQueue {
	/** Marks the jobs a stopped server left running as interrupted, then runs the queue. */
	start(): Promise<void>;
	/** Runs the queued jobs, if the queue is idle; resolves once it is idle again. */
	wake(): Promise<void>;
	/** Cancels a queued job, or a running one by killing its process. */
	cancel(jobId: number): Promise<CancelOutcome>;
	/** Kills the running process and writes nothing more: the next start finds it interrupted. */
	stop(): void;
}

/** One job at a time, items one by one, in creation order (ADR 0007). */
export function createDownloadQueue(dependencies: DownloadQueueDependencies): DownloadQueue {
	const { db, ytDlp, downloadsDirectory, createDirectory, removeDirectory, events, logger } =
		dependencies;
	const now = dependencies.now ?? Date.now;
	const jobDirectory = (jobId: number) => path.join(downloadsDirectory, String(jobId));

	let current: { jobId: number; controller: AbortController; done: Promise<void> } | undefined;
	let draining: Promise<void> | undefined;
	let wanted = false;
	let stopped = false;

	/** Sends the job as it stands, and its items (all of them, or only `itemIds`). */
	async function publish(jobId: number, itemIds?: readonly number[]) {
		const job = await findDownloadJob(db, jobId);
		if (!job) {
			return;
		}
		events.emit({ type: 'job', job: toJobUpdate(job) });
		for (const item of job.items) {
			if (itemIds === undefined || itemIds.includes(item.id)) {
				events.emit({ type: 'item', jobId, item: toItemUpdate(item) });
			}
		}
	}

	async function recover() {
		for (const id of await runningDownloadJobIds(db)) {
			await endUnfinishedItems(db, id, 'failed', 'interrupted');
			await finishDownloadJob(db, id, 'failed', now(), 'interrupted');
			await removeDirectory(jobDirectory(id));
			logger.info(`Download job ${id} was interrupted by a restart`);
		}
	}

	function wake(): Promise<void> {
		wanted = true;
		draining ??= drain().finally(() => {
			draining = undefined;
			// A job queued while the loop was ending would otherwise wait for the next one
			if (wanted && !stopped) {
				void wake();
			}
		});
		return draining;
	}

	async function drain() {
		while (wanted) {
			wanted = false;
			for (let job = await nextQueuedJob(db); job; job = await nextQueuedJob(db)) {
				if (stopped) {
					return;
				}
				const jobId = job.id;
				const controller = new AbortController();
				const done = runJob(job, controller.signal).catch((error: unknown) => {
					logger.error(`Download job ${jobId} stopped on an error`, error);
				});
				current = { jobId, controller, done };
				await done;
				current = undefined;
			}
		}
	}

	async function runJob(job: DownloadJob, signal: AbortSignal) {
		if (!(await startDownloadJob(db, job.id, now()))) {
			return;
		}
		await publish(job.id, []);
		logger.info(`Download job ${job.id} started: ${job.title} (${job.itemCount} items)`);
		const directory = jobDirectory(job.id);
		await createDirectory(directory);
		for (const item of job.items) {
			if (signal.aborted) {
				break;
			}
			if (item.state === 'queued') {
				await runItem(job, item, directory, signal);
			}
		}
		if (stopped) {
			return;
		}
		if (signal.aborted) {
			await endUnfinishedItems(db, job.id, 'cancelled');
			await finishDownloadJob(db, job.id, 'cancelled', now());
			await removeDirectory(directory);
			await publish(job.id);
			logger.info(`Download job ${job.id} cancelled`);
			return;
		}
		const items = (await findDownloadJob(db, job.id))?.items ?? [];
		const state = finishedJobState(items.map((item) => item.state));
		await finishDownloadJob(db, job.id, state, now());
		await publish(job.id, []);
		logger.info(`Download job ${job.id} ${state}`);
	}

	async function runItem(
		job: DownloadJob,
		item: DownloadItem,
		directory: string,
		signal: AbortSignal,
	) {
		await startDownloadItem(db, item.id);
		await publish(job.id, [item.id]);
		// A playlist item without its own address cannot be downloaded alone
		const url = item.url ?? (job.kind === 'track' ? job.url : undefined);
		if (url === undefined) {
			await finishDownloadItem(
				db,
				{ id: item.id, jobId: job.id },
				{
					state: 'failed',
					errorReason: 'failed',
					log: ['yt-dlp gave no address for this item.'],
				},
			);
			await publish(job.id, [item.id]);
			return;
		}
		let log: string[] = [];
		// Progress is written in order, one write at a time, and always before the item ends
		let writes = Promise.resolve();
		let lastProgress: { percent: number; atMs: number } | undefined;
		const result = await ytDlp.download(url, {
			directory,
			fileStem: String(item.id),
			signal,
			onLine: (line) => {
				log = appendToLog(log, [line]);
			},
			onProgress: (progress) => {
				const atMs = now();
				if (
					signal.aborted ||
					!shouldPublishProgress(lastProgress, progress.percent, atMs)
				) {
					return;
				}
				lastProgress = { percent: progress.percent, atMs };
				writes = writes
					.then(() => updateDownloadItemProgress(db, item.id, progress))
					.then(() => {
						events.emit({
							type: 'item',
							jobId: job.id,
							item: {
								id: item.id,
								state: 'running',
								step: 'downloading',
								progressPercent: progress.percent,
								...(progress.speedBytesPerSecond === undefined
									? {}
									: { speedBytesPerSecond: progress.speedBytesPerSecond }),
							},
						});
					})
					.catch((error: unknown) => {
						logger.error(
							`Could not record the progress of download item ${item.id}`,
							error,
						);
					});
			},
		});
		await writes;
		if (!result.ok && result.reason === 'aborted') {
			// Ended with the job, as cancelled, or left running for the restart to find
			return;
		}
		await finishDownloadItem(
			db,
			{ id: item.id, jobId: job.id },
			result.ok
				? { state: 'completed', log }
				: { state: 'failed', errorReason: downloadFailureFromAnalysis(result.reason), log },
		);
		await publish(job.id, [item.id]);
	}

	async function cancel(jobId: number): Promise<CancelOutcome> {
		if (current?.jobId === jobId) {
			current.controller.abort();
			await current.done;
			return 'cancelled';
		}
		const job = await findDownloadJob(db, jobId);
		if (!job) {
			return 'not-found';
		}
		if (isFinishedState(job.state)) {
			return 'finished';
		}
		// Only a queued job can be here: the running one is `current`
		if (!(await finishDownloadJob(db, jobId, 'cancelled', now()))) {
			return 'finished';
		}
		await endUnfinishedItems(db, jobId, 'cancelled');
		await publish(jobId);
		return 'cancelled';
	}

	return {
		async start() {
			await recover();
			await wake();
		},
		wake,
		cancel,
		stop() {
			stopped = true;
			current?.controller.abort();
		},
	};
}

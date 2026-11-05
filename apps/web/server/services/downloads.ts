import path from 'node:path';

import {
	appendToLog,
	downloadedFiles,
	downloadFailureFromAnalysis,
	finishedJobState,
	isFinishedState,
	outputTarget,
	shouldPublishProgress,
	toItemUpdate,
	toJobUpdate,
	type DownloadEvent,
	type CreateDownloadRequest,
	type DownloadFailureReason,
	type DownloadItem,
	type DownloadJob,
	type DownloadStep,
	type ScanSummary,
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
	setDownloadItemStep,
	startDownloadItem,
	startDownloadJob,
	updateDownloadItemProgress,
} from '../infrastructure/database/download-repository';
import { readSettings } from '../infrastructure/database/settings-repository';
import type { Ffmpeg } from '../infrastructure/ffmpeg';
import { isDirectory, type MoveOutcome } from '../infrastructure/file-system';
import type { TagReader } from '../infrastructure/tag-reader';
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
			outputFormat: request.outputFormat ?? analysis.settings.outputFormat,
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
	ffmpeg: Ffmpeg;
	/** Reads the codec of a download, which picks the container of the source format. */
	tagReader: TagReader;
	/** `<dataDir>/downloads`: each job writes to its own folder inside. */
	downloadsDirectory: string;
	listFileNames: (directory: string) => Promise<string[]>;
	createDirectory: (directory: string) => Promise<void>;
	removeDirectory: (directory: string) => Promise<void>;
	/** Moves a finished file into the library, never over an existing one. */
	moveIntoLibrary: (source: string, target: string) => Promise<MoveOutcome>;
	/** Indexes files of the library, once a running scan has ended. */
	indexLibraryFiles: (paths: string[]) => Promise<ScanSummary>;
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

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

/** One job at a time, items one by one, in creation order (ADR 0007). */
export function createDownloadQueue(dependencies: DownloadQueueDependencies): DownloadQueue {
	const {
		db,
		ytDlp,
		ffmpeg,
		tagReader,
		downloadsDirectory,
		listFileNames,
		createDirectory,
		removeDirectory,
		moveIntoLibrary,
		indexLibraryFiles,
		events,
		logger,
	} = dependencies;
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
		// Every finished file has reached the library: what is left is the job's own work
		await removeDirectory(directory);
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
		let log: string[] = [];
		const onLine = (line: string) => {
			log = appendToLog(log, [line]);
		};
		const end = async (outcome: 'completed' | DownloadFailureReason) => {
			await finishDownloadItem(
				db,
				{ id: item.id, jobId: job.id },
				outcome === 'completed'
					? { state: 'completed', log }
					: { state: 'failed', errorReason: outcome, log },
			);
			await publish(job.id, [item.id]);
		};
		// A playlist item without its own address cannot be downloaded alone
		const url = item.url ?? (job.kind === 'track' ? job.url : undefined);
		if (url === undefined) {
			onLine('yt-dlp gave no address for this item.');
			await end('failed');
			return;
		}
		const downloading = progressReporter(job.id, item.id, 'downloading', signal);
		const download = await ytDlp.download(url, {
			directory,
			fileStem: String(item.id),
			signal,
			onLine,
			onProgress: (progress) =>
				downloading.report(progress.percent, progress.speedBytesPerSecond),
		});
		await downloading.settled();
		// Aborted: ended with the job, as cancelled, or left running for the restart to find
		if (!download.ok) {
			if (download.reason !== 'aborted') {
				await end(downloadFailureFromAnalysis(download.reason));
			}
			return;
		}
		const converted = await convert(job, item, directory, signal, onLine);
		if (converted === 'aborted') {
			return;
		}
		if (typeof converted === 'string') {
			await end(converted);
			return;
		}
		// Cancelled once converted: the file goes away with the job folder, never into the library
		if (signal.aborted) {
			return;
		}
		await end(await addToLibrary(item, converted.file, onLine));
	}

	/**
	 * Moves a converted file to its path in the library, from the naming template, then
	 * indexes it. A file already at that path fails the item and stays as it is.
	 */
	async function addToLibrary(
		item: DownloadItem,
		file: string,
		onLine: (line: string) => void,
	): Promise<'completed' | DownloadFailureReason> {
		const { musicLibraryPath } = await readSettings(db);
		if (musicLibraryPath === undefined || !(await isDirectory(musicLibraryPath))) {
			onLine(
				`The music library folder is not set or not found: ${musicLibraryPath ?? 'unset'}.`,
			);
			return 'library-unavailable';
		}
		const library = path.resolve(musicLibraryPath);
		const target =
			path.join(library, ...item.pathWithoutExtension.split('/')) + path.extname(file);
		const relative = path.relative(library, target);
		// The naming template keeps every file inside the library; a stored path is checked anyway
		if (relative === '' || relative.startsWith('..') || path.isAbsolute(relative)) {
			onLine(`The path ${target} is outside the music library.`);
			return 'move';
		}
		let moved: MoveOutcome;
		try {
			moved = await moveIntoLibrary(file, target);
		} catch (error) {
			onLine(`Could not move the file to ${target}: ${errorMessage(error)}`);
			return 'move';
		}
		if (moved === 'exists') {
			onLine(`A file already exists at ${target}. Luz left it as it is.`);
			return 'name-taken';
		}
		try {
			const indexed = await indexLibraryFiles([target]);
			if (indexed.added + indexed.updated + indexed.unchanged === 0) {
				onLine(`${target} is in the library, but its tags could not be read to index it.`);
			}
		} catch (error) {
			// The file is where it belongs: the next library scan indexes it
			onLine(`${target} is in the library, but could not be indexed: ${errorMessage(error)}`);
		}
		await setDownloadItemStep(db, item.id, 'added');
		return 'completed';
	}

	/**
	 * Turns the downloaded audio into the file of the job's format, with its tags and its
	 * cover, beside it in the job folder: `<itemId>.converted.<ext>`.
	 */
	async function convert(
		job: DownloadJob,
		item: DownloadItem,
		directory: string,
		signal: AbortSignal,
		onLine: (line: string) => void,
	): Promise<{ file: string } | 'aborted' | DownloadFailureReason> {
		const stem = String(item.id);
		const files = downloadedFiles(await listFileNames(directory), stem);
		if (files.audio === undefined) {
			onLine('yt-dlp wrote no audio file.');
			return 'failed';
		}
		const audio = path.join(directory, files.audio);
		const target =
			job.outputFormat === 'source'
				? outputTarget('source', await readCodec(audio, onLine))
				: outputTarget(job.outputFormat);
		if (target === undefined) {
			return 'unsupported-source';
		}
		await setDownloadItemStep(db, item.id, 'converting');
		await publish(job.id, [item.id]);

		let cover: string | undefined;
		if (files.thumbnail !== undefined) {
			const square = path.join(directory, `${stem}.square.jpg`);
			const result = await ffmpeg.squareCover(path.join(directory, files.thumbnail), square, {
				signal,
				onLine,
			});
			if (result.ok) {
				cover = square;
			} else if (result.reason !== 'failed') {
				return result.reason === 'aborted' ? 'aborted' : 'ffmpeg-unavailable';
			} else {
				// A thumbnail FFmpeg cannot read is no reason to lose the track
				onLine('The thumbnail could not be made into a cover: the file has none.');
			}
		}

		const converting = progressReporter(job.id, item.id, 'converting', signal);
		const output = path.join(directory, `${stem}.converted${target.extension}`);
		const result = await ffmpeg.convert(
			{
				audio,
				tags: item.tags,
				...(cover === undefined ? {} : { cover }),
				metadataFile: path.join(directory, `${stem}.tags.ffmetadata`),
				output,
				target,
				...(item.tags.durationMs === undefined ? {} : { durationMs: item.tags.durationMs }),
			},
			{ signal, onLine, onProgress: (percent) => converting.report(percent) },
		);
		await converting.settled();
		if (result.ok) {
			return { file: output };
		}
		if (result.reason === 'aborted') {
			return 'aborted';
		}
		return result.reason === 'tool-unavailable' ? 'ffmpeg-unavailable' : 'conversion';
	}

	/** The codec of a downloaded file, which picks the container of the source format. */
	async function readCodec(audio: string, onLine: (line: string) => void) {
		const read = await tagReader.read(audio);
		if (!read.ok) {
			onLine(`Could not read the codec of the download: ${read.error.message}`);
			return null;
		}
		return read.audio.codec;
	}

	/**
	 * Writes and sends the progress of an item's step, throttled. Writes go in order, one at
	 * a time; `settled()` resolves once the last one is done, before the item ends.
	 */
	function progressReporter(
		jobId: number,
		itemId: number,
		step: DownloadStep,
		signal: AbortSignal,
	) {
		let writes = Promise.resolve();
		let last: { percent: number; atMs: number } | undefined;
		return {
			report(percent: number, speedBytesPerSecond?: number) {
				const atMs = now();
				if (signal.aborted || !shouldPublishProgress(last, percent, atMs)) {
					return;
				}
				last = { percent, atMs };
				const speed = speedBytesPerSecond === undefined ? {} : { speedBytesPerSecond };
				writes = writes
					.then(() => updateDownloadItemProgress(db, itemId, { percent, ...speed }))
					.then(() => {
						events.emit({
							type: 'item',
							jobId,
							item: {
								id: itemId,
								state: 'running',
								step,
								progressPercent: percent,
								...speed,
							},
						});
					})
					.catch((error: unknown) => {
						logger.error(
							`Could not record the progress of download item ${itemId}`,
							error,
						);
					});
			},
			settled: () => writes,
		};
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

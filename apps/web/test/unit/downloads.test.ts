import { existsSync, mkdtempSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { defaultSettings, type DownloadJob, type ToolStatus, type YtDlpInfo } from '@luz/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openDatabase, type Database } from '../../server/infrastructure/database/client';
import {
	findDownloadJob,
	listDownloadJobs,
	startDownloadJob,
} from '../../server/infrastructure/database/download-repository';
import { applyMigrations, loadMigrations } from '../../server/infrastructure/database/migrations';
import { createDirectory, removeDirectory } from '../../server/infrastructure/file-system';
import type { ProcessRunner, RunOptions } from '../../server/infrastructure/process-runner';
import {
	createYtDlp,
	type DownloadOptions,
	type YtDlp,
	type YtDlpDownload,
} from '../../server/infrastructure/yt-dlp';
import type { AnalysisDependencies } from '../../server/services/download-analysis';
import {
	createDownload,
	createDownloadQueue,
	DownloadRequestError,
	type DownloadQueue,
} from '../../server/services/downloads';
import { readMigrationsFolder, removeWhenReleased } from './support/database';

const playlistUrl = 'https://example.com/playlist';

const playlist: YtDlpInfo = {
	_type: 'playlist',
	id: 'pl',
	title: 'Night Drive',
	entries: [
		{ id: 'a', title: 'First', url: 'https://example.com/a', uploader: 'Band' },
		{ id: 'b', title: 'Second', url: 'https://example.com/b', uploader: 'Band' },
		{ id: 'c', title: 'Third', url: 'https://example.com/c', uploader: 'Band' },
	],
};

type Behaviour = 'ok' | 'fail' | 'hang';

/**
 * Stands in for yt-dlp: the analysis returns `playlist`, a download writes a file in the job
 * folder and prints a few lines, unless the item's address is told to fail or to hang until
 * it is aborted. Records every address it downloaded.
 */
class FakeYtDlp implements YtDlp {
	downloads: string[] = [];
	readonly behaviours = new Map<string, Behaviour>();
	private started: (() => void) | undefined;

	/** Resolves once a download that hangs has started. */
	hanging(): Promise<void> {
		return new Promise((resolve) => {
			this.started = resolve;
		});
	}

	async analyze() {
		return { ok: true as const, info: playlist };
	}

	async download(url: string, options: DownloadOptions): Promise<YtDlpDownload> {
		this.downloads.push(url);
		options.onLine?.(`[download] Destination: ${options.fileStem}.webm`);
		const behaviour = this.behaviours.get(url) ?? 'ok';
		if (behaviour === 'hang') {
			await writeFile(
				path.join(options.directory, `${options.fileStem}.webm.part`),
				'partial',
			);
			this.started?.();
			await new Promise((resolve) => options.signal?.addEventListener('abort', resolve));
			return { ok: false, reason: 'aborted' };
		}
		if (behaviour === 'fail') {
			options.onLine?.('ERROR: [generic] Unable to download webpage: getaddrinfo failed');
			return { ok: false, reason: 'network' };
		}
		await writeFile(path.join(options.directory, `${options.fileStem}.webm`), 'audio');
		return { ok: true };
	}
}

let dataDir: string;
let db: Database;
let ytDlp: FakeYtDlp;
let queue: DownloadQueue;

const available: ToolStatus = { tool: 'yt-dlp', command: 'yt-dlp', state: 'available' };

function analysis(): AnalysisDependencies {
	return {
		ytDlp,
		ytDlpStatus: available,
		settings: { ...defaultSettings, musicLibraryPath: path.join(dataDir, 'library') },
		listFileNames: async () => [],
	};
}

function newQueue(): DownloadQueue {
	return createDownloadQueue({
		db,
		ytDlp,
		downloadsDirectory: path.join(dataDir, 'downloads'),
		createDirectory,
		removeDirectory,
		logger: { info: () => undefined, error: () => undefined },
	});
}

async function queueJob(itemIds = ['a', 'b', 'c'], nowMs?: number): Promise<DownloadJob> {
	return createDownload(db, { url: playlistUrl, itemIds }, analysis(), nowMs);
}

async function jobOf(id: number): Promise<DownloadJob> {
	const job = await findDownloadJob(db, id);
	if (!job) {
		throw new Error(`No job ${id}`);
	}
	return job;
}

beforeEach(async () => {
	dataDir = mkdtempSync(path.join(tmpdir(), 'luz-downloads-'));
	db = openDatabase(dataDir);
	await applyMigrations(db.$client, await loadMigrations(readMigrationsFolder));
	ytDlp = new FakeYtDlp();
	queue = newQueue();
});

afterEach(async () => {
	queue.stop();
	db.$client.close();
	await removeWhenReleased(dataDir);
});

describe('createDownload', () => {
	it('queues the selected items in the order of the analysis', async () => {
		const job = await queueJob(['c', 'a']);

		expect(job).toMatchObject({
			url: playlistUrl,
			kind: 'playlist',
			title: 'Night Drive',
			state: 'queued',
			itemCount: 2,
			completedCount: 0,
			failedCount: 0,
		});
		expect(job.items.map((item) => [item.sourceId, item.position, item.state])).toEqual([
			['a', 0, 'queued'],
			['c', 1, 'queued'],
		]);
		expect(job.items[0]).toMatchObject({
			title: 'First',
			url: 'https://example.com/a',
			tags: { title: 'First', artists: ['Band'], album: 'Night Drive', trackNumber: 1 },
			pathWithoutExtension: 'Band/Night Drive/1-01 First',
			log: [],
		});
	});

	it('refuses items the analysis no longer finds, and writes nothing', async () => {
		await expect(queueJob(['a', 'gone'])).rejects.toThrow(DownloadRequestError);
		await expect(queueJob(['a', 'gone'])).rejects.toMatchObject({ unknownItemIds: ['gone'] });
		expect(await listDownloadJobs(db)).toEqual([]);
	});
});

describe('download queue', () => {
	it('downloads the items one by one into the job folder', async () => {
		const job = await queueJob();
		await queue.wake();

		const done = await jobOf(job.id);
		expect(done).toMatchObject({ state: 'completed', completedCount: 3, failedCount: 0 });
		expect(done.startedAt).toBeTypeOf('number');
		expect(done.finishedAt).toBeTypeOf('number');
		expect(ytDlp.downloads).toEqual([
			'https://example.com/a',
			'https://example.com/b',
			'https://example.com/c',
		]);
		for (const item of done.items) {
			expect(item.state).toBe('completed');
			expect(item.log).toEqual([`[download] Destination: ${item.id}.webm`]);
			expect(
				existsSync(path.join(dataDir, 'downloads', `${job.id}`, `${item.id}.webm`)),
			).toBe(true);
		}
	});

	it('runs the jobs one at a time, in creation order', async () => {
		const first = await queueJob(['a'], 1000);
		const second = await queueJob(['b'], 2000);
		await queue.wake();

		expect(ytDlp.downloads).toEqual(['https://example.com/a', 'https://example.com/b']);
		const [newest, oldest] = await listDownloadJobs(db);
		expect([newest?.id, oldest?.id]).toEqual([second.id, first.id]);
		expect(newest?.startedAt ?? 0).toBeGreaterThanOrEqual(oldest?.finishedAt ?? Infinity);
	});

	it('keeps the reason and the output of a failed item, and goes on', async () => {
		ytDlp.behaviours.set('https://example.com/b', 'fail');
		const job = await queueJob();
		await queue.wake();

		const done = await jobOf(job.id);
		expect(done).toMatchObject({ state: 'completed', completedCount: 2, failedCount: 1 });
		expect(done.items[1]?.state).toBe('failed');
		expect(done.items[1]?.error?.reason).toBe('network');
		expect(done.items[1]?.error?.message).toMatch(/could not be reached/);
		expect(done.items[1]?.log.at(-1)).toMatch(/^ERROR:/);
	});

	it('fails a job when no item could be downloaded', async () => {
		ytDlp.behaviours.set('https://example.com/a', 'fail');
		const job = await queueJob(['a']);
		await queue.wake();

		expect(await jobOf(job.id)).toMatchObject({ state: 'failed', failedCount: 1 });
	});

	it('cancels a queued job before it runs', async () => {
		const job = await queueJob();

		expect(await queue.cancel(job.id)).toBe('cancelled');
		await queue.wake();

		const cancelled = await jobOf(job.id);
		expect(cancelled.state).toBe('cancelled');
		expect(cancelled.items.every((item) => item.state === 'cancelled')).toBe(true);
		expect(ytDlp.downloads).toEqual([]);
	});

	it('cancels a running job: aborts the download and removes the job folder', async () => {
		ytDlp.behaviours.set('https://example.com/b', 'hang');
		const job = await queueJob();
		const hanging = ytDlp.hanging();
		const running = queue.wake();
		await hanging;

		expect(await queue.cancel(job.id)).toBe('cancelled');
		await running;

		const cancelled = await jobOf(job.id);
		expect(cancelled.state).toBe('cancelled');
		expect(cancelled.items.map((item) => item.state)).toEqual([
			'completed',
			'cancelled',
			'cancelled',
		]);
		expect(ytDlp.downloads).toHaveLength(2);
		expect(existsSync(path.join(dataDir, 'downloads', `${job.id}`))).toBe(false);
	});

	it('refuses to cancel a finished or unknown job', async () => {
		const job = await queueJob(['a']);
		await queue.wake();

		expect(await queue.cancel(job.id)).toBe('finished');
		expect(await queue.cancel(job.id + 1)).toBe('not-found');
	});

	it('marks a job left running by a stopped server as interrupted, then runs the queue', async () => {
		const interrupted = await queueJob(['a', 'b']);
		await startDownloadJob(db, interrupted.id, 1);
		const folder = path.join(dataDir, 'downloads', `${interrupted.id}`);
		await mkdir(folder, { recursive: true });
		await writeFile(path.join(folder, 'left.part'), 'partial');
		const waiting = await queueJob(['c']);

		await newQueue().start();

		const recovered = await jobOf(interrupted.id);
		expect(recovered).toMatchObject({
			state: 'failed',
			error: { reason: 'interrupted' },
			failedCount: 2,
		});
		expect(recovered.items.every((item) => item.error?.reason === 'interrupted')).toBe(true);
		expect(existsSync(folder)).toBe(false);
		expect((await jobOf(waiting.id)).state).toBe('completed');
		expect(ytDlp.downloads).toEqual(['https://example.com/c']);
	});
});

describe('yt-dlp download', () => {
	it('downloads one item into the job folder, the URL after "--", and passes every line', async () => {
		const calls: RunOptions[] = [];
		const runner: ProcessRunner = {
			async run(_command, options) {
				calls.push(options);
				options.onStdoutLine?.('[download]  50.0% of 3.00MiB');
				options.onStderrLine?.('WARNING: slow');
				return { outcome: 'exited', exitCode: 0 };
			},
		};
		const lines: string[] = [];
		const controller = new AbortController();

		const result = await createYtDlp(runner, 'yt-dlp').download('https://example.com/a', {
			directory: '/data/downloads/1',
			fileStem: '7',
			signal: controller.signal,
			onLine: (line) => lines.push(line),
		});

		expect(result).toEqual({ ok: true });
		expect(calls[0]?.args).toEqual([
			'--no-playlist',
			'--newline',
			'--format',
			'bestaudio/best',
			'--paths',
			'/data/downloads/1',
			'--output',
			'7.%(ext)s',
			'--',
			'https://example.com/a',
		]);
		expect(calls[0]?.signal).toBe(controller.signal);
		expect(lines).toEqual(['[download]  50.0% of 3.00MiB', 'WARNING: slow']);
	});

	it('names the reason of a failure, and an abort as such', async () => {
		const failing: ProcessRunner = {
			async run(_command, options) {
				options.onStderrLine?.('ERROR: Private video');
				return { outcome: 'exited', exitCode: 1 };
			},
		};
		const aborted: ProcessRunner = { run: async () => ({ outcome: 'aborted' }) };
		const options = { directory: '/tmp', fileStem: '1' };

		expect(await createYtDlp(failing, 'yt-dlp').download('https://x.test', options)).toEqual({
			ok: false,
			reason: 'unavailable',
		});
		expect(await createYtDlp(aborted, 'yt-dlp').download('https://x.test', options)).toEqual({
			ok: false,
			reason: 'aborted',
		});
	});
});

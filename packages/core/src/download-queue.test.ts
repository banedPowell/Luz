import { describe, expect, it } from 'vitest';

import type { DownloadItem, DownloadJob } from './download-jobs.ts';
import {
	activeDownloads,
	applyDownloadEvent,
	itemStepLabel,
	jobProgressPercent,
	remainingItemCount,
} from './download-queue.ts';

function item(id: number, overrides: Partial<DownloadItem> = {}): DownloadItem {
	return {
		id,
		position: id - 1,
		sourceId: `s${id}`,
		title: `Track ${id}`,
		tags: { artists: [] },
		pathWithoutExtension: `Artist/Album/0${id} Track`,
		state: 'queued',
		log: [],
		...overrides,
	};
}

function job(id: number, overrides: Partial<DownloadJob> = {}): DownloadJob {
	const items = overrides.items ?? [item(1), item(2)];
	return {
		id,
		url: 'https://example.com/list',
		kind: 'playlist',
		title: `Job ${id}`,
		outputFormat: 'source',
		state: 'queued',
		createdAt: id,
		itemCount: items.length,
		completedCount: 0,
		failedCount: 0,
		...overrides,
		items,
	};
}

describe('jobProgressPercent', () => {
	it('counts ended items whole and the running one by its percent', () => {
		const running = job(1, {
			state: 'running',
			completedCount: 1,
			failedCount: 1,
			items: [
				item(1, { state: 'completed' }),
				item(2, { state: 'failed' }),
				item(3, { state: 'running', progressPercent: 50 }),
				item(4),
			],
		});
		expect(jobProgressPercent(running)).toBe(62);
	});

	it('is 0 for a job without items', () => {
		expect(jobProgressPercent(job(1, { items: [] }))).toBe(0);
	});
});

describe('remainingItemCount', () => {
	it('counts queued and running items only', () => {
		const items = [
			item(1, { state: 'completed' }),
			item(2, { state: 'running' }),
			item(3),
			item(4, { state: 'cancelled' }),
		];
		expect(remainingItemCount(job(1, { items }))).toBe(2);
	});
});

describe('activeDownloads', () => {
	it('is undefined while no job is queued or running', () => {
		expect(activeDownloads([job(1, { state: 'completed' })])).toBeUndefined();
	});

	it('sums the queued and running jobs over all their items', () => {
		const jobs = [
			job(1, {
				state: 'running',
				completedCount: 1,
				items: [
					item(1, { state: 'completed' }),
					item(2, { state: 'running', progressPercent: 50 }),
				],
			}),
			job(2, { items: [item(3), item(4)] }),
			job(3, { state: 'failed', failedCount: 2 }),
		];
		expect(activeDownloads(jobs)).toEqual({ jobCount: 2, percent: 37 });
	});
});

describe('itemStepLabel', () => {
	it('names the step in plain words, with MP3 when converting to it', () => {
		expect(itemStepLabel({ step: 'downloading' }, { outputFormat: 'source' })).toBe(
			'Downloading',
		);
		expect(itemStepLabel({ step: 'converting' }, { outputFormat: 'mp3-320' })).toBe(
			'Converting to MP3',
		);
		expect(itemStepLabel({}, { outputFormat: 'source' })).toBe('Starting');
	});
});

describe('applyDownloadEvent', () => {
	it('puts an added job first, once', () => {
		const jobs = [job(1)];
		const added = applyDownloadEvent(jobs, { type: 'job-added', job: job(2) });
		expect(added !== 'reload' && added.map(({ id }) => id)).toEqual([2, 1]);
		const again = applyDownloadEvent(jobs, { type: 'job-added', job: job(1) });
		expect(again !== 'reload' && again.map(({ id }) => id)).toEqual([1]);
	});

	it('replaces the fields of a job and keeps its items', () => {
		const { items: _items, ...update } = job(1, {
			state: 'running',
			startedAt: 5,
		});
		const changed = applyDownloadEvent(
			[job(1, { error: { reason: 'failed', message: 'x' } })],
			{
				type: 'job',
				job: update,
			},
		);
		expect(changed).not.toBe('reload');
		const [first] = changed === 'reload' ? [] : changed;
		expect(first?.state).toBe('running');
		expect(first?.error).toBeUndefined();
		expect(first?.items).toHaveLength(2);
	});

	it('asks for a reload when a job ends or is unknown', () => {
		const { items: _items, ...ended } = job(1, { state: 'cancelled' });
		expect(applyDownloadEvent([job(1)], { type: 'job', job: ended })).toBe('reload');
		const { items: _other, ...unknown } = job(9, { state: 'running' });
		expect(applyDownloadEvent([job(1)], { type: 'job', job: unknown })).toBe('reload');
		expect(
			applyDownloadEvent([job(1)], {
				type: 'item',
				jobId: 1,
				item: { id: 99, state: 'running' },
			}),
		).toBe('reload');
	});

	it('updates an item and drops the fields its update no longer carries', () => {
		const jobs = [
			job(1, {
				items: [
					item(1, {
						state: 'running',
						step: 'downloading',
						progressPercent: 40,
						log: ['a'],
					}),
				],
			}),
		];
		const changed = applyDownloadEvent(jobs, {
			type: 'item',
			jobId: 1,
			item: { id: 1, state: 'running', step: 'converting' },
		});
		const updated = changed === 'reload' ? undefined : changed[0]?.items[0];
		expect(updated).toMatchObject({ step: 'converting', title: 'Track 1', log: ['a'] });
		expect(updated?.progressPercent).toBeUndefined();
	});
});

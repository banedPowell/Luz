import { describe, expect, it } from 'vitest';

import type { DownloadItem, DownloadJob } from './download-jobs.ts';
import {
	downloadStepLabels,
	downloadSteps,
	parseProgressLine,
	progressTemplate,
	shouldPublishProgress,
	toItemUpdate,
	toJobUpdate,
} from './download-progress.ts';

describe('parseProgressLine', () => {
	// Lines as yt-dlp 2025 prints them for progressTemplate
	it('reads the percent and the speed of a line with an exact size', () => {
		expect(parseProgressLine('luz-progress|1572864|3145728|NA|524288.7')).toEqual({
			percent: 50,
			speedBytesPerSecond: 524_289,
		});
	});

	it('falls back on the estimated size of a fragmented stream', () => {
		expect(parseProgressLine('luz-progress|500|NA|1000|NA')).toEqual({ percent: 50 });
	});

	it('never goes past 100, whatever the estimate', () => {
		expect(parseProgressLine('luz-progress|2000|NA|1000|10')).toEqual({
			percent: 100,
			speedBytesPerSecond: 10,
		});
	});

	it('ignores a line whose size is unknown', () => {
		expect(parseProgressLine('luz-progress|1024|NA|NA|NA')).toBeUndefined();
		expect(parseProgressLine('luz-progress|NA|NA|NA|NA')).toBeUndefined();
	});

	it('ignores everything yt-dlp prints besides our template', () => {
		expect(parseProgressLine('[download] Destination: 7.webm')).toBeUndefined();
		expect(parseProgressLine('[download]  50.0% of 3.00MiB at 1.00MiB/s')).toBeUndefined();
		expect(parseProgressLine('luz-progress|1|2')).toBeUndefined();
		expect(parseProgressLine('')).toBeUndefined();
	});

	it('is the template that prints the lines it reads', () => {
		expect(progressTemplate.startsWith('download:luz-progress|')).toBe(true);
		expect(progressTemplate.split('|')).toHaveLength(5);
	});
});

describe('shouldPublishProgress', () => {
	it('publishes the first update', () => {
		expect(shouldPublishProgress(undefined, 0, 1000)).toBe(true);
	});

	it('holds back a change that comes too soon, and one that changes nothing', () => {
		expect(shouldPublishProgress({ percent: 10, atMs: 1000 }, 11, 1100)).toBe(false);
		expect(shouldPublishProgress({ percent: 10, atMs: 1000 }, 10, 2000)).toBe(false);
	});

	it('publishes a change once the interval has passed', () => {
		expect(shouldPublishProgress({ percent: 10, atMs: 1000 }, 11, 1250)).toBe(true);
	});

	it('always publishes the end', () => {
		expect(shouldPublishProgress({ percent: 99, atMs: 1000 }, 100, 1001)).toBe(true);
		expect(shouldPublishProgress({ percent: 100, atMs: 1000 }, 100, 5000)).toBe(false);
	});
});

describe('steps', () => {
	it('names every step in plain language', () => {
		expect(downloadSteps.map((step) => downloadStepLabels[step])).toEqual([
			'Downloading',
			'Converting',
			'Writing tags',
			'Added to the library',
		]);
	});
});

describe('event payloads', () => {
	const item: DownloadItem = {
		id: 4,
		position: 0,
		sourceId: 'a',
		title: 'First',
		tags: { title: 'First', artists: [] },
		pathWithoutExtension: 'First',
		state: 'running',
		step: 'downloading',
		progressPercent: 40,
		log: ['line'],
	};

	it('keeps the log out of an item update', () => {
		expect(toItemUpdate(item)).toEqual({
			id: 4,
			state: 'running',
			step: 'downloading',
			progressPercent: 40,
		});
	});

	it('keeps the items out of a job update', () => {
		const job: DownloadJob = {
			id: 1,
			url: 'https://example.com',
			kind: 'track',
			title: 'First',
			state: 'running',
			createdAt: 1,
			itemCount: 1,
			completedCount: 0,
			failedCount: 0,
			items: [item],
		};

		expect(toJobUpdate(job)).not.toHaveProperty('items');
		expect(toJobUpdate(job)).toMatchObject({ id: 1, state: 'running' });
	});
});

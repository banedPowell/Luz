import { describe, expect, it } from 'vitest';

import {
	appendToLog,
	createDownloadRequestSchema,
	downloadFailure,
	downloadFailureFromAnalysis,
	finishedJobState,
	isFinishedState,
	maxDownloadItems,
} from './download-jobs.ts';

describe('createDownloadRequestSchema', () => {
	it('accepts an http url and selected item ids', () => {
		expect(
			createDownloadRequestSchema.parse({
				url: ' https://example.com/x ',
				itemIds: ['a', 'b'],
			}),
		).toEqual({ url: 'https://example.com/x', itemIds: ['a', 'b'] });
	});

	it('rejects an empty, duplicated or oversized selection', () => {
		const url = 'https://example.com/x';
		expect(createDownloadRequestSchema.safeParse({ url, itemIds: [] }).success).toBe(false);
		expect(createDownloadRequestSchema.safeParse({ url, itemIds: ['a', 'a'] }).success).toBe(
			false,
		);
		const tooMany = Array.from({ length: maxDownloadItems + 1 }, (_, index) => `${index}`);
		expect(createDownloadRequestSchema.safeParse({ url, itemIds: tooMany }).success).toBe(
			false,
		);
	});

	it('rejects a url that is not http or https, and unknown keys', () => {
		expect(
			createDownloadRequestSchema.safeParse({ url: 'file:///etc', itemIds: ['a'] }).success,
		).toBe(false);
		expect(
			createDownloadRequestSchema.safeParse({
				url: 'https://example.com',
				itemIds: ['a'],
				extra: 1,
			}).success,
		).toBe(false);
	});
});

describe('states', () => {
	it('knows which states are final', () => {
		expect(isFinishedState('queued')).toBe(false);
		expect(isFinishedState('running')).toBe(false);
		expect(isFinishedState('completed')).toBe(true);
		expect(isFinishedState('failed')).toBe(true);
		expect(isFinishedState('cancelled')).toBe(true);
	});

	it('ends a job completed when one item was downloaded, failed otherwise', () => {
		expect(finishedJobState(['failed', 'completed'])).toBe('completed');
		expect(finishedJobState(['failed', 'failed'])).toBe('failed');
	});
});

describe('failures', () => {
	it('maps analysis reasons to download reasons', () => {
		expect(downloadFailureFromAnalysis('network')).toBe('network');
		expect(downloadFailureFromAnalysis('unsupported-url')).toBe('failed');
		expect(downloadFailureFromAnalysis('library-path-unset')).toBe('failed');
	});

	it('gives each reason a plain message', () => {
		expect(downloadFailure('interrupted').message).toMatch(/stopped/);
	});
});

describe('appendToLog', () => {
	it('keeps every line under the cap', () => {
		expect(appendToLog(['a'], ['b', 'c'], 5)).toEqual(['a', 'b', 'c']);
	});

	it('drops the oldest lines past the cap and says how many', () => {
		const log = appendToLog([], ['1', '2', '3', '4', '5', '6'], 4);
		expect(log).toEqual(['… 3 earlier lines dropped', '4', '5', '6']);
		expect(appendToLog(log, ['7', '8'], 4)).toEqual([
			'… 5 earlier lines dropped',
			'6',
			'7',
			'8',
		]);
	});
});
